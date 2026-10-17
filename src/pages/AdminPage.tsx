import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { adminList, adminReset, errorOf, type AdminAccount } from '../lib/api'
import { agoText, daysSince } from '../lib/records'
import { usePageTitle } from '../hooks/hooks'
import { T } from '../text'
import { btnPrimary, field, fieldHint, fieldLabel, input, pageTitle, statusBase, statusKind, wrap } from '../ui'

/** 管理頁：幫忘記密碼的家人換新密碼。管理密碼只留在這個頁面的記憶體裡，關掉頁面就消失，不會存到瀏覽器。 */
export default function AdminPage() {
  usePageTitle(T.admin.pageTitle)
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
    setStatus({ text: T.admin.checking, kind: 'info' })
    const result = await adminList(adminCode)
    setBusy(false)
    if (!result.ok) {
      setStatus({ text: errorOf(result, T.common.fallbackError), kind: 'error' })
      return
    }
    setAccounts(result.accounts)
    setSelected(result.accounts[0]?.username ?? '')
    setStatus(result.accounts.length ? null : { text: T.admin.noAccounts, kind: 'info' })
  }

  const label = (a: AdminAccount) =>
    a.displayName && a.displayName !== a.username ? `${a.displayName}（${a.username}）` : a.username

  const reset = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !accounts) return
    const who = label(accounts.find((a) => a.username === selected) as AdminAccount)
    const password = newPassword
    setBusy(true)
    setStatus({ text: T.admin.resetting, kind: 'info' })
    const result = await adminReset(adminCode, selected, password)
    setBusy(false)
    if (!result.ok) {
      setStatus({ text: errorOf(result, T.admin.resetFailed), kind: 'error' })
      return
    }
    setNewPassword('')
    setStatus({ text: T.admin.resetDone(who, password), kind: 'ok' })
  }

  return (
    <main className={wrap}>
      <div className="pt-6">
        <Link to="/" className="inline-block py-2 font-bold text-teal-deep underline underline-offset-[3px]">
          {T.admin.back}
        </Link>
        <h1 className={`${pageTitle} mt-2! text-[2.125rem]!`}>{T.admin.heading}</h1>
        <p className="mt-1 text-muted">{T.admin.intro}</p>
      </div>

      {accounts && accounts.length > 0 && <AccountStatus accounts={accounts} label={label} />}

      {!accounts ? (
        <form onSubmit={unlock}>
          <div className={field}>
            <label className={fieldLabel} htmlFor="adminCode">
              {T.admin.adminCode}
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
            {T.admin.enter}
          </button>
        </form>
      ) : (
        <form onSubmit={reset}>
          <div className={field}>
            <label className={fieldLabel} htmlFor="account">
              {T.admin.whoLabel}
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
              {T.admin.newPassword} <span className={fieldHint}>{T.admin.newPasswordHint}</span>
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
            {T.admin.reset}
          </button>
        </form>
      )}

      <p role="status" aria-live="polite" className={status ? `${statusBase} ${statusKind[status.kind]}` : ''}>
        {status?.text}
      </p>
      <p className="mt-[18px] text-[0.9375rem] text-muted">{T.admin.footer}</p>
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
    <section aria-label={T.admin.statusTitle} className="mt-6 rounded-card border border-line bg-card p-4">
      <h2 className="text-xl font-black">{T.admin.statusTitle}</h2>
      <table className="mt-2 w-full border-collapse text-left">
        <thead>
          <tr className="text-[0.9375rem] font-medium text-muted">
            <th className="border-b-2 border-line py-1.5 pr-2 font-medium">{T.admin.colAccount}</th>
            <th className="border-b-2 border-line py-1.5 pr-2 font-medium">{T.admin.colLastSeen}</th>
            <th className="border-b-2 border-line py-1.5 font-medium">{T.admin.colLastRecord}</th>
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
                <span className="block text-sm font-normal text-muted">{T.admin.count(a.count)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-sm text-muted">{T.admin.statusNote}</p>
    </section>
  )
}
