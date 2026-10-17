import { Suspense, useRef, useState } from 'react'
import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { VersionDialog } from './VersionDialog'
import { logout } from '../lib/api'
import { fontSize } from '../lib/storage'
import { useLargeFont, useSession } from '../hooks/hooks'
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
  const [showVersion, setShowVersion] = useState(false)
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
            <button type="button" className={linkBtn} onClick={() => fontSize.set(!large)}>
              {large ? '標準字' : '放大字'}
            </button>
            <button type="button" className={linkBtn} onClick={askLogout}>
              登出
            </button>
          </div>
        </div>
      </header>

      <main className={`${wrap} pb-[calc(5.5rem+env(safe-area-inset-bottom))] print:pb-0`}>
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
