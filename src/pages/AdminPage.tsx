import { useState, type FormEvent } from 'react'
import { adminList, adminReset, errorOf } from '../lib/api'
import { usePageTitle } from '../hooks/hooks'
import { btnPrimary, field, fieldHint, fieldLabel, input, pageTitle, statusBase, statusKind, wrap } from '../ui'

interface Account {
  username: string
  displayName: string
}

/** 管理頁：幫忘記密碼的家人換新密碼。管理密碼只留在這個頁面的記憶體裡，關掉頁面就消失，不會存到瀏覽器。 */
export default function AdminPage() {
  usePageTitle('管理')
  const [adminCode, setAdminCode] = useState('')
  const [accounts, setAccounts] = useState<Account[] | null>(null)
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

  const label = (a: Account) =>
    a.displayName && a.displayName !== a.username ? `${a.displayName}（${a.username}）` : a.username

  const reset = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !accounts) return
    const who = label(accounts.find((a) => a.username === selected) as Account)
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
