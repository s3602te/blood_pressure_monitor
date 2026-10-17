/**
 * 血壓記錄 — Google Apps Script 後端（可安全上傳 git，內含零機密）
 *
 * 機密設定請放在「專案設定 → 指令碼屬性」，不要寫進程式碼：
 *   REGISTER_CODE    註冊邀請碼（必填；沒設定就沒有人能註冊）
 *   DISCORD_WEBHOOK  Discord 提醒用的 webhook 網址（選填）
 *   SPREADSHEET_ID   試算表 ID（選填；指令碼綁在試算表內可省略）
 *   LEGACY_OWNER     舊資料（「工作表1」）的主人帳號（選填，例如 mom）
 *
 * 試算表結構：
 *   「帳號」分頁：記錄所有帳號（密碼只存加鹽雜湊，不存明碼）
 *   其他分頁：每個帳號一個，分頁名稱＝帳號名稱（舊資料沿用「工作表1」）
 */

const ACCOUNT_SHEET = '帳號';
const LEGACY_SHEET = '工作表1';
const ACCOUNT_HEADERS = ['帳號', '顯示名稱', '資料分頁', 'salt', '密碼雜湊', '建立時間', '最後使用'];
const LAST_SEEN_COLUMN = 7;   // 「最後使用」在帳號分頁的第幾欄（管理頁用來看誰很久沒用）
const DATA_HEADERS = ['日期', '收縮壓', '舒張壓', '脈搏', '緊張程度', '吃藥狀況', '今日狀況', '建立時間', '修改時間'];

const TOKEN_DAYS = 365;       // 登入一次，這台裝置可保持登入的天數；每天使用會自動續期，等於不會被登出
const HASH_ROUNDS = 300;      // 密碼雜湊重複次數
const MAX_LOGIN_FAILS = 5;    // 同一帳號連續輸錯幾次就暫停
const MAX_INVITE_FAILS = 10;  // 邀請碼連續輸錯幾次就暫停
const MAX_ADMIN_FAILS = 5;    // 管理密碼連續輸錯幾次就暫停
const MIN_PASSWORD = 4;       // 密碼最短字元數（4 碼可以放生日）
const LOCK_SECONDS = 600;     // 暫停時間（秒）
const DUPLICATE_SECONDS = 5;  // 幾秒內完全相同的送出視為重複
const BACKUP_FOLDER = '血壓記錄備份'; // 備份存放的資料夾（和試算表放在同一個地方）
const BACKUP_KEEP = 2;        // 保留最近幾份備份，更舊的自動丟進垃圾桶（每週一份＝約 2 週）。份數少，試算表首頁才不會被備份檔塞滿
const REQUEST_ID_SECONDS = 21600; // 同一次填寫編號的記憶時間（6 小時，已是快取允許的最長時間）
const SITE_URL = 'https://s3602te.github.io/blood_pressure_monitor/';

/* ───────────── 入口 ───────────── */

// 會寫入資料的動作才需要搶鎖；單純讀取不用排隊，同時開多個頁面也不會互相等
const WRITE_ACTIONS = ['register', 'login', 'add', 'update', 'delete', 'adminList', 'adminReset'];

function doPost(e) {
  const p = (e && e.parameter) || {};
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    if (WRITE_ACTIONS.indexOf(p.action) !== -1) {
      lock.waitLock(30000);
      locked = true;
    }
    switch (p.action) {
      case 'ping':     return json_({ ok: true }); // 登入頁先喚醒伺服器，登入時就不必等冷啟動
      case 'register': return json_(register_(p));
      case 'login':    return json_(login_(p));
      case 'logout':   return json_(logout_(p));
      case 'me':       return json_(me_(p));
      case 'add':      return json_(addRecord_(p));
      case 'update':   return json_(updateRecord_(p));
      case 'delete':   return json_(deleteRecord_(p));
      case 'list':     return json_(listRecords_(p));
      case 'adminList':  return json_(adminList_(p));
      case 'adminReset': return json_(adminReset_(p));
      default:         return json_(fail_('不支援的操作'));
    }
  } catch (err) {
    Logger.log('發生錯誤: ' + err);
    return json_(fail_('伺服器忙碌或發生錯誤，請稍後再試'));
  } finally {
    if (locked) lock.releaseLock();
  }
}

