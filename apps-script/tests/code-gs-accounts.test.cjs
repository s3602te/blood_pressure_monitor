// 後端 Code.gs 的模擬測試（二）：帳號、最後使用、管理頁清單、刪除帳號、群組與分頁顏色、Discord 提醒。
// 用比較完整的假試算表。執行：npm run test:backend
// 帳號「最後使用」與管理頁清單的測試（用比較完整的假試算表）
const vm = require("vm");
const fs = require("fs");
const code = fs.readFileSync(require("path").join(__dirname, "..", "Code.gs"), "utf8");

class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.tabColor = null; }
  getTabColor() { return this.tabColor; }
  setTabColor(c) { this.tabColor = c; }
  getLastRow() { return this.rows.length; }
  getDataRange() { return { getValues: () => this.rows.map(r => r.slice()) }; }
  getRange(r, c, nr = 1, nc = 1) {
    const self = this;
    const cell = {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) { const row = self.rows[r - 1 + i] || []; out.push(Array.from({ length: nc }, (_, j) => (row[c - 1 + j] === undefined ? "" : row[c - 1 + j]))); }
        return out;
      },
      getValue() { return this.getValues()[0][0]; },
      setValue(v) { while (self.rows.length < r) self.rows.push([]); self.rows[r - 1][c - 1] = v; return cell; },
      setValues(v) { for (let i = 0; i < v.length; i++) { while (self.rows.length < r + i) self.rows.push([]); for (let j = 0; j < v[i].length; j++) self.rows[r - 1 + i][c - 1 + j] = v[i][j]; } return cell; },
      setFontWeight() { return cell; }, setNumberFormat() { return cell; },
    };
    return cell;
  }
  appendRow(v) { this.rows.push(v); }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  setName(n) { delete sheets[this.name]; this.name = n; sheets[n] = this; }
  setFrozenRows() {}
}
const sheets = {};
const ss = {
  getSheetByName: n => sheets[n] || null,
  insertSheet: n => (sheets[n] = new Sheet(n)),
  deleteSheet: sh => { delete sheets[sh.name]; },
  getSpreadsheetTimeZone: () => "Asia/Taipei",
};
const props = { REGISTER_CODE: "x", ADMIN_CODE: "boss" };
const cacheStore = {};
const ctx = {
  Date, Number, Math, String, Object, Array, JSON, console, unescape, encodeURIComponent,
  Logger: { log() {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => (props[k] = v), deleteProperty: k => delete props[k], getProperties: () => ({ ...props }) }) },
  CacheService: { getScriptCache: () => ({ get: k => (k in cacheStore ? cacheStore[k] : null), put: (k, v) => (cacheStore[k] = v), remove: k => delete cacheStore[k] }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  Utilities: { getUuid: () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2), formatDate: (d, tz, f) => { const t = new Date(d.getTime() + 8 * 3600e3); return f === "H" ? String(t.getUTCHours()) : t.toISOString().slice(0, 10); } },
  UrlFetchApp: { fetch() {} },
  ScriptApp: { _t: [{ getHandlerFunction: () => 'sendDiscordReminder' }, { getHandlerFunction: () => 'backupSpreadsheet' }], getProjectTriggers() { return this._t; }, deleteTrigger(t) { this._t = this._t.filter(x => x !== t); }, newTrigger(fn) { const self = this; const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, nearMinute: () => b, create: () => { self._t.push({ getHandlerFunction: () => fn }); } }; return b; } },
};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const run = s => vm.runInContext(s, ctx);

let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

// 註冊：帳號分頁有「最後使用」標題與時間
const reg = run("register_({inviteCode:'x',username:'0911111111',password:'1234',displayName:'媽媽'})");
ok(reg.ok, "註冊成功");
const acc = sheets["帳號"];
ok(acc.rows[0][6] === "最後使用", "帳號分頁有「最後使用」標題");
ok(acc.rows[1][6] instanceof Date, "註冊時記錄最後使用");

