# 血壓記錄

給家中長輩每天記錄血壓用的網站（可以加到手機桌面，像 App 一樣使用）。

**網站：** https://s3602te.github.io/blood_pressure_monitor/

## 功能

- **記錄血壓**：大字、簡單的表單；儲存後依數值給溫和提醒（偏高、很高、偏低）；上方顯示今天早上、晚上各記錄了沒。
- **沒訊號也能記**：資料先存在手機，有網路時自動補送，不會重複。
- **歷史紀錄**：每週走勢圖、和上週比較、最近 1 個月總覽；填錯了可以修改或刪除（刪除後 15 秒內可復原）。
- **給醫師看**：選 7／30／90 天或自訂範圍，整理出平均與偏高次數，可列印成 PDF 或下載 CSV。
- **放大字體**、**使用教學**（怎麼加到手機桌面，可列印）。
- **管理員頁面**：重設密碼、看誰多久沒記錄、刪除帳號、依群組分開管理。
- **後台自動化**：Discord 提醒（只點名還沒記錄的人）、每週自動備份試算表。

## 運作方式

```
手機（GitHub Pages 上的網站，React + Vite + Tailwind）
   └─ POST → Google Apps Script（apps-script/Code.gs）→ Google 試算表（每個人一個分頁）
                                    ├─ 每天 07:00、21:45 → Discord 提醒
                                    └─ 每週日 03:00 → 備份到雲端硬碟

GitHub Actions：push 到 main → 型別檢查 → 測試 → 建置 → 自動發佈
```

## 更新網站

1. 改程式（網站上看得到的文字全部在 `src/text.ts`）。
2. `git add .`、`git commit -m "說明"`、`git push`。
3. 等 1～2 分鐘，GitHub 會自動測試並發佈；到 [Actions](https://github.com/s3602te/blood_pressure_monitor/actions) 看到綠色勾勾就上線了。

改了後端（`apps-script/Code.gs`）要另外到 Apps Script 貼上並「管理部署作業 → 鉛筆 → 新版本」，細節見 [`SETUP.md`](SETUP.md)。

## 在自己的電腦上開發

```bash
npm install
npm run dev          # 開發模式
npm run test:all     # 型別檢查 + 單元測試 + 後端模擬測試
npm run build        # 建置
```

## 文件

- [`SETUP.md`](SETUP.md)：部署、指令碼屬性、群組、備份、忘記密碼、專案結構。
- [`CLAUDE.md`](CLAUDE.md)：給 Claude Code 的專案說明（架構、注意事項、合作方式）。
