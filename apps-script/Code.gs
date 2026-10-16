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
const ACCOUNT_HEADERS = ['帳號', '顯示名稱', '資料分頁', 'salt', '密碼雜湊', '建立時間'];
const DATA_HEADERS = ['日期', '收縮壓', '舒張壓', '脈搏', '緊張程度', '吃藥狀況', '今日狀況', '建立時間', '修改時間'];

const TOKEN_DAYS = 365;       // 登入一次，這台裝置可保持登入的天數；每天使用會自動續期，等於不會被登出
const HASH_ROUNDS = 300;      // 密碼雜湊重複次數
const MAX_LOGIN_FAILS = 5;    // 同一帳號連續輸錯幾次就暫停
const MAX_INVITE_FAILS = 10;  // 邀請碼連續輸錯幾次就暫停
const MAX_ADMIN_FAILS = 5;    // 管理密碼連續輸錯幾次就暫停
const MIN_PASSWORD = 4;       // 密碼最短字元數（4 碼可以放生日）
const LOCK_SECONDS = 600;     // 暫停時間（秒）
const DUPLICATE_SECONDS = 5;  // 幾秒內完全相同的送出視為重複
const SITE_URL = 'https://s3602te.github.io/blood_pressure_monitor/';

/* ───────────── 入口 ───────────── */

// 會寫入資料的動作才需要搶鎖；單純讀取不用排隊，同時開多個頁面也不會互相等
const WRITE_ACTIONS = ['register', 'login', 'add', 'adminList', 'adminReset'];

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
  appendAccountRow_(accounts, [username, displayName, sheetName, salt, hashPassword_(salt, password), new Date()]);

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

function addRecord_(p) {
  const acc = authenticate_(p.token);
  if (!acc) return authFail_();

  // 每次填寫表單有一個專屬編號；同一個編號只會存一次。
  // 就算網路不穩、手機重送或使用者隔了幾秒再按，也不會存成兩筆。
  const requestId = String(p.requestId || '').slice(0, 64);
  const cache = CacheService.getScriptCache();
  const requestKey = requestId ? 'req_' + acc.username.toLowerCase() + '_' + requestId : '';
  if (requestKey && cache.get(requestKey)) return { ok: true, duplicate: true };

  const date = String(p.date || '');
  const systolic = toInt_(p.systolic, 50, 300);
  const diastolic = toInt_(p.diastolic, 30, 200);
  const pulse = toInt_(p.pulse, 30, 250);
  const medication = String(p.medication || '');
  const notes = String(p.notes || '').trim().slice(0, 500);

  if (!validDate_(date)) return fail_('日期格式不正確');
  if (date > Utilities.formatDate(new Date(), sheetTz_(), 'yyyy-MM-dd')) return fail_('日期不能是未來的日子');
  if (systolic === null) return fail_('收縮壓請輸入 50 到 300 之間的數字');
  if (diastolic === null) return fail_('舒張壓請輸入 30 到 200 之間的數字');
  if (pulse === null) return fail_('脈搏請輸入 30 到 250 之間的數字');
  if (medication !== '有吃' && medication !== '沒吃') return fail_('請選擇吃藥狀況');

  const sheet = dataSheet_(acc);
  const now = new Date();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const last = sheet.getRange(lastRow, 1, 1, 9).getValues()[0];
    const lastDate = dateText_(last[0]);
    const created = last[7] instanceof Date ? last[7].getTime() : 0;
    const same = lastDate === date &&
      Number(last[1]) === systolic && Number(last[2]) === diastolic && Number(last[3]) === pulse &&
      String(last[5]) === medication && String(last[6]) === notes;
    if (same && now.getTime() - created < DUPLICATE_SECONDS * 1000) {
      return { ok: true, duplicate: true };
    }
  }

  sheet.appendRow([date, systolic, diastolic, pulse, '', medication, plainText_(notes), now, now]);
  if (requestKey) cache.put(requestKey, '1', 600);
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

function sendDiscordReminder() {
  const webhookUrl = prop_('DISCORD_WEBHOOK');
  if (!webhookUrl) {
    Logger.log('尚未設定 DISCORD_WEBHOOK，略過提醒');
    return;
  }
  const payload = {
    content: '🔔 **量血壓提醒**：記得測量血壓，並到這裡記錄：' + SITE_URL,
    username: 'BloodPressureBot'
  };
  try {
    const res = UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    Logger.log('Discord Webhook 回應: ' + res.getResponseCode());
  } catch (err) {
    Logger.log('發送 Discord 通知時發生錯誤: ' + err);
  }
}

// 執行一次即可：每天 03:01、07:00、21:45 提醒
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDiscordReminder') ScriptApp.deleteTrigger(t);
  });
  [[3, 1], [7, 0], [21, 45]].forEach(function (hm) {
    ScriptApp.newTrigger('sendDiscordReminder')
      .timeBased().everyDays(1).atHour(hm[0]).nearMinute(hm[1]).create();
  });
}

/* ───────────── 管理者工具 ───────────── */

// 管理頁面（admin.html）使用。要先在「指令碼屬性」設定 ADMIN_CODE，沒設定就完全關閉。
function adminCheck_(p) {
  const code = prop_('ADMIN_CODE');
  if (!code) return fail_('尚未設定管理密碼，請先在指令碼屬性新增 ADMIN_CODE');
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('admin_fails') || 0);
  if (fails >= MAX_ADMIN_FAILS) return fail_('嘗試次數過多，請 10 分鐘後再試');
  if (String(p.adminCode || '') !== code) {
    cache.put('admin_fails', String(fails + 1), LOCK_SECONDS);
    return fail_('管理密碼不正確');
  }
  cache.remove('admin_fails');
  return null; // 通過
}

function adminList_(p) {
  const denied = adminCheck_(p);
  if (denied) return denied;
  const rows = accountSheet_().getDataRange().getValues();
  const accounts = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== '') accounts.push({ username: String(rows[i][0]), displayName: String(rows[i][1]) });
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
        username: String(rows[i][0]),
        displayName: String(rows[i][1]),
        sheetName: String(rows[i][2]),
        salt: String(rows[i][3]),
        hash: String(rows[i][4])
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
  return acc;
}
