import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { adminDelete, adminList, adminReset, errorOf, type AdminAccount } from '../lib/api'
import { Modal } from '../components/Modal'
import { agoText, daysSince } from '../lib/records'
import { usePageTitle } from '../hooks/hooks'
import { T } from '../text'
import { btnDanger, btnPrimary, btnQuiet, field, fieldHint, fieldLabel, input, linkBtn, pageTitle, statusBase, statusKind, wrap } from '../ui'

/** 管理頁：幫忘記密碼的家人換新密碼。管理密碼只留在這個頁面的記憶體裡，關掉頁面就消失，不會存到瀏覽器。 */
export default function AdminPage() {
  usePageTitle(T.admin.pageTitle)
  const [adminCode, setAdminCode] = useState('')
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null)
  const [groups, setGroups] = useState<string[]>([])
  const [groupFilter, setGroupFilter] = useState('')
  const [selected, setSelected] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<AdminAccount | null>(null)
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
    setGroups(result.groups ?? [])
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

      {accounts && accounts.length > 0 && (
        <AccountStatus
          accounts={groupFilter ? accounts.filter((a) => a.group === groupFilter) : accounts}
          label={label}
          onDelete={setDeleting}
          groups={groups}
          groupFilter={groupFilter}
          onGroupFilter={setGroupFilter}
        />
      )}

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

      {deleting && (
        <DeleteDialog
          account={deleting}
          who={label(deleting)}
          adminCode={adminCode}
          onClose={() => setDeleting(null)}
          onDeleted={async (who) => {
            setDeleting(null)
            const result = await adminList(adminCode)
            if (result.ok) {
              setAccounts(result.accounts)
              setGroups(result.groups ?? [])
              setSelected(result.accounts[0]?.username ?? '')
            }
            setStatus({ text: T.admin.deleted(who), kind: 'ok' })
          }}
        />
      )}
    </main>
  )
}

/** 誰多久沒用了：最後使用＝最近一次打開網站，最後記錄＝最近一次存血壓。很久沒記錄的用橘色、紅色標出來。 */
function AccountStatus({
  accounts,
  label,
  onDelete,
  groups,
  groupFilter,
  onGroupFilter,
}: {
  accounts: AdminAccount[]
  label: (a: AdminAccount) => string
  onDelete: (a: AdminAccount) => void
  groups: string[]
  groupFilter: string
  onGroupFilter: (group: string) => void
}) {
  const showGroup = groups.length > 1 // 只有一群的時候不用顯示群組
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
      {showGroup && (
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor="groupFilter" className="font-bold">
            {T.admin.groupFilter}
          </label>
          <select
            id="groupFilter"
            className={`${input} min-h-11 w-auto px-3! py-1!`}
            value={groupFilter}
            onChange={(e) => onGroupFilter(e.target.value)}
          >
            <option value="">{T.admin.groupAll}</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      )}
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
              <td className="border-b border-line py-2.5 pr-2 align-top break-all">
                {label(a)}
                {showGroup && <span className="block text-sm font-normal text-muted">{a.group}</span>}
                <button
                  type="button"
                  className={`${linkBtn} block py-1! text-[0.9375rem]! text-danger!`}
                  onClick={() => onDelete(a)}
                >
                  {T.admin.delete}
                </button>
              </td>
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

/** 刪除帳號的確認視窗：要輸入對方的帳號才能按「確定刪除」，避免誤刪。 */
function DeleteDialog({
  account,
  who,
  adminCode,
  onClose,
  onDeleted,
}: {
  account: AdminAccount
  who: string
  adminCode: string
  onClose: () => void
  onDeleted: (who: string) => Promise<void>
}) {
  const [deleteData, setDeleteData] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const confirm = async () => {
    setBusy(true)
    setError('')
    const result = await adminDelete(adminCode, account.username, deleteData)
    if (!result.ok) {
      setBusy(false)
      setError(errorOf(result, T.admin.deleteFailed))
      return
    }
    await onDeleted(who)
  }

  return (
    <Modal onClose={busy ? () => {} : onClose} labelledBy="deleteTitle" wide>
      <h2 id="deleteTitle" className="text-[1.375rem] leading-tight font-black">
        {T.admin.deleteTitle(who)}
      </h2>
      <p className="mt-2 text-muted">{T.admin.deleteExplain}</p>
      <p className="mt-1 text-muted">{deleteData ? '' : T.admin.deleteKeep}</p>

      <label className="mt-4 flex cursor-pointer items-start gap-3 font-bold">
        <input
          type="checkbox"
          className="mt-1 size-6 shrink-0 accent-danger"
          checked={deleteData}
          onChange={(e) => setDeleteData(e.target.checked)}
        />
        <span>{T.admin.deleteData}</span>
      </label>

      <div className={field}>
        <label className={fieldLabel} htmlFor="deleteConfirmInput">
          {T.admin.deleteTypeLabel(account.username)}
        </label>
        <input
          id="deleteConfirmInput"
          className={input}
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-3.5 py-3 font-bold text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button type="button" className={btnQuiet} disabled={busy} onClick={onClose}>
          {T.common.cancel}
        </button>
        <button
          type="button"
          className={btnDanger}
          disabled={busy || typed.trim() !== account.username}
          onClick={() => void confirm()}
        >
          {busy ? T.admin.deleting : T.admin.deleteConfirm}
        </button>
      </div>
    </Modal>
  )
}
