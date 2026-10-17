import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { usePageTitle, useSession } from '../hooks/hooks'
import { T } from '../text'
import { btnQuiet, wrap } from '../ui'

const H = T.help

/** 圖上「要點的地方」：橘色外圈 */
const spot = 'rounded-md outline-[3px] outline-offset-2 outline-[#c9670a]'

function Phone({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="m-0 flex w-[150px] flex-col items-center gap-2 print:break-inside-avoid">
      <div className="flex h-[250px] w-[132px] flex-col overflow-hidden rounded-[22px] border-4 border-ink bg-card text-[10px] leading-snug">
        {children}
      </div>
      <figcaption className="text-center text-sm font-bold text-ink-soft">{caption}</figcaption>
    </figure>
  )
}

const ShareIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`size-6 ${className}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 15V3" />
    <path d="m8 7 4-4 4 4" />
    <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
  </svg>
)

const iconUrl = `${import.meta.env.BASE_URL}icons/web-app-manifest-192x192.png`

function StepBox({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-card border border-line bg-card p-4 print:break-inside-avoid">
      <p className="text-sm font-bold text-teal-deep">{H.step(n)}</p>
      <h2 className="text-[1.375rem] leading-snug font-black">{title}</h2>
      {children}
    </section>
  )
}

function Steps({ items }: { items: readonly string[] }) {
  return (
    <ol className="mt-2 space-y-1.5 pl-0">
      {items.map((text, i) => (
        <li key={text} className="flex gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-deep text-base font-black text-white">
            {i + 1}
          </span>
          <span className="pt-0.5">{text}</span>
        </li>
      ))}
    </ol>
  )
}

/** 使用教學：怎麼加到手機桌面、登入、記錄血壓。可以直接列印給長輩。 */
export default function HelpPage() {
  usePageTitle(H.pageTitle)
  const session = useSession()
  const site = `${location.origin}${import.meta.env.BASE_URL}`

  return (
    <main className={`${wrap} pb-12 print:max-w-none print:px-0`}>
      <div className="pt-6 print:hidden">
        <Link to={session ? '/' : '/login'} className="inline-block py-2 font-bold text-teal-deep underline underline-offset-[3px]">
          {session ? H.backApp : H.backLogin}
        </Link>
      </div>

      <h1 className="mt-2 text-[1.75rem] leading-tight font-black print:mt-0">{H.heading}</h1>
      <p className="mt-1 text-muted">{H.intro}</p>

      <div className="mt-4 rounded-card bg-ok-bg px-4 py-3">
        <p className="text-sm text-ok">{H.siteLabel}</p>
        <p className="text-lg font-black break-all text-teal-deep">{site}</p>
      </div>

      {/* 第 1 步：加到桌面 */}
      <StepBox n={1} title={H.s1.title}>
        <h3 className="mt-3 text-lg font-black">{H.s1.iphone}</h3>
        <Steps items={H.s1.iphoneSteps} />
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          <Phone caption={H.s1.mockShare}>
            <div className="flex-1 bg-paper p-2 text-center text-muted">
              <div className="mt-6 rounded bg-card py-1 font-bold text-ink">{site.replace(/^https?:\/\//, '').slice(0, 24)}…</div>
            </div>
            <div className="flex items-center justify-around border-t border-line bg-card py-2 text-teal-deep">
              <span className="text-lg">‹</span>
              <span className="text-lg">›</span>
              <ShareIcon className={spot} />
              <span className="text-base">▢</span>
            </div>
          </Phone>
          <Phone caption={H.s1.mockAdd}>
            <div className="flex-1 bg-paper px-2 pt-4">
              <div className="rounded-lg bg-card text-[11px] font-bold">
                <p className="border-b border-line px-2 py-1.5">拷貝</p>
                <p className="border-b border-line px-2 py-1.5">加入書籤</p>
                <p className={`mx-1 my-1 px-1.5 py-1.5 ${spot} bg-warn-bg`}>加入主畫面 ＋</p>
                <p className="px-2 py-1.5">在頁面上尋找</p>
              </div>
            </div>
          </Phone>
          <Phone caption={H.s1.mockHome}>
            <div className="flex flex-1 flex-wrap content-start gap-3 bg-[#cfe3e0] p-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-9 rounded-lg bg-white/60" />
              ))}
              <span className="flex w-12 flex-col items-center gap-0.5">
                <img src={iconUrl} alt="" className={`size-9 rounded-lg ${spot}`} />
                <span className="text-[9px] font-bold text-ink">{T.app.name}</span>
              </span>
            </div>
          </Phone>
        </div>

        <h3 className="mt-5 text-lg font-black">{H.s1.android}</h3>
        <Steps items={H.s1.androidSteps} />
        <div className="mt-3 flex justify-center">
          <Phone caption={H.s1.mockMenu}>
            <div className="flex-1 bg-paper px-2 pt-2">
              <p className="text-right text-base font-black text-ink">
                <span className={`px-1.5 ${spot}`}>⋮</span>
              </p>
              <div className="mt-1 ml-6 rounded-lg bg-card text-[11px] font-bold shadow">
                <p className="border-b border-line px-2 py-1.5">新分頁</p>
                <p className="border-b border-line px-2 py-1.5">書籤</p>
                <p className={`mx-1 my-1 px-1.5 py-1.5 ${spot} bg-warn-bg`}>加到主畫面</p>
                <p className="px-2 py-1.5">設定</p>
              </div>
            </div>
          </Phone>
        </div>
        <p className="mt-3 font-bold text-teal-deep">{H.s1.done}</p>
      </StepBox>

      {/* 第 2 步：建立帳號 */}
      <StepBox n={2} title={H.s2.title}>
        <Steps items={H.s2.steps} />
        <div className="mt-3 flex justify-center">
          <Phone caption={T.login.modeRegister}>
            <div className="flex-1 space-y-1.5 bg-paper p-2">
              <div className="grid grid-cols-2 gap-1 text-center text-[10px] font-bold">
                <span className="rounded border border-line bg-card py-1">{T.login.modeLogin}</span>
                <span className={`rounded border-2 border-teal bg-ok-bg py-1 text-teal-deep ${spot}`}>{T.login.modeRegister}</span>
              </div>
              {[T.login.usernamePlaceholder, T.login.displayNamePlaceholder, T.login.passwordPlaceholderRegister].map((t) => (
                <p key={t} className="truncate rounded border border-line bg-card px-1.5 py-1.5 text-[9px] text-muted">
                  {t}
                </p>
              ))}
            </div>
          </Phone>
        </div>
      </StepBox>

      {/* 第 3 步：記錄 */}
      <StepBox n={3} title={H.s3.title}>
        <Steps items={H.s3.steps} />
        <div className="mt-3 flex justify-center">
          <Phone caption={H.s3.mockBp}>
            <div className="flex-1 bg-paper p-2">
              <div className={`rounded-xl bg-ink px-2 py-3 text-center text-white ${spot}`}>
                <p className="text-[9px] text-[#a9c7c8]">{T.record.panelCaption}</p>
                <p className="text-[26px] leading-tight font-black">120/80</p>
                <p className="text-[9px] text-[#a9c7c8]">{T.common.pulse} 70</p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-center text-[10px] font-bold">
                <span className="rounded border-2 border-teal bg-ok-bg py-1.5 text-teal-deep">有吃</span>
                <span className="rounded border border-line bg-card py-1.5">沒吃</span>
              </div>
              <p className={`mt-3 rounded-lg bg-teal-deep py-2 text-center text-[11px] font-black text-white ${spot}`}>{H.s3.mockSave}</p>
            </div>
          </Phone>
        </div>
      </StepBox>

      {/* 第 4 步：小功能 */}
      <StepBox n={4} title={H.s4.title}>
        <dl className="mt-2 space-y-2">
          {H.s4.items.map(([q, a]) => (
            <div key={q}>
              <dt className="font-black text-teal-deep">{q}</dt>
              <dd className="m-0">{a}</dd>
            </div>
          ))}
        </dl>
      </StepBox>

      <p className="mt-6 text-center text-lg font-black">{H.contact}</p>

      <button type="button" className={`${btnQuiet} mt-6 print:hidden`} onClick={() => window.print()}>
        {H.print}
      </button>
    </main>
  )
}
