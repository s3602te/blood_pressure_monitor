// 後端 Code.gs 的模擬測試（一）：新增／修改／刪除紀錄、補送時間、管理密碼鎖定、備份。
// 用 Node 的 vm 載入 Code.gs，Google 的服務（試算表、Drive、快取…）都是假的。執行：npm run test:backend
const vm = require("vm");
const fs = require("fs");
const code = fs.readFileSync(require("path").join(__dirname, "..", "Code.gs"), "utf8");

// ---- 假的 Google 服務 ----
const props = { ADMIN_CODE: "secret-admin", REGISTER_CODE: "x" };
const cacheStore = {};
let sheetRows = [
  ["日期", "收縮壓", "舒張壓", "脈搏", "緊張程度", "吃藥狀況", "今日狀況", "建立時間", "修改時間"],
  ["2026-10-15", 130, 80, 70, 0, "有吃", "", new Date("2026-10-15T07:30:00+08:00"), new Date("2026-10-15T07:30:00+08:00")],
  ["2026-10-16", 140, 90, 80, "", "沒吃", "累", new Date("2026-10-16T14:10:00Z"), new Date("2026-10-16T14:10:00Z")],
];
const sheet = {
  getLastRow: () => sheetRows.length,
  getDataRange: () => ({ getValues: () => sheetRows.map(r => r.slice()) }),
  getRange(r, c, nr, nc) {
    return {
      getValues: () => [sheetRows[r - 1].slice(c - 1, c - 1 + nc)],
      setValues: v => { for (let i = 0; i < nc; i++) sheetRows[r - 1][c - 1 + i] = v[0][i]; },
    };
  },
  appendRow: v => sheetRows.push(v),
  deleteRow: r => sheetRows.splice(r - 1, 1),
};
const ctx = {
  Date, Number, Math, String, Object, Array, JSON, console, Logger: { log: () => {} },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => (props[k] = v),
    deleteProperty: k => delete props[k], getProperties: () => ({ ...props }) }) },
  CacheService: { getScriptCache: () => ({
    get: k => (k in cacheStore ? cacheStore[k] : null), put: (k, v) => (cacheStore[k] = v), remove: k => delete cacheStore[k] }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSpreadsheetTimeZone: () => "Asia/Taipei", getSheetByName: () => sheet }) },
  Utilities: {
    getUuid: () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2),
    formatDate: (d, tz, f) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10),
  },
  UrlFetchApp: { fetch: () => { ctx.alerts++; } }, alerts: 0,
  unescape, encodeURIComponent,
};
vm.createContext(ctx);
vm.runInContext(code, ctx);
// 跳過登入：直接指定帳號
vm.runInContext("authenticate_ = function(){ return { username:'mom', sheetName:'x', displayName:'媽媽' }; }; dataSheet_ = function(){ return __sheet; };", Object.assign(ctx, { __sheet: sheet }));

let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const run = s => vm.runInContext(s, ctx);

// list 會帶列號
let list = run("listRecords_({token:'t'})");
ok(list.records[1].row === 3 && list.records[1].at > 0, "list 回傳列號與建立時間");

// 修改
const rec = list.records[1];
let r = run(`updateRecord_({token:'t',row:3,origAt:${rec.at},origDate:'${rec.date}',date:'2026-10-16',systolic:'128',diastolic:'84',pulse:'75',medication:'有吃',notes:'好'})`);
ok(r.ok && sheetRows[2][1] === 128 && sheetRows[2][5] === "有吃" && sheetRows[2][4] === "", "修改成功，不動緊張程度欄");
ok(sheetRows[2][7].getTime() === rec.at, "建立時間不變");
// 過期（建立時間對不上）
r = run(`updateRecord_({token:'t',row:3,origAt:123,origDate:'2026-10-16',date:'2026-10-16',systolic:'128',diastolic:'84',pulse:'75',medication:'有吃'})`);
ok(!r.ok && r.code === "STALE", "建立時間對不上 → STALE");
// 驗證沿用
r = run(`updateRecord_({token:'t',row:3,origAt:${rec.at},origDate:'2026-10-16',date:'2999-01-01',systolic:'128',diastolic:'84',pulse:'75',medication:'有吃'})`);
ok(!r.ok && r.error.includes("未來"), "修改也擋未來日期");
r = run(`updateRecord_({token:'t',row:99,origAt:1,origDate:'x'})`);
ok(!r.ok, "超出範圍的列號被拒絕");
// 刪除
r = run(`deleteRecord_({token:'t',row:3,origAt:${rec.at},origDate:'2026-10-16'})`);
ok(r.ok && sheetRows.length === 2, "刪除成功");
r = run(`deleteRecord_({token:'t',row:1,origAt:0,origDate:'日期'})`);
ok(!r.ok && sheetRows.length === 2, "標題列不能刪");

