import { Suspense, useRef, useState } from 'react'
import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { VersionDialog } from './VersionDialog'
import { logout } from '../lib/api'
import { fontHint, fontSize } from '../lib/storage'
import { useLargeFont, useOnline, useSession } from '../hooks/hooks'
import { linkBtn, wrap } from '../ui'

const NAV = [
  { to: '/', label: '記錄血壓' },
  { to: '/history', label: '歷史紀錄' },
  { to: '/doctor', label: '給醫師看' },
]

/** 登入後的共用外框：頂欄（名字、放大字、登出）＋底部分頁列。沒登入就回登入頁。 */
export function Layout() {
  const session = useSession()
  const large = useLargeFont()
  const online = useOnline()
  const [showVersion, setShowVersion] = useState(false)
  const [showHint, setShowHint] = useState(() => !fontHint.seen())
  const taps = useRef<number[]>([])
  if (!session) return <Navigate to="/login" replace />

  const tapBrand = () => {
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < 3000), now]
    if (taps.current.length >= 5) {
      taps.current = []
      setShowVersion(true)
    }
  }

  const askLogout = () => {
    if (confirm('確定要登出嗎？\n登出後要重新輸入帳號和密碼。')) void logout()
  }

  return (
    <>
      <header className="border-b border-line bg-card print:hidden">
        <div className={`${wrap} flex min-h-14 flex-wrap items-center justify-between gap-x-3`}>
          {/* 連點 5 下（3 秒內）會彈出版本資訊，給管理者查看；長輩平常不會注意到 */}
          <span className="text-xl font-black select-none" onClick={tapBrand}>
            血壓記錄
          </span>
          <div className="flex items-center gap-3 text-base text-muted">
            <span>{session.displayName || session.username}</span>
            <button
              type="button"
              className={`${linkBtn} rounded-lg ${showHint && !large ? 'animate-hint' : ''}`}
              onClick={() => {
                fontHint.dismiss() // 按過放大字，就不用再提示了
                setShowHint(false)
                fontSize.set(!large)
              }}
            >
              {large ? '標準字' : '放大字'}
            </button>
            <button type="button" className={linkBtn} onClick={askLogout}>
              登出
            </button>
          </div>
        </div>
      </header>

      {(!online || (showHint && !large)) && (
        <div className={`${wrap} print:hidden`}>
          {!online && (
            <p role="status" className="mt-3 rounded-xl bg-warn-bg px-4 py-3 font-bold text-warn">
              目前沒有網路。血壓會先存在手機，連上網路後自動補送。
            </p>
          )}
          {showHint && !large && (
            <div role="note" className="animate-hint mt-3 flex items-center gap-3 rounded-xl bg-ok-bg px-4 py-3 text-ok">
              <p className="flex-1 text-lg font-black">點右上角「放大字」，字會變大</p>
              <button
                type="button"
                className="min-h-11 shrink-0 cursor-pointer rounded-xl border-2 border-teal bg-card px-3 font-bold text-teal-deep"
                onClick={() => {
                  fontHint.dismiss()
                  setShowHint(false)
                }}
              >
                知道了
              </button>
            </div>
          )}
        </div>
      )}

      <main className={`${wrap} pb-[calc(5.5rem+env(safe-area-inset-bottom))] print:max-w-none print:px-0 print:pb-0`}>
        <Suspense fallback={<p className="mt-6 text-muted">讀取中…</p>}>
          <Outlet />
        </Suspense>
      </main>

      {showVersion && <VersionDialog username={session.username} onClose={() => setShowVersion(false)} />}

      <nav
        aria-label="主要頁面"
        className="fixed inset-x-0 bottom-0 grid grid-cols-3 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] print:hidden"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `flex min-h-16 items-center justify-center border-t-4 text-[1.0625rem] font-bold no-underline ${
                isActive ? 'border-teal text-teal-deep' : 'border-transparent text-muted'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