// 舊版前端用 GET 讀取全部資料，現在改成必須登入，所以 GET 不再回傳任何資料
function doGet() {
  return json_(fail_('請從血壓記錄網頁登入使用'));
}

/* ───────────── 帳號 ───────────── */

function register_(p) {
  const code = prop_('REGISTER_CODE');
  if (!code) return fail_('尚未開放註冊，請管理員先設定邀請碼');

  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('invite_fails') || 0);
  if (fails >= MAX_INVITE_FAILS) return fail_('嘗試次數過多，請 10 分鐘後再試');
  if (String(p.inviteCode || '') !== code) {
    cache.put('invite_fails', String(fails + 1), LOCK_SECONDS);
    return fail_('邀請碼不正確');
  }

  const username = String(p.username || '').trim();
  const password = String(p.password || '');
  if (!/^[A-Za-z0-9_一-龥]{2,20}$/.test(username)) {
    return fail_('帳號需為 2 到 20 個中文、英文、數字或底線');
  }
  if (password.length < MIN_PASSWORD || password.length > 64) {
    return fail_('密碼需為 ' + MIN_PASSWORD + ' 到 64 個字元');
  }
  if (username === ACCOUNT_SHEET) return fail_('這個帳號名稱不能使用');
  if (findAccount_(username)) return fail_('這個帳號已經有人使用');

  const ss = spreadsheet_();
  const accounts = accountSheet_();
  let sheetName = username;

  const legacyOwner = prop_('LEGACY_OWNER');
  const legacyFree = ss.getSheetByName(LEGACY_SHEET) && !isSheetInUse_(accounts, LEGACY_SHEET);
  if (legacyOwner && legacyOwner.toLowerCase() === username.toLowerCase() && legacyFree) {
    sheetName = LEGACY_SHEET; // 接手舊資料
  } else {
    const existing = ss.getSheetByName(sheetName);
    if (existing) {
      // 上次建立到一半留下的空分頁可以重用；已經有人用或有資料的分頁不行
      if (isSheetInUse_(accounts, sheetName) || existing.getLastRow() > 1) {
        return fail_('這個帳號名稱不能使用');
      }
    } else {
      createDataSheet_(ss, sheetName);
    }
  }

  const salt = sha256_(Utilities.getUuid()).slice(0, 16);
  const displayName = String(p.displayName || '').trim().slice(0, 20) || username;
  appendAccountRow_(accounts, [username, displayName, sheetName, salt, hashPassword_(salt, password), new Date(), new Date()]);
  ensureLastSeenHeader_(accounts);

  return { ok: true, token: issueToken_(username), username: username, displayName: displayName };
}

function login_(p) {
  const username = String(p.username || '').trim();
  const password = String(p.password || '');
  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + username.toLowerCase().slice(0, 40);
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_LOGIN_FAILS) return fail_('嘗試次數過多，請 10 分鐘後再試');

  const acc = findAccount_(username);
  if (!acc || hashPassword_(acc.salt, password) !== acc.hash) {
    cache.put(failKey, String(fails + 1), LOCK_SECONDS);
    return fail_('帳號或密碼不正確');
  }
  cache.remove(failKey);
  touchLastSeen_(acc.row);
  return { ok: true, token: issueToken_(acc.username), username: acc.username, displayName: acc.displayName };
}

function logout_(p) {
  if (p.token) PropertiesService.getScriptProperties().deleteProperty('tok_' + sha256_(String(p.token)));
  return { ok: true };
}

function me_(p) {
  const acc = authenticate_(p.token);
  if (!acc) return authFail_();
  return { ok: true, username: acc.username, displayName: acc.displayName };
}

/* ───────────── 血壓資料 ───────────── */

