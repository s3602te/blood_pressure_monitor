// 瀏覽器實測：用真的 Edge 開「建置好的網站」，後端用假的（不會動到真的試算表）。
// 執行方式：npm run build && node e2e/e2e.mjs
// 截圖會存到 e2e/shots/（已列入 .gitignore）。
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const EDGE = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 4173
const BASE = `http://localhost:${PORT}/blood_pressure_monitor/`
const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url))
mkdirSync(SHOTS, { recursive: true })

/* ───── 假後端 ───── */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n, h, m = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(h, m, 0, 0)
  return d
}
let rows = []
const addRow = (d, sys, dia, pulse, med, notes = '') =>
  rows.push({ row: rows.length + 2, date: iso(d), sys, dia, pulse, med, notes, at: d.getTime() })
for (let n = 9; n >= 1; n--) {
  addRow(daysAgo(n, 7, 40), 128 + (n % 5) * 4, 78 + (n % 3) * 3, 70 + n, n > 4 ? '沒吃' : '有吃')
  if (n % 2) addRow(daysAgo(n, 22, 10), 136 + (n % 4), 82 + (n % 4), 72, n > 4 ? '沒吃' : '有吃', n === 5 ? '晚睡' : '')
}
addRow(daysAgo(1, 22, 11), 136, 83, 72, '有吃') // 一筆 1 秒內重複的資料
rows[rows.length - 1].at += 1000

let online = true
const adminAccounts = [
  { username: 'mom', displayName: '媽媽', lastSeen: Date.now(), lastRecord: daysAgo(5, 8).getTime(), count: 12 },
  { username: 'dad', displayName: 'dad', lastSeen: 0, lastRecord: 0, count: 0 },
]
const deletedCalls = []
const calls = []
const ok = (o = {}) => ({ ok: true, ...o })
function handle(p) {
  calls.push(p.action)
  switch (p.action) {
    case 'ping': return ok()
    case 'login':
      return p.username === 'mom' && p.password === '1234'
        ? ok({ token: 'tok', username: 'mom', displayName: '媽媽' })
        : { ok: false, error: '帳號或密碼不正確' }
    case 'register': return p.inviteCode === 'abc' ? ok({ token: 'tok', username: p.username, displayName: p.displayName || p.username }) : { ok: false, error: '邀請碼不正確' }
    case 'logout': return ok()
    case 'list': return p.token === 'tok' ? ok({ displayName: '媽媽', records: rows.map((r) => ({ ...r })) }) : { ok: false, error: '登入已過期', code: 'AUTH' }
    case 'add':
      rows.push({ row: rows.length + 2, date: p.date, sys: +p.systolic, dia: +p.diastolic, pulse: +p.pulse, med: p.medication, notes: p.notes || '', at: +p.clientAt || Date.now() })
      return ok()
    case 'update': {
      const r = rows.find((x) => x.row === +p.row && x.at === +p.origAt)
      if (!r) return { ok: false, error: '這筆紀錄已經有變動', code: 'STALE' }
      Object.assign(r, { date: p.date, sys: +p.systolic, dia: +p.diastolic, pulse: +p.pulse, med: p.medication, notes: p.notes })
      return ok()
    }
    case 'delete': {
      const i = rows.findIndex((x) => x.row === +p.row && x.at === +p.origAt)
      if (i < 0) return { ok: false, error: '這筆紀錄已經有變動', code: 'STALE' }
      rows.splice(i, 1)
      rows.forEach((x, k) => (x.row = k + 2))
      return ok()
    }
    case 'adminList': return p.adminCode === 'boss' ? ok({ accounts: adminAccounts.map((a) => ({ ...a })) }) : { ok: false, error: '管理密碼不正確' }
    case 'adminDelete': {
      if (p.adminCode !== 'boss') return { ok: false, error: '管理密碼不正確' }
      const i = adminAccounts.findIndex((a) => a.username === p.username)
      if (i < 0) return { ok: false, error: '找不到這個帳號' }
      adminAccounts.splice(i, 1)
      deletedCalls.push({ username: p.username, deleteData: p.deleteData })
      return ok()
    }
    case 'adminReset': return ok()
    default: return { ok: false, error: '不支援的操作' }
  }
}

