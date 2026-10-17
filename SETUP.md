# 血壓記錄：部署與設定

## 架構

```
手機（GitHub Pages 靜態網頁 / PWA：React + Vite + Tailwind）
   └─ POST → Google Apps Script（apps-script/Code.gs）→ Google 試算表
                                    └─ 每天 3 次 → Discord 提醒

GitHub Actions：push 到 main → 型別檢查 → 單元測試 → 建置 → 自動發佈到 GitHub Pages
```

- 試算表的「帳號」分頁記錄所有帳號，密碼只存加鹽雜湊。
- 每個帳號有自己的分頁，名稱＝帳號名稱；舊資料沿用「工作表1」。
- 登入後，這台裝置會拿到 1 年有效的權杖，每天使用會自動續期，之後不用再輸入。

## 前端（網站）

### 日常更新流程

1. 改程式（`src/` 底下）。
2. `git push` 到 `main`。
3. GitHub Actions 自動測試、建置、發佈，約 1～2 分鐘後網站就更新（到 repo 的 Actions 頁面可以看進度）。
4. 手機會自動換成新版，不用做任何事。要確認手機是不是最新版：在畫面左上角連點「血壓記錄」5 下（3 秒內），會彈出版本資訊（commit 編號與建置時間），裡面還有「清除快取並重新載入」按鈕。長輩平常看不到。

不用再手動管理版本號或快取：每次建置，檔名都會自動帶上內容編碼，舊檔案不會混進來。

### 專案結構

```
src/
  main.tsx            進入點（註冊自動更新、舊網址轉址）
  App.tsx             路由（用 # 網址，GitHub Pages 重新整理才不會 404）
  config.ts           後端（Apps Script）網址
  index.css           Tailwind 設定與顏色
  ui.ts               共用的 Tailwind 樣式組合
  lib/
    api.ts            呼叫後端
    storage.ts        登入狀態、上次的紀錄、沒訊號暫存、字體大小（localStorage）
    pending.ts        沒訊號暫存的補送
    records.ts        每天合併、早晚分組、報告統計等純計算
  hooks/hooks.ts      useRecords（先秀舊資料、背景更新）等
  components/         Layout、Modal、結果視窗、修改／刪除視窗、圖表
  pages/              登入、記錄、歷史、給醫師看、管理
  test/               單元測試
e2e/e2e.mjs           用真的 Edge 瀏覽器跑一輪完整操作（後端是假的），並截圖
public/               圖示、舊版快取清理程式
apps-script/Code.gs   後端
```

### 在自己的電腦上開發

```bash
npm install          # 第一次
npm run dev          # 開發模式（改了程式畫面馬上更新）→ http://localhost:5173/blood_pressure_monitor/
npm test             # 單元測試
npm run build        # 建置（會先做型別檢查）
npm run preview      # 預覽建置好的版本
node e2e/e2e.mjs     # 瀏覽器完整實測（先 npm run build；需要 Edge，截圖存到 e2e/shots/）
```

注意：開發機連的是真的後端。要測試儲存、修改、刪除時請用測試帳號，或用 `e2e/e2e.mjs`（假後端）。

### 第一次設定 GitHub Pages（只需要做一次）

repo 的 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。

### 舊網址

以前存的書籤（`admin.html`、`login.html`、`bp_reports.html`、`doctor.html`）還是可以用，網站會自動帶到新版對應的頁面。
管理頁新網址：`https://s3602te.github.io/blood_pressure_monitor/#/admin`（舊網址 `admin.html` 也行）。

## 後端更新步驟（改了 `apps-script/Code.gs` 才需要）

1. 開啟試算表 → 擴充功能 → Apps Script，把 `Code.gs` 全部貼進去取代舊程式碼，Ctrl+S 存檔。
2. 左側「專案設定」→「指令碼屬性」，新增：

   | 屬性 | 說明 |
   |---|---|
   | `REGISTER_CODE` | 註冊邀請碼，自己訂一組，只告訴家人（必填） |
   | `DISCORD_WEBHOOK` | Discord webhook 網址（選填） |
   | `LEGACY_OWNER` | 舊資料的主人帳號，例如 `mom`（選填） |
   | `ADMIN_CODE` | 管理頁面的管理密碼，要比邀請碼更難猜（要用管理頁面才需要） |
   | `SPREADSHEET_ID` | 指令碼綁在試算表裡可不填 |

3. 編輯器選 `setupTriggers` 執行一次（只要設定過就不用再跑）。
4. 部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選「新版本」→ 部署。
   **一定要用鉛筆，不要「新增部署作業」**，網址才不會變（網址寫在 `src/config.ts`）。
5. 「存取權」維持「任何人」，網頁才連得到。資料有登入權杖保護。

## 讓媽媽接手舊資料

`LEGACY_OWNER` 設成媽媽想用的帳號（例如 `mom`），再用這個帳號名稱到網頁「建立帳號」。
系統會把她的帳號對應到原本的「工作表1」，舊紀錄就會出現在她的歷史頁。

## 家人忘記密碼

管理者看不到任何人的密碼（只存雜湊），但可以重設：

1. 打開管理頁面（見上面「舊網址」，沒有任何頁面連到它，自己存書籤）。
2. 輸入 `ADMIN_CODE` 的管理密碼，選要重設的人，輸入新密碼（至少 4 個字元），按「重設密碼」。
3. 把新密碼告訴對方。

重設後，該帳號在所有裝置上都會被登出，需要用新密碼重新登入，紀錄不受影響。
`ADMIN_CODE` 沒設定時，管理頁面完全關閉；管理密碼連錯 5 次會暫停，而且越鎖越久（10 分鐘 → 1 小時 → 6 小時）；如果有設定 `DISCORD_WEBHOOK`，被鎖時會立刻通知你。`ADMIN_CODE` 請設 12 個字元以上。

備用：也可以在 Apps Script 編輯器改 `resetPassword` 的兩個值後執行（不用部署），做完記得改回提示文字。

## 安全提醒

- `放在google apps script的東西.txt` 已列入 `.gitignore`，裡面有 webhook，不要上傳。
- 那個檔案裡的 Discord webhook 曾經以明文出現在對話與本機檔案，建議到 Discord
  「伺服器設定 → 整合 → Webhook」刪除舊的、建立新的，再填進 `DISCORD_WEBHOOK`。
- 想換邀請碼，到「指令碼屬性」改 `REGISTER_CODE` 即可，已建立的帳號不受影響。

## 功能備忘

- 歷史頁：每天的日期下方有「修改」，可修改或刪除那一天的每一筆紀錄（後端會核對日期與建立時間，對不上就拒絕，避免改到別筆）。
- 沒訊號時按儲存：資料先暫存在手機，有網路自動補送（同一筆不會重複）。
- 頂欄「放大字／標準字」：只影響這支手機。
- 「給醫師看」頁：選 7／30／90 天或自訂範圍，可列印或存成 PDF。