// 新增與修改共用的檢查：通過就回傳整理好的數值，沒通過回傳 { error: '原因' }
function parseRecord_(p) {
  const date = String(p.date || '');
  const systolic = toInt_(p.systolic, 50, 300);
  const diastolic = toInt_(p.diastolic, 30, 200);
  const pulse = toInt_(p.pulse, 30, 250);
  const medication = String(p.medication || '');
  const notes = String(p.notes || '').trim().slice(0, 500);

  if (!validDate_(date)) return { error: '日期格式不正確' };
  if (date > Utilities.formatDate(new Date(), sheetTz_(), 'yyyy-MM-dd')) return { error: '日期不能是未來的日子' };
  if (systolic === null) return { error: '收縮壓請輸入 50 到 300 之間的數字' };
  if (diastolic === null) return { error: '舒張壓請輸入 30 到 200 之間的數字' };
  if (pulse === null) return { error: '脈搏請輸入 30 到 250 之間的數字' };
  if (medication !== '有吃' && medication !== '沒吃') return { error: '請選擇吃藥狀況' };
  return { date: date, systolic: systolic, diastolic: diastolic, pulse: pulse, medication: medication, notes: notes };
}

// 手機沒訊號時資料會先暫存，補送時帶上當初按下儲存的時間；刪除後按「復原」也會帶回原本的時間，
// 這樣早上／晚上的判斷才不會錯。只接受「過去 3 年內、不是未來」的時間，其餘一律用伺服器現在的時間。
function validClientTime_(value) {
  const n = Number(value);
  if (!n) return null;
  const now = Date.now();
  if (n > now + 300000 || n < now - 1100 * 86400000) return null;
  return new Date(n);
}

function addRecord_(p) {
  const acc = authenticate_(p.token);
  if (!acc) return authFail_();

  // 每次填寫表單有一個專屬編號；同一個編號只會存一次。
  // 就算網路不穩、手機重送或使用者隔了幾秒再按，也不會存成兩筆。
  const requestId = String(p.requestId || '').slice(0, 64);
  const cache = CacheService.getScriptCache();
  const requestKey = requestId ? 'req_' + acc.username.toLowerCase() + '_' + requestId : '';
  if (requestKey && cache.get(requestKey)) return { ok: true, duplicate: true };

  const rec = parseRecord_(p);
  if (rec.error) return fail_(rec.error);

  const sheet = dataSheet_(acc);
  const now = new Date();
  const created = validClientTime_(p.clientAt) || now;
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const last = sheet.getRange(lastRow, 1, 1, 9).getValues()[0];
    const lastDate = dateText_(last[0]);
    const lastCreated = last[7] instanceof Date ? last[7].getTime() : 0;
    const same = lastDate === rec.date &&
      Number(last[1]) === rec.systolic && Number(last[2]) === rec.diastolic && Number(last[3]) === rec.pulse &&
      String(last[5]) === rec.medication && String(last[6]) === rec.notes;
    if (same && now.getTime() - lastCreated < DUPLICATE_SECONDS * 1000) {
      return { ok: true, duplicate: true };
    }
  }

  sheet.appendRow([rec.date, rec.systolic, rec.diastolic, rec.pulse, '', rec.medication, plainText_(rec.notes), created, now]);
  if (requestKey) cache.put(requestKey, '1', REQUEST_ID_SECONDS);
  return { ok: true };
}

// 修改或刪除前，確認這一列還是使用者當初看到的那一筆（日期和建立時間都要對得上）。
// 萬一有人在試算表裡插入、刪除過列，列號會對不上，就拒絕，避免改到別筆。找不到回傳 0。
function locateRow_(sheet, p) {
  const row = Number(p.row);
  if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) return 0;
  const r = sheet.getRange(row, 1, 1, 8).getValues()[0];
  const created = r[7] instanceof Date ? r[7].getTime() : 0;
  if (dateText_(r[0]) !== String(p.origDate || '') || created !== Number(p.origAt || 0)) return 0;
  return row;
}

const STALE_MESSAGE = '這筆紀錄已經有變動，請回到歷史頁重新整理後再試';

