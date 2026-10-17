# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 這個專案是什麼

家人（長輩）每天記錄血壓的 PWA。前端是 React + Vite + Tailwind v4 + TypeScript，發佈在 GitHub Pages（`https://s3602te.github.io/blood_pressure_monitor/`）；後端是綁在一份 Google 試算表（「血壓」）裡的 Google Apps Script（`apps-script/Code.gs`，單一檔案）。維護者不是工程師，操作 Google／GitHub 介面容易迷路，說明要一步一步來。**部署流程、指令碼屬性、備份、群組的完整說明在 `SETUP.md`，不要重複，改了功能請順手更新它。**

## 指令

```bash
npm run dev            # 開發（http://localhost:5173/blood_pressure_monitor/；連的是「真的」後端）
npm run typecheck      # tsc --noEmit
npm test               # vitest（src/test/*.test.ts）
npx vitest run src/test/records.test.ts          # 只跑一個檔案
npx vitest run -t "偏高"                          # 只跑名稱符合的測試
npm run test:backend   # Code.gs 的模擬測試（apps-script/tests/*.test.cjs）
npm run test:all       # typecheck + vitest + 後端模擬測試
npm run build          # typecheck + vite build（產出 dist/）
node e2e/e2e.mjs       # 瀏覽器完整實測，要先 npm run build
```

- `e2e/e2e.mjs` 用 `playwright-core` 開系統瀏覽器（預設 Windows 的 Edge，其他環境用 `BROWSER_PATH`），後端用攔截請求的**假後端**，不會動到真的試算表；截圖存到 `e2e/shots/`（已 gitignore）。時區要是 Asia/Taipei（CI 設了 `TZ`）。
- CI（`.github/workflows/deploy.yml`）：`build` job＝typecheck → vitest → 後端模擬測試 → build；`e2e` job 獨立執行、**不擋發佈**；`deploy` 只在 `main`。預設分支是 `main`（舊的 `master` 只是紀念）。Dependabot 每月一個合併 PR、不自動提大版本。

## 架構重點（需要跨檔案才看得懂的）

**前端 ↔ 後端**
- `src/lib/api.ts` 的 `callApi` 對 Apps Script 網址（`src/config.ts`）送 **POST 表單**（不會觸發 CORS 預檢），回傳統一為 `{ ok, error?, code? }`。`code` 有 `NETWORK`（連不上／逾時，不丟錯誤）、`AUTH`（登入過期 → `handleAuthError` 清掉登入並回登入頁）、`STALE`（修改／刪除時列號對不上）。
- 後端 `doPost` 依 `action` 分流；會寫入的動作（`WRITE_ACTIONS`）才搶 `LockService`。登入權杖只存雜湊在指令碼屬性，有效 1 年、每天使用自動續期。
- **修改／刪除**以「列號 + 原建立時間 + 原日期」三者核對（`locateRow_`），對不上就回 `STALE`，避免試算表被手動插列後改到別筆。

**離線與重複送出**（`src/lib/storage.ts`、`pending.ts`、`pages/RecordPage.tsx`）
- 每次填寫產生 `requestId`，後端用快取記住 6 小時，同編號只存一次。沒訊號時資料進 `pendingQueue`（localStorage）並帶 `clientAt`（當初按儲存的時間，後端只接受 3 年內、非未來的值），有網路再 `flushPending`。「刪除後復原」也是用 `add` 帶原本的 `at`。
- **localStorage 的 key 名稱（`bp_session`、`bp_records_<帳號>`、`bp_pending_<帳號>`、`bp_font`…）沿用舊版純 HTML 網站，不要改**，否則長輩會被登出、暫存的血壓會遺失。

**資料顯示**（`src/lib/records.ts` 是純計算，優先寫測試）
- 歷史頁每天合併成一筆（`aggregateByDate`，血壓取平均，並保留每筆原始紀錄給修改視窗用）；給醫師看是一次量測一列、最新在上（`buildReport`、`reportToCsv`）。
- 「早上／晚上」由**建立時間**推算：凌晨 4 點到中午 12 點前是早上，其餘晚上（沒有建立時間的舊資料先算早上）。後端 `accountsMissing_`（Discord 提醒）用同一條規則。
- 圖表可切「早晚一起／只看早上／只看晚上」：`filterBySlot`（`records.ts`）依時段重算每天的點，歷史頁與給醫師看共用 `ChartPanel` ＋ `ChartModeSwitch`；收縮壓必須大於舒張壓（`lib/validate.ts` 前端即時檢查，`parseRecord_` 後端再擋）。連點版本資訊進得去 `#/checklist`（真機驗收單，內容在 `T.checklist`，勾選結果存在手機 localStorage）。
- 連續簽到／蓋章（`lib/stamps.ts` ＋ `components/StampCard.tsx`）：只看「哪幾天有記錄」，全部在前端用已載入的紀錄（加上暫存在手機、還沒上傳的）算，不碰後端；日期相減一律用 UTC 日期，避免夏令時間與月底出錯。
- 偏高門檻 135/85（`HIGH_SYS/HIGH_DIA`）；儲存後提醒門檻在 `src/lib/advice.ts`（很高 180/110、偏低 90/60，收縮／舒張任一個到就算）。

