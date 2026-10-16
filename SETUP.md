# 血壓記錄：部署與設定

## 架構

```
手機（GitHub Pages 靜態網頁 / PWA）
   └─ POST → Google Apps Script（apps-script/Code.gs）→ Google 試算表
                                    └─ 每天 3 次 → Discord 提醒
```

- 試算表的「帳號」分頁記錄所有帳號，密碼只存加鹽雜湊。
- 每個帳號有自己的分頁，名稱＝帳號名稱；舊資料沿用「工作表1」。
- 登入後，這台裝置會拿到 90 天有效的權杖，之後不用再輸入。

## 後端更新步驟（改了 `apps-script/Code.gs` 才需要）

1. 開啟試算表 → 擴充功能 → Apps Script，把 `Code.gs` 全部貼進去取代舊程式碼。
2. 左側「專案設定」→「指令碼屬性」，新增：

   | 屬性 | 說明 |
   |---|---|
   | `REGISTER_CODE` | 註冊邀請碼，自己訂一組，只告訴家人（必填） |
   | `DISCORD_WEBHOOK` | Discord webhook 網址（選填） |
   | `LEGACY_OWNER` | 舊資料的主人帳號，例如 `mom`（選填） |
   | `SPREADSHEET_ID` | 指令碼綁在試算表裡可不填 |

3. 編輯器選 `setupTriggers` 執行一次（只要設定過就不用再跑）。
4. 部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選「新版本」→ 部署。
   網址不會變，所以不用改 `config.js`。
5. 「存取權」維持「任何人」，網頁才連得到。資料有登入權杖保護。

## 讓媽媽接手舊資料

`LEGACY_OWNER` 設成媽媽想用的帳號（例如 `mom`），再用這個帳號名稱到網頁「建立帳號」。
系統會把她的帳號對應到原本的「工作表1」，舊紀錄就會出現在她的歷史頁。

## 家人忘記密碼

管理者看不到任何人的密碼（只存雜湊），但可以重設：

1. Apps Script 編輯器找到 `resetPassword`，把 `USERNAME` 和 `NEW_PASSWORD` 改成要重設的帳號與新密碼，存檔。
2. 上方函式選單選 `resetPassword`，按「執行」。這是直接在編輯器執行，不用重新部署。
3. 把新密碼告訴家人，然後把兩個值改回提示文字再存檔。

重設後，該帳號在所有裝置上都會被登出，需要用新密碼重新登入。

## 安全提醒

- `放在google apps script的東西.txt` 已列入 `.gitignore`，裡面有 webhook，不要上傳。
- 那個檔案裡的 Discord webhook 曾經以明文出現在對話與本機檔案，建議到 Discord
  「伺服器設定 → 整合 → Webhook」刪除舊的、建立新的，再填進 `DISCORD_WEBHOOK`。
- 想換邀請碼，到「指令碼屬性」改 `REGISTER_CODE` 即可，已建立的帳號不受影響。