function updateRecord_(p) {
  const acc = authenticate_(p.token);
  if (!acc) return authFail_();

  const rec = parseRecord_(p);
  if (rec.error) return fail_(rec.error);

  const sheet = dataSheet_(acc);
  const row = locateRow_(sheet, p);
  if (!row) return fail_(STALE_MESSAGE, 'STALE');

  const range = sheet.getRange(row, 1, 1, 9);
  const v = range.getValues()[0];
  v[0] = rec.date;
  v[1] = rec.systolic;
  v[2] = rec.diastolic;
  v[3] = rec.pulse;
  v[5] = rec.medication;
  v[6] = plainText_(rec.notes);
  v[8] = new Date();
  range.setValues([v]);
  return { ok: true };
}

function deleteRecord_(p) {
  const acc = authenticate_(p.token);
  if (!acc) return authFail_();

  const sheet = dataSheet_(acc);
  const row = locateRow_(sheet, p);
  if (!row) return fail_(STALE_MESSAGE, 'STALE');

  sheet.deleteRow(row);
  return { ok: true };
}

// 以 = + - @ 開頭的文字，試算表會當成公式執行（可能讀到別人的資料），所以加上單引號強制當純文字
function plainText_(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function validDate_(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parts = text.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.getFullYear() === parts[0] && d.getMonth() === parts[1] - 1 && d.getDate() === parts[2];
}

function listRecords_(p) {
  const acc = authenticate_(p.token);
  if (!acc) return authFail_();

  const rows = dataSheet_(acc).getDataRange().getValues();
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === '' || r[0] === null) continue;
    records.push({
      row: i + 1,
      date: dateText_(r[0]),
      sys: Number(r[1]),
      dia: Number(r[2]),
      pulse: Number(r[3]),
      med: String(r[5]),
      notes: String(r[6]),
      at: r[7] instanceof Date ? r[7].getTime() : 0
    });
  }
  return { ok: true, displayName: acc.displayName, records: records };
}

/* ───────────── Discord 提醒 ───────────── */

// 有事情要立刻讓管理者知道（例如有人一直猜管理密碼、備份失敗、提醒大家量血壓）。沒設定 DISCORD_WEBHOOK 就略過。
function notifyDiscord_(text) {
  const url = prop_('DISCORD_WEBHOOK');
  if (!url) return;
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ content: text, username: 'BloodPressureBot' }),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log('發送 Discord 通知時發生錯誤: ' + err);
  }
}

// 每天早上（07:00）、晚上（21:45）各提醒一次，而且「只提醒那個時段還沒記錄的人」；大家都記錄了就不發。
// 沒有設定 DISCORD_WEBHOOK 就略過。
function sendMorningReminder() { sendReminder_('morning'); }
function sendEveningReminder() { sendReminder_('evening'); }

// 舊版的排程還在用這個名字：依現在的時間判斷是早上還是晚上（重新執行 setupTriggers 之後就不會再用到）
function sendDiscordReminder() {
  sendReminder_(Number(Utilities.formatDate(new Date(), sheetTz_(), 'H')) < 12 ? 'morning' : 'evening');
}

function sendReminder_(slot) {
  if (!prop_('DISCORD_WEBHOOK')) {
    Logger.log('尚未設定 DISCORD_WEBHOOK，略過提醒');
    return;
  }
  const missing = accountsMissing_(slot);
  if (!missing.length) {
    Logger.log('大家這個時段都記錄了，不提醒');
    return;
  }
  const label = slot === 'morning' ? '早上' : '晚上';
  notifyDiscord_('🔔 **量血壓提醒**：' + missing.join('、') + ' 今天' + label + '還沒記錄血壓，量完記得到這裡記錄：' + SITE_URL);
}

// 今天這個時段還沒有記錄的帳號（顯示名稱）。時段的算法和網站相同：凌晨 4 點到中午 12 點前是早上，其餘是晚上。
function accountsMissing_(slot) {
  const ss = spreadsheet_();
  const tz = sheetTz_();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const rows = accountSheet_().getDataRange().getValues();
  const missing = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === '') continue;
    let done = false;
    const sheet = ss.getSheetByName(String(rows[i][2]));
    if (sheet && sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
      for (let r = 0; r < data.length && !done; r++) {
        if (dateText_(data[r][0]) !== today) continue;
        const created = data[r][7];
        const hour = created instanceof Date ? Number(Utilities.formatDate(created, tz, 'H')) : 0;
        const isMorning = !(created instanceof Date) || (hour >= 4 && hour < 12);
        if ((slot === 'morning') === isMorning) done = true;
      }
    }
    if (!done) missing.push(String(rows[i][1]) || String(rows[i][0]));
  }
  return missing;
}

