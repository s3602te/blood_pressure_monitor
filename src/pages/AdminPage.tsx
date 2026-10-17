import { useState, type FormEvent } from 'react'
import { adminList, adminReset, errorOf, type AdminAccount } from '../lib/api'
import { agoText, daysSince } from '../lib/records'
import { usePageTitle } from '../hooks/hooks'
import { btnPrimary, field, fieldHint, fieldLabel, input, pageTitle, statusBase, statusKind, wrap } from '../ui'

/** 管理頁：幫忘記密碼的家人換新密碼。管理密碼只留在這個頁面的記憶體裡，關掉頁面就消失，不會存到瀏覽器。 */
export default function AdminPage() {
  usePageTitle('管理')
  const [adminCode, setAdminCode] = useState('')
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null)
  const [selected, setSelected] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ text: string; kind: keyof typeof statusKind } | null>(null)

  const unlock = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setStatus({ text: '確認中…', kind: 'info' })
    const result = await adminList(adminCode)
    setBusy(false)
    if (!result.ok) {
      setStatus({ text: errorOf(result, '發生錯誤，請再試一次'), kind: 'error' })
      return
    }
    setAccounts(result.accounts)
    setSelected(result.accounts[0]?.username ?? '')
    setStatus(result.accounts.length ? null : { text: '目前還沒有任何帳號', kind: 'info' })
  }

  const label = (a: AdminAccount) =>
    a.displayName && a.displayName !== a.username ? `${a.displayName}（${a.username}）` : a.username

  const reset = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !accounts) return
    const who = label(accounts.find((a) => a.username === selected) as AdminAccount)
    const password = newPassword
    setBusy(true)
    setStatus({ text: '重設中…', kind: 'info' })
    const result = await adminReset(adminCode, selected, password)
    setBusy(false)
    if (!result.ok) {
      setStatus({ text: errorOf(result, '重設失敗，請再試一次'), kind: 'error' })
      return
    }
    setNewPassword('')
    setStatus({ text: `已重設 ${who} 的密碼，新密碼是「${password}」，請告訴對方。`, kind: 'ok' })
  }

  return (
    <main className={wrap}>
      <div className="pt-12">
        <h1 className={`${pageTitle} mt-0! text-[2.125rem]!`}>管理：重設密碼</h1>
        <p className="mt-1 text-muted">幫忘記密碼的家人換一個新密碼。</p>
      </div>

      {accounts && accounts.length > 0 && <AccountStatus accounts={accounts} label={label} />}

      {!accounts ? (
        <form onSubmit={unlock}>
          <div className={field}>
            <label className={fieldLabel} htmlFor="adminCode">
              管理密碼
            </label>
            <input
              id="adminCode"
              className={input}
              type="password"
              autoComplete="off"
              required
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
            />
          </div>
          <button className={btnPrimary} type="submit" disabled={busy}>
            進入
          </button>
        </form>
      ) : (
        <form onSubmit={reset}>
          <div className={field}>
            <label className={fieldLabel} htmlFor="account">
              要重設誰的密碼
            </label>
            <select id="account" className={input} required value={selected} onChange={(e) => setSelected(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.username} value={a.username}>
                  {label(a)}
                </option>
              ))}
            </select>
          </div>
          <div className={field}>
            <label className={fieldLabel} htmlFor="newPassword">
              新密碼 <span className={fieldHint}>（至少 4 個字元）</span>
            </label>
            <input
              id="newPassword"
              className={input}
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              minLength={4}
              maxLength={64}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <button className={btnPrimary} type="submit" disabled={busy}>
            重設密碼
          </button>
        </form>
      )}

      <p role="status" aria-live="polite" className={status ? `${statusBase} ${statusKind[status.kind]}` : ''}>
        {status?.text}
      </p>
      <p className="mt-[18px] text-[0.9375rem] text-muted">
        重設後，對方在所有裝置上都會被登出，要用新密碼重新登入。紀錄不會消失。
      </p>
    </main>
  )
}

/** 誰多久沒用了：最後使用＝最近一次打開網站，最後記錄＝最近一次存血壓。很久沒記錄的用橘色、紅色標出來。 */
function AccountStatus({ accounts, label }: { accounts: AdminAccount[]; label: (a: AdminAccount) => string }) {
  const now = new Date()
  // 最久沒記錄的排最前面
  const sorted = [...accounts].sort((a, b) => a.lastRecord - b.lastRecord)
  const tone = (ms: number) => {
    const d = daysSince(ms, now)
    if (d === null || d >= 7) return 'font-black text-danger'
    if (d >= 3) return 'font-bold text-warn'
    return ''
  }
  return (
    <section aria-label="帳號使用狀況" className="mt-6 rounded-card border border-line bg-card p-4">
      <h2 className="text-xl font-black">帳號使用狀況</h2>
      <table className="mt-2 w-full border-collapse text-left">
        <thead>
          <tr className="text-[0.9375rem] font-medium text-muted">
            <th className="border-b-2 border-line py-1.5 pr-2 font-medium">帳號</th>
            <th className="border-b-2 border-line py-1.5 pr-2 font-medium">最後使用</th>
            <th className="border-b-2 border-line py-1.5 font-medium">最後記錄</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => (
            <tr key={a.username}>
              <td className="border-b border-line py-2.5 pr-2 align-top break-all">{label(a)}</td>
              <td className={`border-b border-line py-2.5 pr-2 align-top whitespace-nowrap ${tone(a.lastSeen)}`}>
                {agoText(a.lastSeen, now)}
              </td>
              <td className={`border-b border-line py-2.5 align-top whitespace-nowrap ${tone(a.lastRecord)}`}>
                {agoText(a.lastRecord, now)}
                <span className="block text-sm font-normal text-muted">共 {a.count} 筆</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-sm text-muted">橘色＝超過 3 天，紅色＝超過 7 天或從來沒有。最後使用從這次更新後才開始記錄。</p>
    </section>
  )
}