// 補送：clientAt
const t0 = Date.now() - 3600e3;
r = run(`addRecord_({token:'t',requestId:'a1',date:'2026-10-16',systolic:'121',diastolic:'79',pulse:'66',medication:'有吃',clientAt:'${t0}'})`);
ok(r.ok && sheetRows[2][7].getTime() === t0 && sheetRows[2][4] === "", "補送使用當初時間");
r = run(`addRecord_({token:'t',requestId:'a1',date:'2026-10-16',systolic:'121',diastolic:'79',pulse:'66',medication:'有吃',clientAt:'${t0}'})`);
ok(r.ok && r.duplicate && sheetRows.length === 3, "同編號重送不會變兩筆");
r = run(`addRecord_({token:'t',requestId:'a2',date:'2026-10-16',systolic:'120',diastolic:'80',pulse:'60',medication:'有吃',clientAt:'1'})`);
ok(r.ok && Math.abs(sheetRows[3][7].getTime() - Date.now()) < 5000, "不合理的 clientAt 改用伺服器時間");

// 管理密碼：升級式鎖定
props.DISCORD_WEBHOOK = "https://example.test/hook";
for (let i = 1; i <= 4; i++) run("adminCheck_({adminCode:'bad'})");
let res = run("adminCheck_({adminCode:'bad'})");
ok(!res.ok && res.error.includes("暫停") && ctx.alerts === 1, "第 5 次錯誤 → 鎖定並通知 Discord");
res = run("adminCheck_({adminCode:'secret-admin'})");
ok(res && !res.ok && res.error.includes("10 分鐘"), "鎖定期間連正確密碼也不能用（10 分鐘）");
// 模擬 10 分鐘過去再錯 5 次 → 1 小時
cacheStore.admin_lock = String(Date.now() - 1);
for (let i = 1; i <= 5; i++) run("adminCheck_({adminCode:'bad'})");
res = run("adminCheck_({adminCode:'secret-admin'})");
ok(res && res.error.includes("60 分鐘"), "第二次鎖定升級成 60 分鐘");
cacheStore.admin_lock = String(Date.now() - 1);
res = run("adminCheck_({adminCode:'secret-admin'})");
ok(res === null && !cacheStore.admin_strikes, "輸入正確 → 通過並歸零");
ok(run("safeEqual_('abc','abc')") && !run("safeEqual_('abc','abd')"), "safeEqual_ 正確");


// ---- Drive / Script 假服務（備份測試用）----
const driveState = { files: [], trashed: [], copies: [], folderCreated: 0, triggers: [] };
const mkFile = (name, daysOld) => ({ name, created: new Date(Date.now() - daysOld * 86400e3), getName() { return this.name; }, getDateCreated() { return this.created; }, setTrashed(v) { if (v) driveState.trashed.push(this.name); driveState.files = driveState.files.filter(f => f !== this); } });
const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
const folder = {
  getFilesByName: n => iter(driveState.files.filter(f => f.name === n)),
  getFiles: () => iter(driveState.files.slice()),
  createFile: (blob) => { driveState.copies.push(blob.name); driveState.files.push(mkFile(blob.name, 0)); },
};
ctx.DriveApp = {
  getFileById: () => ({
    getParents: () => iter([{ getFoldersByName: () => iter(driveState.folderExists ? [folder] : []), createFolder: () => { driveState.folderCreated++; return folder; } }]),
    makeCopy: (name) => { driveState.copies.push(name); driveState.files.push(mkFile(name, 0)); },
  }),
  getRootFolder: () => null,
};
driveState.exportOk = true;
ctx.UrlFetchApp = { fetch: (url) => {
  if (url.includes('/export?format=xlsx')) {
    return { getResponseCode: () => (driveState.exportOk ? 200 : 500), getBlob: () => ({ name: '', setName(n) { this.name = n; return this; } }) };
  }
  ctx.alerts++;
} };
ctx.ScriptApp = {
  getOAuthToken: () => 'token',
  WeekDay: { SUNDAY: 'SUNDAY' },
  getProjectTriggers: () => driveState.triggers,
  deleteTrigger: t => { driveState.triggers = driveState.triggers.filter(x => x !== t); },
  newTrigger: fn => { const t = { getHandlerFunction: () => fn }; const b = { timeBased: () => b, onWeekDay: () => b, atHour: () => b, create: () => { driveState.triggers.push(t); return t; } }; return b; },
};
ctx.__sheet2 = sheet;
vm.runInContext("spreadsheet_ = function(){ return { getId: function(){ return 'id'; }, getSpreadsheetTimeZone: function(){ return 'Asia/Taipei'; } }; };", ctx);