// 執行一次即可：設定每天 07:00（早上）、21:45（晚上）的提醒排程。重複執行沒關係，會先刪掉舊的再建立。
const REMINDER_HANDLERS = ['sendDiscordReminder', 'sendMorningReminder', 'sendEveningReminder'];

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (REMINDER_HANDLERS.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  [['sendMorningReminder', 7, 0], ['sendEveningReminder', 21, 45]].forEach(function (x) {
    ScriptApp.newTrigger(x[0]).timeBased().everyDays(1).atHour(x[1]).nearMinute(x[2]).create();
  });
}

/* ───────────── 每週自動備份 ───────────── */

// 把整份試算表匯出成一個 Excel 檔（.xlsx），存在「血壓記錄備份」資料夾。只保留最近 BACKUP_KEEP 份。
// 為什麼用 .xlsx：檔案是「匯出一份複本」，不是 Google 試算表，不會被當成另一份可編輯的正本。
// 注意：在雲端硬碟打開 .xlsx 時，Google 試算表會直接開啟它，並把它列在試算表首頁的「最近」裡，
// 所以只保留最近 BACKUP_KEEP 份，避免首頁被備份檔塞滿；用不到的備份可以手動從首頁「移除」。
// 需要還原時，在雲端硬碟對 .xlsx 按右鍵 →「開啟方式」→「Google 試算表」就能看。
// 檔案很小（只有文字和數字，一份大約幾百 KB），而且只留最近 BACKUP_KEEP 份，幾乎不佔空間。
function backupSpreadsheet() {
  try {
    const id = spreadsheet_().getId();
    const file = DriveApp.getFileById(id);
    const parents = file.getParents();
    const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
    const folders = parent.getFoldersByName(BACKUP_FOLDER);
    const folder = folders.hasNext() ? folders.next() : parent.createFolder(BACKUP_FOLDER);

    const name = '血壓備份 ' + Utilities.formatDate(new Date(), sheetTz_(), 'yyyy-MM-dd');
    // 同一天重跑，只留最新的一份（舊格式「不含 .xlsx」的同名備份也一併換掉）
    [name, name + '.xlsx'].forEach(function (n) {
      const same = folder.getFilesByName(n);
      while (same.hasNext()) same.next().setTrashed(true);
    });

    let format = 'xlsx';
    try {
      folder.createFile(exportXlsx_(id).setName(name + '.xlsx'));
    } catch (err) {
      // 匯出 Excel 失敗時，退而求其次複製成 Google 試算表，至少有一份備份（但它會出現在試算表首頁）
      format = 'Google 試算表（複製）';
      Logger.log('匯出 Excel 失敗，改用複製：' + err);
      notifyDiscord_('ℹ️ 血壓記錄備份：匯出 Excel 失敗（' + err + '），這次改用複製成 Google 試算表，檔名「' + name + '」。');
      file.makeCopy(name, folder);
    }

    const backups = [];
    const all = folder.getFiles();
    while (all.hasNext()) {
      const f = all.next();
      if (f.getName().indexOf('血壓備份 ') === 0) backups.push(f);
    }
    backups.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
    backups.slice(BACKUP_KEEP).forEach(function (f) { f.setTrashed(true); });
    Logger.log('已備份（' + format + '）：' + name + '（目前保留 ' + Math.min(backups.length, BACKUP_KEEP) + ' 份）');
  } catch (err) {
    Logger.log('備份失敗: ' + err);
    notifyDiscord_('⚠️ 血壓記錄的每週自動備份失敗了：' + err);
    throw err;
  }
}

function exportXlsx_(spreadsheetId) {
  const res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?format=xlsx', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('匯出失敗（' + res.getResponseCode() + '）');
  return res.getBlob();
}