// 舊帳號（沒有最後使用欄）：用權杖讀取一次就會補上；一天內再讀不會重複寫入
acc.rows[0] = acc.rows[0].slice(0, 6);
acc.rows[1] = acc.rows[1].slice(0, 6);
const token = run("issueToken_('0911111111')");
ok(run(`authenticate_('${token}')`).username === "0911111111", "權杖驗證成功");
ok(acc.rows[1][6] instanceof Date && acc.rows[0][6] === "最後使用", "舊帳號第一次使用就補上最後使用與標題");
const stamp = acc.rows[1][6].getTime();
acc.rows[1][6] = new Date(Date.now() - 3600e3); // 1 小時前
run(`authenticate_('${token}')`);
ok(acc.rows[1][6].getTime() === acc.rows[1][6].getTime() && Date.now() - acc.rows[1][6].getTime() > 3000e3, "一天內再次使用不會重複寫入");
acc.rows[1][6] = new Date(Date.now() - 30 * 3600e3); // 30 小時前
run(`authenticate_('${token}')`);
ok(Date.now() - acc.rows[1][6].getTime() < 5000, "超過一天再使用會更新最後使用");

// 登入也會更新
acc.rows[1][6] = new Date(2020, 0, 1);
const login = run("login_({username:'0911111111',password:'1234'})");
ok(login.ok && Date.now() - acc.rows[1][6].getTime() < 5000, "登入會更新最後使用");

// 管理頁清單
const data = sheets["0911111111"];
data.rows.push(["2026-10-01", 120, 80, 70, "", "有吃", "", new Date(2026, 9, 1, 7), new Date()]);
data.rows.push(["2026-10-10", 120, 80, 70, "", "有吃", "", new Date(2026, 9, 10, 22), new Date()]);
data.rows.push(["2026-10-05", 120, 80, 70, "", "有吃", "", new Date(2026, 9, 5, 7), new Date()]);
run("register_({inviteCode:'x',username:'0922222222',password:'5678'})"); // 沒有任何紀錄的帳號
const list = run("adminList_({adminCode:'boss'})");
ok(list.ok && list.accounts.length === 2, "管理清單有 2 個帳號");
const mom = list.accounts.find(a => a.username === "0911111111");
ok(mom.lastRecord === new Date(2026, 9, 10, 22).getTime() && mom.count === 3, "最後記錄是最新一筆的建立時間（不是最後一列）、筆數正確");
ok(mom.lastSeen > 0, "清單帶回最後使用");
const dad = list.accounts.find(a => a.username === "0922222222");
ok(dad.lastRecord === 0 && dad.count === 0, "沒有紀錄的帳號：最後記錄 0、筆數 0");
ok(run("adminList_({adminCode:'bad'})").ok === false, "管理密碼錯誤不給清單");
ok(!("hash" in mom) && !("salt" in mom), "清單不含密碼雜湊");


// ---- Discord 提醒：只提醒今天這個時段還沒記錄的人 ----
const sent = [];
ctx.UrlFetchApp = { fetch: (url, opt) => { sent.push(JSON.parse(opt.payload).content); } };
props.DISCORD_WEBHOOK = "https://example.test/hook";
const todayIso = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const [ty, tm, td] = todayIso.split("-").map(Number);
const at = (h, m = 0) => new Date(Date.UTC(ty, tm - 1, td, h - 8, m)); // 台北時間 h:m
const dadSheet = sheets["0922222222"];
sheets["0911111111"].rows.push([todayIso, 120, 80, 70, "", "有吃", "", at(7, 30), at(7, 30)]); // 媽媽今天早上記錄了
run("sendReminder_('morning')");
ok(sent.length === 1 && sent[0].includes("0922222222") && !sent[0].includes("媽媽") && sent[0].includes("早上"), "早上提醒：只點名還沒記錄的人（媽媽已記錄就不提）");
run("sendReminder_('evening')");
ok(sent.length === 2 && sent[1].includes("媽媽") && sent[1].includes("0922222222") && sent[1].includes("晚上"), "晚上提醒：兩個人晚上都還沒記錄，都點名");
dadSheet.rows.push([todayIso, 120, 80, 70, "", "有吃", "", at(8, 0), at(8, 0)]);
sheets["0911111111"].rows.push([todayIso, 120, 80, 70, "", "有吃", "", at(22, 0), at(22, 0)]);
dadSheet.rows.push([todayIso, 120, 80, 70, "", "有吃", "", at(21, 50), at(21, 50)]);
run("sendReminder_('morning')"); run("sendReminder_('evening')");
ok(sent.length === 2, "大家這個時段都記錄了：不發提醒");
sheets["0911111111"].rows.push(["2026-01-01", 120, 80, 70, "", "有吃", "", new Date(2026, 0, 1), new Date()]);
ok(run("accountsMissing_('morning')").length === 0, "別天的紀錄不影響今天的判斷");
delete props.DISCORD_WEBHOOK;
const before = sent.length; run("sendReminder_('evening')");
ok(sent.length === before, "沒有設定 webhook 就不發");
run("setupTriggers()"); run("setupTriggers()");
const handlers = ctx.ScriptApp._t.map(t => t.getHandlerFunction()).sort();
ok(JSON.stringify(handlers) === JSON.stringify(["backupSpreadsheet", "sendEveningReminder", "sendMorningReminder"]), "setupTriggers：換成早上、晚上兩個排程，不動備份排程，重複執行不會變多");