/* ───── 簡單的檢查工具 ───── */
let fails = 0
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg)
  if (!cond) fails++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: true })
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) return } catch { /* 等一下 */ }
    await sleep(500)
  }
  throw new Error('preview 沒有啟動')
}

let browser
try {
  await waitServer()
  browser = await chromium.launch({ executablePath: EDGE, headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'zh-TW', timezoneId: 'Asia/Taipei' })
  await context.route('https://script.google.com/**', async (route) => {
    if (!online) return route.abort('failed')
    const p = Object.fromEntries(new URLSearchParams(route.request().postData() || ''))
    await sleep(30)
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(handle(p)) })
  })
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('dialog', (d) => d.accept())
  // 選項按鈕的 radio 是透明蓋在文字上面的，所以直接勾選它
  const pick = (name, value) => page.locator(`input[name="${name}"][value="${value}"]`).check()
  const shot = (name) => page.screenshot({ path: SHOTS + name + '.png', fullPage: true })

  // 1. 沒登入 → 登入頁
  await page.goto(BASE)
  await page.waitForURL(/#\/login/)
  check(await page.getByRole('button', { name: '登入', exact: true }).isVisible(), '沒登入會到登入頁')
  check(((await page.locator('#username').getAttribute('placeholder')) || '').includes('手機號碼'), '帳號欄位提示填手機號碼')
  check(await page.getByText(/忘記密碼？請直接聯絡序亞/).isVisible() && await page.getByText(/不會自動寄信/).isVisible(), '登入頁有小字：忘記密碼請聯絡序亞，並說明不會自動寄信')
  await page.getByRole('link', { name: /看使用教學/ }).click()
  await page.getByRole('heading', { name: /使用教學/ }).waitFor()
  check(await page.getByText('加入主畫面').first().isVisible() && await page.getByText('收縮壓 / 舒張壓').isVisible(), '使用教學頁：有加到桌面與記錄血壓的圖解')
  await shot('01b-help')
  await page.getByRole('link', { name: /回登入頁/ }).click()
  await page.getByRole('button', { name: '登入', exact: true }).waitFor()
  await shot('01-login')

  // 2. 登入錯誤、再登入
  await page.locator('#username').fill('mom')
  await page.locator('#password').fill('0000')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.getByText('帳號或密碼不正確').waitFor()
  check(true, '密碼錯誤會顯示錯誤')
  await page.locator('#password').fill('1234')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.getByRole('heading', { name: '記錄今天的血壓' }).waitFor()
  check(true, '登入後到記錄頁')
  await shot('02-record')
  check(await page.getByText('測量日期', { exact: true }).isVisible() && !(await page.getByText('量測日期').count()), '「量測日期」已改成「測量日期」')
  check(!(await page.getByText(/版本/).count()), '頁面上平常看不到版本字樣')
  check(await page.getByText('點右上角「放大」，字會變大').isVisible(), '第一次使用的提示很短：點右上角「放大」，字會變大')
  check((await page.getByRole('button', { name: '放大', exact: true }).getAttribute('class')).includes('animate-hint'), '「放大」按鈕會閃爍提示')
  await shot('02a-font-hint')
  await page.getByRole('button', { name: '知道了' }).click()
  check(!(await page.getByText('點右上角「放大」，字會變大').count()), '按「知道了」之後不再顯示提示')
  check(!(await page.getByRole('button', { name: '放大', exact: true }).getAttribute('class')).includes('animate-hint'), '提示消失後按鈕不再閃爍')
  check(await page.getByText('早上還沒記錄').isVisible() && await page.getByText('晚上還沒記錄').isVisible(), '今天還沒記錄：早上、晚上都沒有打勾')
  const brand = page.getByText('血壓記錄', { exact: true }).first()
  for (let i = 0; i < 4; i++) await brand.click()
  check(!(await page.getByRole('dialog').count()), '點 4 下不會出現版本資訊')
  await brand.click()
  await page.getByRole('heading', { name: '版本資訊' }).waitFor()
  check(await page.getByText('建置時間').isVisible(), '連點 5 下出現版本資訊')
  await page.mouse.click(5, 5) // 連點多按了一下，點到視窗外的灰色背景
  await page.mouse.click(190, 30)
  await sleep(200)
  check(await page.getByText('建置時間').isVisible(), '連點時多按幾下，版本資訊不會馬上消失')
  await shot('02b-version')
  await page.getByRole('button', { name: '關閉' }).click()
  for (let i = 0; i < 5; i++) await brand.click()
  await page.getByRole('button', { name: /管理員頁面/ }).click()
  await page.waitForURL(/#\/admin/)
  await page.getByRole('link', { name: /回記錄頁/ }).waitFor()
  check(await page.locator('#adminCode').isVisible(), '從版本資訊可以直接進管理員頁面（要輸入管理密碼）')
  await page.getByRole('link', { name: /回記錄頁/ }).click()
  await page.getByRole('heading', { name: '記錄今天的血壓' }).waitFor()

  // 3. 記錄血壓
  await page.locator('#systolic').fill('121')
  await page.locator('#diastolic').fill('79')
  await page.locator('#pulse').fill('66')
  await pick('medication', '有吃')
  await page.getByRole('button', { name: '儲存紀錄' }).click()
  await page.getByRole('heading', { name: '已儲存' }).waitFor()
  check(rows.some((r) => r.sys === 121 && r.dia === 79), '儲存成功，假後端收到')
  check(!(await page.getByText('不是診斷').count()), '血壓正常時不會多出提醒')
  await shot('03-saved')
  await page.getByRole('button', { name: '好' }).click()
  check((await page.locator('#systolic').inputValue()) === '', '儲存後表單清空')
  check((await page.getByText(/^✓ (早上|晚上)已記錄$/).count()) === 1, '儲存後，剛記錄的那個時段打勾、另一個沒有')
  await shot('03a-today-status')

  // 偏高、很高的提醒
  await page.locator('#systolic').fill('150')
  await page.locator('#diastolic').fill('92')
  await page.locator('#pulse').fill('80')
  await pick('medication', '有吃')
  await page.getByRole('button', { name: '儲存紀錄' }).click()
  await page.getByRole('heading', { name: /已儲存，這次偏高/ }).waitFor()
  check(await page.getByText(/休息 5 分鐘後再量一次/).isVisible(), '偏高：顯示溫和提醒')
  await shot('03b-high-advice')
  await page.waitForTimeout(4500)
  check(await page.getByRole('heading', { name: /這次偏高/ }).isVisible(), '提醒不會自動消失，要按「好」')
  await page.getByRole('button', { name: '好' }).click()
  await page.locator('#systolic').fill('185')
  await page.locator('#diastolic').fill('115')
  await page.locator('#pulse').fill('90')
  await pick('medication', '沒吃')
  await page.getByRole('button', { name: '儲存紀錄' }).click()
  await page.getByRole('heading', { name: /數值很高/ }).waitFor()
  check(await page.getByText(/撥 119/).isVisible(), '很高：提醒聯絡家人、必要時撥 119')
  await shot('03c-veryhigh-advice')
  await page.getByRole('button', { name: '好' }).click()

  // 4. 沒網路：頂欄提示、暫存 → 恢復後補送
  await context.setOffline(true)
  await page.getByText('目前沒有網路').waitFor()
  check(true, '手機沒網路時，頂欄顯示「目前沒有網路」')
  await shot('03d-offline-banner')
  await context.setOffline(false)
  await page.getByText('目前沒有網路').waitFor({ state: 'detached' })
  check(true, '恢復網路後提示自動消失')
  online = false
  await page.locator('#systolic').fill('133')
  await page.locator('#diastolic').fill('88')
  await page.locator('#pulse').fill('77')
  await pick('medication', '沒吃')
  await page.getByRole('button', { name: '儲存紀錄' }).click()
  await page.getByRole('heading', { name: '已暫存在手機' }).waitFor()
  check(true, '沒網路時顯示「已暫存在手機」')
  await shot('04-offline-saved')
  await page.getByRole('button', { name: '好' }).click()
  check(await page.getByText('有 1 筆血壓還沒上傳').isVisible(), '顯示暫存提醒')
  await shot('05-pending-banner')
  online = true
  const before = rows.length
  await page.getByRole('button', { name: '現在重試上傳' }).click()
  await page.getByRole('heading', { name: /已補送 1 筆/ }).waitFor()
  check(rows.length === before + 1 && rows.at(-1).sys === 133, '恢復連線後補送成功')
  await page.getByRole('button', { name: '好' }).click()
  check(!(await page.getByText('還沒上傳').isVisible()), '提醒消失')

  // 5. 放大字體（按鈕「放大」／「縮小」）
  const fontPx = () => page.evaluate(() => getComputedStyle(document.body).fontSize)
  check((await fontPx()) === '18px', '預設字體 18px')
  await page.getByRole('button', { name: '放大', exact: true }).click()
  check((await fontPx()) === '22.5px', '放大後字體 22.5px')
  await shot('06-large-record')
  await page.getByRole('button', { name: '縮小', exact: true }).click()
  check((await fontPx()) === '18px', '按「縮小」可以回到標準字')

  // 6. 歷史頁
  await page.getByRole('link', { name: '歷史紀錄' }).click()
  await page.getByRole('heading', { name: '歷史紀錄' }).waitFor()
  await page.locator('canvas').first().waitFor()
  await sleep(600)
  check((await page.locator('tbody tr').count()) === 7, '歷史頁顯示 7 天')
  check(await page.getByText('和上週比較', { exact: true }).isVisible(), '歷史頁有「和上週比較」')
  check(await page.getByRole('heading', { name: '最近 1 個月' }).isVisible() && (await page.locator('canvas').count()) === 2, '歷史頁有「最近 1 個月」總覽與圖表')
  await page.getByRole('heading', { name: '最近 1 個月' }).scrollIntoViewIfNeeded()
  await sleep(300)
  await shot('07b-month')
  check(await page.getByText(/比上週低|比上週高|和上週差不多|有升有降/).first().isVisible(), '「和上週比較」有給出一句結論')
  await shot('07-history')
  const rowCount = rows.length
  await page.getByRole('button', { name: /修改或刪除/ }).first().click()
  await page.getByRole('dialog').waitFor()
  await shot('08-day-dialog')
  const dupDay = page.getByRole('dialog').locator('div.rounded-card')
  const items = await dupDay.count()
  check(items >= 1, `修改視窗列出 ${items} 筆`)
  await page.getByRole('dialog').getByRole('button', { name: '修改', exact: true }).first().click()
  await page.locator('#editSys').fill('119')
  await shot('09-edit-form')
  await page.getByRole('button', { name: '儲存修改' }).click()
  await page.getByRole('dialog').getByText('119/').first().waitFor()
  check(rows.some((r) => r.sys === 119), '修改成功寫回後端')
  const snapshot = rows.map((r) => ({ ...r }))
  await page.getByRole('dialog').getByRole('button', { name: '刪除' }).first().click()
  await sleep(400)
  check(rows.length === rowCount - 1, '刪除成功')
  const gone = snapshot.find((r) => !rows.some((x) => x.at === r.at && x.sys === r.sys))
  await page.getByText('已刪除', { exact: true }).waitFor()
  await shot('09b-undo-toast')
  await page.getByRole('button', { name: /復原/ }).click()
  await page.getByText('已刪除', { exact: true }).waitFor({ state: 'detached' })
  const back = rows.find((r) => r.at === gone.at && r.sys === gone.sys && r.date === gone.date)
  check(rows.length === rowCount && !!back, '按「復原」把刪掉的那筆放回去，且保留原本的記錄時間')
  await page.keyboard.press('Escape')
  check(!(await page.getByRole('dialog').count()), 'Esc 可以關閉視窗')
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await sleep(500)
  await shot('10-history-large')
  await page.getByRole('button', { name: '縮小', exact: true }).click()

  // 7. 給醫師看
  await page.getByRole('link', { name: '給醫師看' }).click()
  await page.getByRole('heading', { name: '血壓紀錄' }).waitFor()
  check(await page.getByText('記錄天數').isVisible(), '醫師頁顯示統計')
  const mmdd = (() => { const d = new Date(); return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') })()
  check((await page.locator('tbody').first().locator('td').first().innerText()).includes(mmdd), '給醫師看：最新的（今天）在最上面，和歷史頁順序一致')
  check((await page.locator('tbody').count()) >= 5, '同一天的量測放在同一個區塊')
  check(await page.getByText('狀況：晚睡').isVisible(), '報告預設包含備註（已自動勾選）')
  await page.getByLabel(/報告裡包含/).uncheck()
  check(!(await page.getByText('狀況：晚睡').count()), '取消勾選後，報告裡不再出現備註')
  const [dl0] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV/ }).click()])
  const csv0 = (await import('node:fs')).readFileSync(await dl0.path(), 'utf8')
  check(!csv0.includes('今日狀況') && !csv0.includes('晚睡'), '取消勾選後，CSV 也不含備註')
  await page.getByLabel(/報告裡包含/).check()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV/ }).click()])
  const csv = (await import('node:fs')).readFileSync(await download.path(), 'utf8')
  check(csv.startsWith('\uFEFF日期,星期,時段') && csv.trim().split('\r\n').length >= 6, 'CSV 下載成功（有標題、每次量測一列）')
  check(download.suggestedFilename().endsWith('.csv') && download.suggestedFilename().includes('媽媽'), 'CSV 檔名含姓名與期間')
  await shot('11-doctor-7')
  const [bPdf, bCsv] = [await page.getByRole('button', { name: /^PDF/ }).boundingBox(), await page.getByRole('button', { name: /^CSV/ }).boundingBox()]
  check(Math.abs(bPdf.width - bCsv.width) < 1 && Math.abs(bPdf.height - bCsv.height) < 1, '「PDF」「CSV」兩個按鈕大小一樣')
  check(await page.getByText('列印／存成', { exact: true }).isVisible(), '標題「列印／存成」，下面左右兩個選項')
  await pick('range', '30')
  await sleep(200)
  await shot('12-doctor-30')
  await pick('range', 'custom')
  check(await page.locator('#fromDate').isVisible(), '自訂會出現日期欄位')
  await page.emulateMedia({ media: 'print' })
  check(!(await page.locator('nav').isVisible()), '列印時隱藏導覽列')
  check((await page.locator('main').evaluate((el) => getComputedStyle(el).maxWidth)) === 'none', '列印時表格用滿紙張寬度（不是手機的窄版面）')
  await shot('13-doctor-print')
  await page.pdf({ path: SHOTS + 'doctor-a4.pdf', format: 'A4', printBackground: true })
  const pdfText = (await import('node:fs')).readFileSync(SHOTS + 'doctor-a4.pdf', 'latin1')
  const pdfPages = (pdfText.match(/\/Type\s*\/Page[^s]/g) || []).length
  const readingsCount = rows.length
  check(pdfPages >= 1 && pdfPages <= 3, `A4 列印 ${readingsCount} 次量測只要 ${pdfPages} 頁`)
  await page.setViewportSize({ width: 794, height: 1123 })
  await shot('13b-print-a4-width')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ media: 'screen' })

  // 8. 重新整理仍保持登入；登出
  await page.reload()
  await page.getByRole('heading', { name: '血壓紀錄' }).waitFor()
  check(true, '重新整理後仍保持登入')
  await page.getByRole('button', { name: '登出' }).click()
  await page.waitForURL(/#\/login/)
  check(true, '登出回到登入頁')

  // 9. 建立帳號、舊網址、管理頁
  await pick('mode', 'register')
  check(await page.getByText('向序亞詢問').isVisible(), '註冊頁邀請碼文字')
  check(((await page.locator('#displayName').getAttribute('placeholder')) || '').includes('王小美') && await page.getByText('請填自己的姓名').isVisible(), '顯示名稱改成提示填自己的姓名')
  check(((await page.locator('#password').getAttribute('placeholder')) || '').includes('0304') && await page.getByText(/用生日 4 碼/).isVisible(), '密碼提示用生日 4 碼（例如 0304）')
  check(!(await page.getByText(/忘記密碼？請直接聯絡序亞/).count()), '建立帳號畫面不顯示忘記密碼的說明')
  await page.locator('#username').fill('abc')
  await page.locator('#password').fill('0304')
  await page.locator('#inviteCode').fill('abc')
  await page.locator('form button[type="submit"]').click()
  await page.getByText(/帳號請輸入 10 碼手機號碼/).waitFor()
  check(true, '建立帳號：不是 10 碼手機號碼會被擋下，並說明怎麼填')
  await page.locator('#username').fill('09123')
  await page.locator('form button[type="submit"]').click()
  check(await page.getByText(/帳號請輸入 10 碼手機號碼/).isVisible(), '建立帳號：位數不對也會被擋')
  check((await page.locator('#username').getAttribute('inputmode')) === 'numeric', '建立帳號時帳號欄位會跳出數字鍵盤')
  await shot('14-register')
  await page.goto(BASE + 'admin.html')
  await page.waitForURL(/#\/admin/)
  check(true, '舊網址 admin.html 自動帶到管理頁')
  await page.locator('#adminCode').fill('boss')
  await page.getByRole('button', { name: '進入' }).click()
  await page.locator('#account').waitFor()
  check(await page.getByText('帳號使用狀況').isVisible() && await page.getByText('從來沒有').first().isVisible(), '管理頁顯示各帳號最後使用／最後記錄')
  check((await page.locator('section[aria-label="帳號使用狀況"] tbody tr').first().innerText()).includes('dad'), '最久沒記錄的排在最前面')
  await page.locator('#newPassword').fill('5678')
  await page.getByRole('button', { name: '重設密碼' }).click()
  await page.getByText(/新密碼是「5678」/).waitFor()
  check(true, '管理頁可重設密碼')
  await page.locator('section[aria-label="帳號使用狀況"] tbody tr').first().getByRole('button', { name: '刪除帳號' }).click()
  await page.getByRole('dialog').waitFor()
  await shot('15a-delete-dialog')
  const sureBtn = page.getByRole('button', { name: '確定刪除' })
  check(await sureBtn.isDisabled(), '刪除帳號：沒輸入帳號之前「確定刪除」按不下去')
  await page.getByLabel(/要確認的話/).fill('dad')
  check(await sureBtn.isEnabled(), '輸入對方帳號後才能按「確定刪除」')
  await sureBtn.click()
  await page.getByText(/已刪除帳號/).waitFor()
  check(deletedCalls.length === 1 && deletedCalls[0].username === 'dad' && deletedCalls[0].deleteData === 'false', '刪除帳號：預設保留紀錄（不連資料一起刪）')
  check(!(await page.locator('section[aria-label="帳號使用狀況"]').getByText('dad').count()), '刪除後，帳號從清單消失')
  await shot('15-admin')

  check(errors.length === 0, '沒有任何 JS 錯誤' + (errors.length ? '：' + errors.join(' | ') : ''))
} catch (e) {
  console.error(e)
  fails++
} finally {
  await browser?.close()
  server.kill()
  spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
}
console.log(fails ? `有 ${fails} 項失敗` : '全部通過')
process.exit(fails ? 1 : 0)