// 執行一次即可：設定每週日凌晨 3 點自動備份，並且馬上備份一次（第一次執行 Google 會要你授權存取雲端硬碟）。
function setupBackup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupSpreadsheet') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupSpreadsheet').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  backupSpreadsheet();
}

/* ───────────── 管理者工具 ───────────── */

// 管理頁面（admin.html）使用。要先在「指令碼屬性」設定 ADMIN_CODE，沒設定就完全關閉。
function adminCheck_(p) {
  const code = prop_('ADMIN_CODE');
  if (!code) return fail_('尚未設定管理密碼，請先在指令碼屬性新增 ADMIN_CODE');
  const cache = CacheService.getScriptCache();

  const lockedUntil = Number(cache.get('admin_lock') || 0);
  if (lockedUntil > Date.now()) {
    return fail_('嘗試次數過多，請 ' + Math.ceil((lockedUntil - Date.now()) / 60000) + ' 分鐘後再試');
  }

  if (!safeEqual_(String(p.adminCode || ''), code)) {
    const fails = Number(cache.get('admin_fails') || 0) + 1;
    if (fails >= MAX_ADMIN_FAILS) {
      // 每鎖一次，下一次就鎖更久：10 分鐘 → 1 小時 → 6 小時（快取最長只能記 6 小時）
      const strikes = Number(cache.get('admin_strikes') || 0) + 1;
      const seconds = Math.min(LOCK_SECONDS * Math.pow(6, strikes - 1), 21600);
      cache.put('admin_strikes', String(strikes), 21600);
      cache.put('admin_lock', String(Date.now() + seconds * 1000), 21600);
      cache.remove('admin_fails');
      notifyDiscord_('🚨 管理頁面被連續輸錯密碼 ' + fails + ' 次，已暫停 ' + Math.round(seconds / 60) +
        ' 分鐘（這是第 ' + strikes + ' 次）。如果不是你本人，請更換 ADMIN_CODE。');
      return fail_('管理密碼不正確，嘗試次數過多，已暫停一段時間');
    }
    cache.put('admin_fails', String(fails), LOCK_SECONDS);
    return fail_('管理密碼不正確');
  }
  cache.remove('admin_fails');
  cache.remove('admin_strikes');
  return null; // 通過
}

function adminList_(p) {
  const denied = adminCheck_(p);
  if (denied) return denied;
  const ss = spreadsheet_();
  const rows = accountSheet_().getDataRange().getValues();
  const accounts = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === '') continue;

    // 最後記錄：這個帳號的資料分頁裡，最新一筆的建立時間
    let lastRecord = 0;
    let count = 0;
    const sheet = ss.getSheetByName(String(rows[i][2]));
    if (sheet && sheet.getLastRow() > 1) {
      const times = sheet.getRange(2, 8, sheet.getLastRow() - 1, 1).getValues();
      count = times.length;
      times.forEach(function (r) {
        if (r[0] instanceof Date && r[0].getTime() > lastRecord) lastRecord = r[0].getTime();
      });
    }
    const seen = rows[i][LAST_SEEN_COLUMN - 1];
    accounts.push({
      username: String(rows[i][0]),
      displayName: String(rows[i][1]),
      lastSeen: seen instanceof Date ? seen.getTime() : 0,
      lastRecord: lastRecord,
      count: count
    });
  }
  return { ok: true, accounts: accounts };
}

function adminReset_(p) {
  const denied = adminCheck_(p);
  if (denied) return denied;
  const password = String(p.newPassword || '');
  if (password.length < MIN_PASSWORD || password.length > 64) {
    return fail_('新密碼需為 ' + MIN_PASSWORD + ' 到 64 個字元');
  }
  if (!setPassword_(String(p.username || ''), password)) return fail_('找不到這個帳號');
  return { ok: true };
}