**文字集中**：畫面上所有文字都在 `src/text.ts`（使用者會自己改字，檔頭有說明）。新增文字請加到這裡，不要寫死在元件裡。例外：「有吃／沒吃」是**資料值**（`MED_YES`/`MED_NO` 在 `src/lib/types.ts`，後端也比對），不能改；PWA 名稱在 `vite.config.ts`；後端訊息與 Discord 文字在 `Code.gs`。

**路由／PWA**：`HashRouter`（GitHub Pages 重新整理才不會 404）；舊網址 `admin.html`／`login.html`／`bp_reports.html`／`doctor.html` 靠 CI 複製的 `404.html` ＋ `main.tsx` 轉到新路由。`vite-plugin-pwa`（autoUpdate）產生 `sw.js`，`public/old-cache-cleanup.js` 清舊版快取。版本標記 `__APP_VERSION__`（commit 編號）在 `vite.config.ts` 注入；連點左上角「血壓記錄」5 下才會看到（`VersionDialog`，裡面有進管理員頁的入口）。

**後端 `apps-script/Code.gs` 的資料模型**
- 「帳號」分頁欄位：帳號（A）、顯示名稱、資料分頁、salt、密碼雜湊、建立時間、最後使用（G）、群組（H，空白＝預設群組）。每個帳號一個資料分頁（分頁名＝帳號）；資料分頁欄位 A–I，**E 欄「緊張程度」已棄用、永遠留空**。
- 新註冊帳號必須是 10 碼手機號碼（0 開頭，`normalizeUsername_` 會去掉空白與橫線）；舊帳號不受限；密碼最短 4 碼。
- 群組：指令碼屬性 `REGISTER_CODE`＝預設群組、`GROUPS`（每行 `群組名稱=邀請碼[|#顏色]`）＝其他群組；註冊時用邀請碼決定群組。群組決定分頁顏色（`syncTabColors_`，打開管理頁自動校正）、管理頁分區與底色、Discord 提醒頻道（`DISCORD_WEBHOOK` 給預設群組，其他群組用 `DISCORD_WEBHOOK_群組名稱`，沒設就不發）。
- 觸發器：`setupTriggers`（07:00 早上、21:45 晚上，只點名該時段還沒記錄的人）、`setupBackup`（每週日 03:00 匯出 .xlsx 到「血壓記錄備份」資料夾，保留 `BACKUP_KEEP` 份）。改了觸發器相關程式要請使用者重跑對應函式。

## 必須注意的坑

- **後端改了不會自動上線**：使用者要把 `Code.gs` 整份貼進 Apps Script、存檔，再「管理部署作業 → 鉛筆 → 新版本」。**絕對不能選「新增部署作業」**（網址會變，`src/config.ts` 就失效）。新增 Google 權限（例如 Drive）時，要先請他在編輯器「執行」一次函式完成授權，再部署。
- 後端沒有 Apps Script 環境可測，所以用 `apps-script/tests/` 的 Node `vm` 假服務測。**改 `Code.gs` 就要補／跑這些測試**（它們曾抓到誤刪函式、列號核對等問題）。
- 在這台 Windows／Git Bash 環境：檔案是 CRLF（`core.autocrlf=true`），**用 Bash heredoc 寫長內容不穩定**（反斜線跳脫與換行會被轉換、CR 會重複）；改檔請用 Edit／Write 工具，或先用 Write 建立 Python 腳本再執行（開檔時 `newline=''`）。
- 含機密（webhook、試算表 ID、各種邀請碼與管理密碼）的本機檔案都已列入 `.gitignore`，不要提交、不要讀出來貼到別處。

## 個人偏好與合作方式

和維護者合作的個人偏好（語言、回覆格式、什麼時候可以 push 等）放在 `CLAUDE.local.md`（不會推送到 GitHub，Claude Code 在這個資料夾會自動讀取）。