// ---- 帳號格式：10 碼手機號碼 ----
const bad1 = run("register_({inviteCode:'x',username:'mom',password:'1234'})");
ok(!bad1.ok && bad1.error.includes("10 碼手機號碼"), "註冊：不是手機號碼會被擋");
ok(!run("register_({inviteCode:'x',username:'091234567',password:'1234'})").ok, "註冊：9 碼不行");
ok(!run("register_({inviteCode:'x',username:'1912345678',password:'1234'})").ok, "註冊：不是 0 開頭不行");
ok(!run("register_({inviteCode:'x',username:'09123456789',password:'1234'})").ok, "註冊：11 碼不行");
const dashed = run("register_({inviteCode:'x',username:'0933-444-555',password:'1234'})");
ok(dashed.ok && dashed.username === "0933444555", "註冊：空白、橫線會自動去掉（0933-444-555 → 0933444555）");
ok(run("login_({username:'0933 444 555',password:'1234'})").ok, "登入：同樣可以用有橫線或空白的寫法");

// ---- 管理員刪除帳號 ----
const tok = run("issueToken_('0933444555')");
ok(run(`authenticate_('${tok}')`) !== null, "刪除前：登入權杖有效");
sheets["0933444555"].rows.push(["2026-10-01", 120, 80, 70, "", "有吃", "", new Date(2026, 9, 1, 7), new Date()]);
ok(run("adminDelete_({adminCode:'bad',username:'0933444555'})").ok === false, "刪除帳號：管理密碼錯誤不能刪");
ok(run("adminDelete_({adminCode:'boss',username:'0999999999'})").ok === false, "刪除帳號：找不到的帳號回報錯誤");
let del = run("adminDelete_({adminCode:'boss',username:'0933444555'})");
ok(del.ok, "刪除帳號（保留資料）成功");
ok(run("findAccount_('0933444555')") === null, "帳號已不在帳號分頁，不能再登入");
ok(run("login_({username:'0933444555',password:'1234'})").ok === false, "被刪的帳號登入失敗");
ok(run(`authenticate_('${tok}')`) === null, "被刪帳號的登入權杖立刻失效（所有裝置登出）");
ok(!sheets["0933444555"] && Object.keys(sheets).some(n => n.startsWith("已刪除_0933444555_")), "資料分頁保留，但改名成「已刪除_…」");
ok(sheets[Object.keys(sheets).find(n => n.startsWith("已刪除_0933444555_"))].rows.length === 2, "改名後的分頁資料還在");
// 同一個號碼重新註冊不會撞名，再刪一次並連資料一起刪
ok(run("register_({inviteCode:'x',username:'0933444555',password:'1234'})").ok, "刪除後，同一個手機號碼可以重新註冊（新的空分頁）");
const del2 = run("adminDelete_({adminCode:'boss',username:'0933444555',deleteData:'true'})");
ok(del2.ok && !sheets["0933444555"], "刪除帳號（連資料一起刪）：資料分頁也消失");
ok(Object.keys(sheets).some(n => n.startsWith("已刪除_0933444555_")), "不相關的舊「已刪除」分頁不受影響");