// 換掉密碼；同時讓該帳號在所有裝置登出，並解除輸錯密碼造成的暫停。找不到帳號回傳 false。
function setPassword_(username, newPassword) {
  const sheet = accountSheet_();
  const rows = sheet.getDataRange().getValues();
  const key = String(username).trim().toLowerCase();
  if (!key) return false;
  let row = 0;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === key) { row = i + 1; break; }
  }
  if (!row) return false;

  const salt = sha256_(Utilities.getUuid()).slice(0, 16);
  sheet.getRange(row, 4, 1, 2).setValues([[salt, hashPassword_(salt, newPassword)]]);

  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('tok_') === 0 && all[k].slice(0, all[k].lastIndexOf('|')).toLowerCase() === key) {
      props.deleteProperty(k);
    }
  });
  CacheService.getScriptCache().remove('fail_' + key.slice(0, 40));
  return true;
}

// 備用：不想用管理頁面時，改好下面兩個值，在編輯器選 resetPassword 按「執行」（不需要重新部署）。
// 做完請把兩個值改回提示文字，不要把密碼留在程式碼裡。
function resetPassword() {
  const USERNAME = '在這裡填帳號';
  const NEW_PASSWORD = '在這裡填新密碼';

  if (NEW_PASSWORD.length < MIN_PASSWORD || NEW_PASSWORD.length > 64) {
    throw new Error('新密碼需為 ' + MIN_PASSWORD + ' 到 64 個字元');
  }
  if (!setPassword_(USERNAME, NEW_PASSWORD)) throw new Error('找不到帳號：' + USERNAME);
  Logger.log('已重設 ' + USERNAME + ' 的密碼，請記得把程式碼裡的帳號與密碼改回提示文字');
}

/* ───────────── 內部工具 ───────────── */

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function spreadsheet_() {
  const id = prop_('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(message, code) {
  return { ok: false, error: message, code: code || 'ERROR' };
}

function authFail_() {
  return fail_('登入已過期，請重新登入', 'AUTH');
}

// 比對機密字串：先各自轉成固定長度的雜湊，再逐字比到最後，不會因為前面幾個字不同就提早結束
function safeEqual_(a, b) {
  const x = sha256_(a);
  const y = sha256_(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

function toInt_(value, min, max) {
  const n = Number(value);
  return (value !== '' && Number.isInteger(n) && n >= min && n <= max) ? n : null;
}

// 時區每次執行只查一次（以前每筆紀錄都重新打開試算表查，紀錄一多就很慢）
let sheetTimeZone_ = null;
function sheetTz_() {
  if (!sheetTimeZone_) sheetTimeZone_ = spreadsheet_().getSpreadsheetTimeZone();
  return sheetTimeZone_;
}

function dateText_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, sheetTz_(), 'yyyy-MM-dd');
  return String(value).slice(0, 10);
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

// 純 JavaScript 的 SHA-256（輸出與 Utilities.computeDigest 相同）。
// 雜湊要重複好幾百次，用 Google 服務呼叫每次都有延遲，會讓登入、註冊卡很久並長時間占住鎖。
function sha256_(text) {
  const s = unescape(encodeURIComponent(String(text))); // UTF-8
  const n = s.length;
  const total = (((n + 8) >> 6) + 1) * 16;
  const w = [];
  for (let i = 0; i < total; i++) w.push(0);
  for (let i = 0; i < n; i++) w[i >> 2] |= s.charCodeAt(i) << (24 - (i % 4) * 8);
  w[n >> 2] |= 0x80 << (24 - (n % 4) * 8);
  w[total - 1] = n * 8;

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const x = new Array(64);
  for (let blk = 0; blk < total; blk += 16) {
    for (let t = 0; t < 16; t++) x[t] = w[blk + t];
    for (let t = 16; t < 64; t++) {
      const p = x[t - 15], q = x[t - 2];
      const s0 = ((p >>> 7) | (p << 25)) ^ ((p >>> 18) | (p << 14)) ^ (p >>> 3);
      const s1 = ((q >>> 17) | (q << 15)) ^ ((q >>> 19) | (q << 13)) ^ (q >>> 10);
      x[t] = (x[t - 16] + s0 + x[t - 7] + s1) | 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (k + S1 + ch + SHA256_K[t] + x[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + k) | 0;
  }
  return h.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
}

function hashPassword_(salt, password) {
  let h = salt + ':' + password;
  for (let i = 0; i < HASH_ROUNDS; i++) h = sha256_(h + salt);
  return h;
}

function accountSheet_() {
  const ss = spreadsheet_();
  let sheet = ss.getSheetByName(ACCOUNT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ACCOUNT_SHEET);
    sheet.getRange('A:E').setNumberFormat('@'); // 純文字，避免像 123e4 的雜湊被當成數字
    sheet.appendRow(ACCOUNT_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, ACCOUNT_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// 帳號、分頁名稱、salt、雜湊一律存成純文字，避免電話開頭的 0 被試算表吃掉
function appendAccountRow_(sheet, values) {
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, 5).setNumberFormat('@');
  sheet.getRange(row, 1, 1, values.length).setValues([values.map(function (v, i) {
    return i < 5 ? String(v) : v;
  })]);
}

function createDataSheet_(ss, name) {
  const sheet = ss.insertSheet(name);
  sheet.appendRow(DATA_HEADERS);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, DATA_HEADERS.length).setFontWeight('bold');
  return sheet;
}

function dataSheet_(acc) {
  const ss = spreadsheet_();
  return ss.getSheetByName(acc.sheetName) || createDataSheet_(ss, acc.sheetName);
}

function isSheetInUse_(accounts, sheetName) {
  const rows = accounts.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (String(rows[i][2]) === sheetName) return true;
  return false;
}

function findAccount_(username) {
  const key = String(username).trim().toLowerCase();
  if (!key) return null;
  const rows = accountSheet_().getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === key) {
      return {
        row: i + 1,
        username: String(rows[i][0]),
        displayName: String(rows[i][1]),
        sheetName: String(rows[i][2]),
        salt: String(rows[i][3]),
        hash: String(rows[i][4]),
        lastSeen: rows[i][LAST_SEEN_COLUMN - 1]
      };
    }
  }
  return null;
}

// 登入權杖：只存雜湊，過期自動清除
function issueToken_(username) {
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  const all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('tok_') === 0) {
      const v = all[k];
      if (Number(v.slice(v.lastIndexOf('|') + 1)) < now) props.deleteProperty(k);
    }
  });
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  props.setProperty('tok_' + sha256_(token), username + '|' + (now + TOKEN_DAYS * 86400000));
  return token;
}

