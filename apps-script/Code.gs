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

const TOKEN_DAYS = 90;        // 登入一次，這台裝置可保持登入的天數
const HASH_ROUNDS = 300;      // 密碼雜湊重複次數
const MAX_LOGIN_FAILS = 5;    // 同一帳號連續輸錯幾次就暫停
const MAX_INVITE_FAILS = 10;  // 邀請碼連續輸錯幾次就暫停
const LOCK_SECONDS = 600;     // 暫停時間（秒）
const DUPLICATE_SECONDS = 5;  // 幾秒內完全相同的送出視為重複
const SITE_URL = 'https://s3602te.github.io/blood_pressure_monitor/';

/* ───────────── 入口 ───────────── */

function doPost(e) {
  const p = (e && e.parameter) || {};
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    switch (p.action) {
      case 'register': return json_(register_(p));
      case 'login':    return json_(login_(p));
      case 'logout':   return json_(logout_(p));
      case 'me':       return json_(me_(p));
      case 'add':      return json_(addRecord_(p));
      case 'list':     return json_(listRecords_(p));
      default:         return json_(fail_('不支援的操作'));
    }
  } catch (err) {
    Logger.log('發生錯誤: ' + err);
    return json_(fail_('伺服器忙碌或發生錯誤，請稍後再試'));
  } finally {
    lock.releaseLock();
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
  if (password.length < 6 || password.length > 64) return fail_('密碼需為 6 到 64 個字元');
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
    if (ss.getSheetByName(sheetName)) return fail_('這個帳號名稱不能使用');
    createDataSheet_(ss, sheetName);
  }

  const salt = sha256_(Utilities.getUuid()).slice(0, 16);
  const displayName = String(p.displayName || '').trim().slice(0, 20) || username;
  accounts.appendRow([username, displayName, sheetName, salt, hashPassword_(salt, password), new Date()]);

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

  const date = String(p.date || '');
  const systolic = toInt_(p.systolic, 50, 300);
  const diastolic = toInt_(p.diastolic, 30, 200);
  const pulse = toInt_(p.pulse, 30, 250);
  const medication = String(p.medication || '');
  const notes = String(p.notes || '').trim().slice(0, 500);
  const stress = (p.stress === undefined || p.stress === '') ? '' : toInt_(p.stress, 0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail_('日期格式不正確');
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

  sheet.appendRow([date, systolic, diastolic, pulse, stress, medication, notes, now, now]);
  return { ok: true };
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

function dateText_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, spreadsheet_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return String(value).slice(0, 10);
}

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function sha256_(text) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
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
  if (Number(v.slice(i + 1)) < Date.now()) return null;
  return findAccount_(v.slice(0, i));
}
