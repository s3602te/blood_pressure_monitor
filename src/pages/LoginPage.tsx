import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { authenticate, errorOf, ping, saveSession } from '../lib/api'
import { usePageTitle, useSession } from '../hooks/hooks'
import { T } from '../text'
import { btnPrimary, field, fieldHint, fieldLabel, input, segInput, segLabel, segWrap, statusBase, statusKind, wrap } from '../ui'

/** 登入／建立帳號。登入一次之後這支手機會保持登入，不用每次輸入。 */
export default function LoginPage() {
  usePageTitle(T.login.pageTitle)
  const session = useSession()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ text: string; kind: keyof typeof statusKind } | null>(null)

  useEffect(() => {
    void ping() // 先喚醒伺服器，等一下按登入就不用等冷啟動
  }, [])

  if (session) return <Navigate to="/" replace />

  const register = mode === 'register'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    // 帳號就是手機號碼：把不小心輸入的空白、橫線去掉（0912-345-678 → 0912345678）
    const phone = username.replace(/[\s\-－—]/g, '')
    if (register && !/^0\d{9}$/.test(phone)) {
      setStatus({ text: T.login.phoneInvalid, kind: 'error' })
      return
    }
    setBusy(true)
    setStatus({ text: register ? T.login.busyRegister : T.login.busyLogin, kind: 'info' })

    const result = await authenticate(mode, {
      username: phone,
      password,
      ...(register ? { displayName: displayName.trim(), inviteCode: inviteCode.trim() } : {}),
    })
    if (result.ok) {
      saveSession(result) // 存好之後畫面會自動跳到記錄頁
      return
    }
    setStatus({ text: errorOf(result, T.common.fallbackError), kind: 'error' })
    setBusy(false)
  }

  return (
    <main className={wrap}>
      <div className="pt-12">
        <h1 className="text-[2.125rem] leading-tight font-black">{T.login.heading}</h1>
        <p className="mt-1 text-muted">{T.login.subtitle}</p>
      </div>

      <div className={`${segWrap} mt-[26px]`} role="radiogroup" aria-label={T.login.modeAria}>
        {(
          [
            ['login', T.login.modeLogin],
            ['register', T.login.modeRegister],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="relative m-0 block">
            <input
              className={segInput}
              type="radio"
              name="mode"
              value={value}
              checked={mode === value}
              onChange={() => {
                setMode(value)
                setStatus(null)
              }}
            />
            <span className={segLabel}>{label}</span>
          </label>
        ))}
      </div>

      <form onSubmit={submit}>
        <div className={field}>
          <label className={fieldLabel} htmlFor="username">
            {T.login.username}
            {register && <span className={fieldHint}> {T.login.usernameHintRegister}</span>}
          </label>
          <input
            id="username"
            className={input}
            type="text"
            inputMode={register ? 'numeric' : 'text'}
            placeholder={T.login.usernamePlaceholder}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        {register && (
          <div className={field}>
            <label className={fieldLabel} htmlFor="displayName">
              {T.login.displayName} <span className={fieldHint}>{T.login.displayNameHint}</span>
            </label>
            <input
              id="displayName"
              className={input}
              type="text"
              placeholder={T.login.displayNamePlaceholder}
              maxLength={20}
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
        )}

        <div className={field}>
          <label className={fieldLabel} htmlFor="password">
            {T.login.password}
            {register && <span className={fieldHint}> {T.login.passwordHintRegister}</span>}
          </label>
          <div className="relative">
            <input
              id="password"
              className={`${input} pr-[76px]`}
              placeholder={register ? T.login.passwordPlaceholderRegister : T.login.passwordPlaceholderLogin}
              type={showPassword ? 'text' : 'password'}
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 cursor-pointer border-0 bg-transparent px-2.5 py-2 text-base font-bold text-teal-deep"
              aria-controls="password"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? T.login.hide : T.login.show}
            </button>
          </div>
        </div>

        {register && (
          <div className={field}>
            <label className={fieldLabel} htmlFor="inviteCode">
              {T.login.inviteCode} <span className={fieldHint}>{T.login.inviteHint}</span>
            </label>
            <input
              id="inviteCode"
              className={input}
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
          </div>
        )}

        <button className={btnPrimary} type="submit" disabled={busy}>
          {register ? T.login.submitRegister : T.login.submitLogin}
        </button>
        <p role="status" aria-live="polite" className={status ? `${statusBase} ${statusKind[status.kind]}` : ''}>
          {status?.text}
        </p>
      </form>

      {!register && <p className="mt-5 text-sm text-muted">{T.login.forgot}</p>}
      <p className="mt-4 pb-10 text-sm">
        <Link to="/help" className="font-bold text-teal-deep underline underline-offset-[3px]">
          {T.login.helpLink}
        </Link>
      </p>
    </main>
  )
}