function authenticate_(token) {
  if (!token) return null;
  const v = prop_('tok_' + sha256_(String(token)));
  if (!v) return null;
  const i = v.lastIndexOf('|');
  const expires = Number(v.slice(i + 1));
  const now = Date.now();
  if (expires < now) return null;
  const acc = findAccount_(v.slice(0, i));
  // 每天使用就自動延長期限（一天最多寫入一次），常用的裝置不會被登出
  if (acc && expires - now < (TOKEN_DAYS - 1) * 86400000) {
    PropertiesService.getScriptProperties().setProperty(
      'tok_' + sha256_(String(token)), v.slice(0, i) + '|' + (now + TOKEN_DAYS * 86400000));
  }
  if (acc) touchLastSeenIfStale_(acc);
  return acc;
}

// 「最後使用」：這個帳號最近一次打開網站的時間。一個帳號一天最多寫入一次，不會拖慢每次讀取。
function touchLastSeenIfStale_(acc) {
  const last = acc.lastSeen instanceof Date ? acc.lastSeen.getTime() : 0;
  if (Date.now() - last > 20 * 3600 * 1000) touchLastSeen_(acc.row);
}

function touchLastSeen_(row) {
  const sheet = accountSheet_();
  ensureLastSeenHeader_(sheet);
  sheet.getRange(row, LAST_SEEN_COLUMN).setValue(new Date());
}

// 早期建立的帳號分頁沒有「最後使用」這一欄的標題，補上
function ensureLastSeenHeader_(sheet) {
  const cell = sheet.getRange(1, LAST_SEEN_COLUMN);
  if (!cell.getValue()) cell.setValue(ACCOUNT_HEADERS[LAST_SEEN_COLUMN - 1]).setFontWeight('bold');
}