// 補送／復原：1 年前的原本時間可以保留，不合理的（未來）不行
const oldAt = Date.now() - 400 * 86400e3;
ok(run(`validClientTime_('${oldAt}')`).getTime() === oldAt, "復原：400 天前的原本時間可以保留");
ok(run(`validClientTime_('${Date.now() + 3600e3}')`) === null, "未來的時間不接受");
ok(run("validClientTime_('')") === null, "沒帶時間就用伺服器時間");

// 備份：已有 9 份舊備份 → 備份後只留最新 2 份
driveState.folderExists = true;
for (let i = 1; i <= 9; i++) driveState.files.push(mkFile('血壓備份 old' + i, i * 7));
driveState.files.push(mkFile('別的檔案', 100)); // 不是備份的檔案不能被動到
run("backupSpreadsheet()");
const backups = driveState.files.filter(f => f.name.startsWith('血壓備份 '));
ok(backups.length === 2, `備份後保留 2 份（實際 ${backups.length}）`);
ok(driveState.files.some(f => f.name === '別的檔案') && !driveState.trashed.includes('別的檔案'), "不是備份的檔案不會被刪");
ok(driveState.trashed.includes('血壓備份 old9') && driveState.trashed.includes("血壓備份 old2"), "較舊的備份被丟進垃圾桶");
ok(backups.some(f => f.name === driveState.copies[0]), "新備份在保留名單內");
ok(driveState.copies[0].endsWith('.xlsx'), "備份存成 .xlsx（不會出現在試算表首頁）");

// 同一天重跑只留一份
const before = driveState.files.filter(f => f.name === driveState.copies[0]).length;
run("backupSpreadsheet()");
ok(before === 1 && driveState.files.filter(f => f.name === driveState.copies[0]).length === 1, "同一天重跑不會變兩份");

// 匯出 Excel 失敗 → 退回複製成 Google 試算表，至少有一份備份
driveState.exportOk = false;
const beforeFallback = driveState.copies.length;
run("backupSpreadsheet()");
ok(driveState.copies.length === beforeFallback + 1 && !driveState.copies.at(-1).endsWith('.xlsx'), "匯出失敗時改用複製，仍然有備份");
driveState.exportOk = true;

// 沒有備份資料夾 → 自動建立
driveState.files = []; driveState.folderExists = false; driveState.folderCreated = 0;
run("backupSpreadsheet()");
ok(driveState.folderCreated === 1, "沒有備份資料夾時自動建立");

// 設定排程：只會有一個備份排程，而且會立刻備份一次
const copiesBefore = driveState.copies.length;
run("setupBackup()"); run("setupBackup()");
ok(driveState.triggers.length === 1 && driveState.triggers[0].getHandlerFunction() === 'backupSpreadsheet', "setupBackup 重複執行也只有一個排程");
ok(driveState.copies.length === copiesBefore + 2, "setupBackup 會立刻備份一次");

// 備份失敗 → 通知 Discord 並丟出錯誤
ctx.DriveApp.getFileById = () => { throw new Error('沒有權限'); };
props.DISCORD_WEBHOOK = 'https://example.test/hook';
const alertsBefore = ctx.alerts;
let threw = false;
try { run("backupSpreadsheet()"); } catch (e) { threw = true; }
ok(threw && ctx.alerts === alertsBefore + 1, "備份失敗會通知 Discord 並回報錯誤");


// ---- 收縮壓一定要比舒張壓大（長輩常填反）----
const rowsBefore = sheetRows.length;
let flip = run("addRecord_({token:'t',date:'2026-10-16',systolic:'80',diastolic:'120',pulse:'70',medication:'有吃'})");
ok(!flip.ok && flip.error.includes("要比舒張壓"), "新增：收縮壓小於舒張壓（填反）會被擋");
flip = run("addRecord_({token:'t',date:'2026-10-16',systolic:'100',diastolic:'100',pulse:'70',medication:'有吃'})");
ok(!flip.ok, "新增：收縮壓等於舒張壓也不行");
ok(sheetRows.length === rowsBefore, "被擋下的資料不會寫進試算表");
const target = sheetRows.length - 1;
const tgt = sheetRows[target];
const tgtAt = tgt[7] instanceof Date ? tgt[7].getTime() : 0;
flip = run(`updateRecord_({token:'t',row:${target + 1},origAt:${tgtAt},origDate:'${tgt[0] instanceof Date ? "" : tgt[0]}',date:'2026-10-16',systolic:'90',diastolic:'130',pulse:'70',medication:'有吃'})`);
ok(!flip.ok && !String(flip.code || "").includes("STALE") || flip.error.includes("要比舒張壓"), "修改：填反也會被擋（在核對列號之前就擋下）");
ok(run("addRecord_({token:'t',requestId:'ok-order',date:'2026-10-16',systolic:'121',diastolic:'79',pulse:'66',medication:'有吃'})").ok, "正常的 121/79 照常儲存");

console.log(fails ? "有失敗" : "全部通過");
process.exit(fails ? 1 : 0);