// ---- 群組：不同邀請碼 → 不同群組；提醒各發各的頻道 ----
props.GROUPS = "小美家=xyz789\n其他群組=zzz111";
props.DEFAULT_GROUP_NAME = undefined; delete props.DEFAULT_GROUP_NAME;
const gA = run("register_({inviteCode:'xyz789',username:'0955555555',password:'1234',displayName:'美美'})");
ok(gA.ok, "用「小美家」的邀請碼註冊成功");
const accSheet = sheets["帳號"];
const rowOf = (name) => accSheet.rows.find(r => r[0] === name);
ok(rowOf("0955555555")[7] === "小美家", "帳號分頁記下群組：小美家");
ok(run("register_({inviteCode:'x',username:'0966666666',password:'1234'})").ok && (rowOf("0966666666")[7] || "") === "", "用預設邀請碼註冊：群組空白（＝預設群組）");
ok(run("findAccount_('0955555555')").group === "小美家" && run("findAccount_('0966666666')").group === "家人", "findAccount_ 帶回群組（空白顯示成預設的「家人」）");
ok(!run("register_({inviteCode:'wrong',username:'0977777777',password:'1234'})").ok, "不在任何群組的邀請碼不能註冊");
const gl = run("adminList_({adminCode:'boss'})");
ok(JSON.stringify(gl.groups) === JSON.stringify(["家人", "小美家", "其他群組"]), "管理清單帶回所有群組名稱");
ok(gl.accounts.find(a => a.username === "0955555555").group === "小美家" && gl.accounts.find(a => a.username === "0911111111").group === "家人", "管理清單每個帳號都標示群組");

const posts = [];
ctx.UrlFetchApp = { fetch: (url, opt) => { posts.push({ url, text: JSON.parse(opt.payload).content }); } };
props.DISCORD_WEBHOOK = "https://hook.test/family";
props["DISCORD_WEBHOOK_小美家"] = "https://hook.test/meimei";
run("sendReminder_('evening')");
const toFamily = posts.filter(x => x.url.endsWith("/family"));
const toMei = posts.filter(x => x.url.endsWith("/meimei"));
ok(toMei.length === 1 && toMei[0].text.includes("美美") && !toMei[0].text.includes("0966666666"), "小美家的提醒只送到她們自己的頻道，只點名她們的人");
ok(toFamily.length === 1 && toFamily[0].text.includes("0966666666") && !toFamily[0].text.includes("美美"), "家人的提醒只送到家人的頻道，不會出現小美家的人");
ok(posts.length === 2, "沒設頻道的群組（其他群組）不發提醒");
delete props["DISCORD_WEBHOOK_小美家"];
posts.length = 0;
run("sendReminder_('evening')");
ok(posts.length === 1 && posts[0].url.endsWith("/family"), "小美家沒設頻道時不發，也不會改送到家人的頻道");


// ---- 分頁顏色：依群組上色 ----
ok(sheets["0955555555"].getTabColor() === "#4285f4", "小美家的人註冊時，分頁自動變藍色（第一個非預設群組）");
ok(!sheets["0966666666"].getTabColor(), "預設群組（家人）的分頁不上色（白色）");
sheets["0966666666"].setTabColor("#ff0000");   // 故意弄錯顏色
sheets["0955555555"].setTabColor(null);
const colorList = run("adminList_({adminCode:'boss'})");
ok(!sheets["0966666666"].getTabColor() && sheets["0955555555"].getTabColor() === "#4285f4", "打開管理頁會自動校正：家人清掉顏色、小美家補回藍色");
ok(colorList.groupColors["家人"] === "" && colorList.groupColors["小美家"] === "#4285f4" && colorList.groupColors["其他群組"] === "#fb8c00", "管理清單帶回群組顏色（家人白、依順序配色）");
props.GROUPS = "小美家=xyz789|#112233\n其他群組=zzz111";
run("applyGroupColors()");
ok(sheets["0955555555"].getTabColor() === "#112233", "GROUPS 最後加「|#顏色碼」可以指定顏色，執行 applyGroupColors 後套用");
ok(run("register_({inviteCode:'xyz789',username:'0988888888',password:'1234'})").ok && sheets["0988888888"].getTabColor() === "#112233", "新註冊的人也用指定的顏色");
ok(run("findAccount_('0988888888')").group === "小美家", "邀請碼後面的顏色設定不影響邀請碼本身（xyz789 仍可註冊）");
ok(!run("register_({inviteCode:'xyz789|#112233',username:'0987654321',password:'1234'})").ok, "把整串（含顏色）當邀請碼輸入是不行的");
props.GROUPS = "小美家=xyz789\n其他群組=zzz111";

console.log(fails ? "有失敗" : "全部通過");
process.exit(fails ? 1 : 0);
