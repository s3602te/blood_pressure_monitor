import { useState } from 'react'
import { stampCard, type StampDay, type StampItem } from '../lib/stamps'
import { dayLabel } from '../lib/records'
import { T } from '../text'

type DotSize = 'sm' | 'md'

const DOT_SIZE: Record<DotSize, string> = {
  sm: 'size-[1.375rem] border-2 text-[0.6875rem]',
  md: 'size-9 border-[3px] text-base',
}

/**
 * 一排小圓點（最近 7 天，左邊最早、右邊是今天）：蓋了章的有勾，沒蓋的是虛線空圈，今天有外框。
 * 縮起來的蓋章條和「已儲存」視窗都用這個。dataPrefix 是給自動測試分辨用的。
 */
export function MiniDots({
  days,
  size = 'sm',
  animateToday = false,
  dataPrefix = 'data',
}: {
  days: StampDay[]
  size?: DotSize
  /** 今天那一格像「剛蓋上去」一樣啪一下蓋下來（儲存成功的視窗用） */
  animateToday?: boolean
  dataPrefix?: 'data' | 'data-dialog'
}) {
  return (
    <span aria-hidden="true" className={`flex items-center ${size === 'sm' ? 'gap-0.5' : 'gap-1'}`}>
      {days.map((d) => {
        const attrs = { [`${dataPrefix}-stamped`]: d.stamped, [`${dataPrefix}-today`]: d.isToday }
        return (
          <span
            key={d.iso}
            {...attrs}
            className={`flex shrink-0 items-center justify-center rounded-full font-black ${DOT_SIZE[size]} ${
              d.stamped
                ? '-rotate-6 border-teal-deep bg-ok-bg text-teal-deep'
                : 'border-dashed border-line bg-paper text-transparent'
            } ${d.isToday ? 'ring-[3px] ring-teal/30' : ''} ${d.isToday && d.stamped && animateToday ? 'animate-stamp [animation-delay:250ms]' : ''}`}
          >
            ✓
          </span>
        )
      })}
    </span>
  )
}

/**
 * 記錄頁上方的蓋章卡。平常縮成一條（約 50px，只看得到最近 7 天的小圓點和「連續 N 天」），
 * 點一下才展開完整的蓋章卡；每次打開網站都是縮起來的，不擋住輸入血壓的欄位。
 * 語氣放輕鬆：中斷了不責備，只說「今天重新開始」。
 */
export function StampCard({ items }: { items: StampItem[] }) {
  const [open, setOpen] = useState(false)
  const { streak, week, earned, next } = stampCard(items, new Date())

  let hint: string
  if (streak.total === 0) hint = T.stamp.startHint
  else if (streak.current === 0) hint = T.stamp.restart(streak.best)
  else if (!streak.recordedToday) hint = T.stamp.todayTodo
  else hint = T.stamp.todayDone

  return (
    <section aria-label={T.stamp.title} className="mt-4 rounded-card border-2 border-teal/30 bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="stampDetail"
        aria-label={T.stamp.toggleAria(open, streak.current)}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[3.25rem] w-full cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-card border-0 bg-transparent px-3.5 py-2 text-left text-ink"
      >
        {open ? <span className="text-lg font-black">{T.stamp.title}</span> : <MiniDots days={week} size="sm" />}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <span className="text-lg font-black whitespace-nowrap text-teal-deep tabular-nums" data-streak={streak.current}>
            {T.stamp.streak(streak.current)}
          </span>
          <span aria-hidden="true" className="text-lg text-muted">
            {open ? '▴' : '▾'}
          </span>
        </span>
      </button>

      {open && (
        <div id="stampDetail" className="border-t border-line px-4 pt-3 pb-4">
          <ol className="grid grid-cols-7 gap-1 pl-0" aria-label={T.stamp.title}>
            {week.map((d) => {
              const label = `${dayLabel(d.iso).label} ${T.common.weekday(d.weekday)}`
              return (
                <li key={d.iso} className="flex flex-col items-center gap-0.5" data-stamped={d.stamped} data-today={d.isToday}>
                  <span
                    role="img"
                    aria-label={d.stamped ? T.stamp.stampedAria(label) : T.stamp.emptyAria(label)}
                    className={`flex size-11 items-center justify-center rounded-full border-[3px] text-xl font-black ${
                      d.stamped
                        ? '-rotate-6 border-teal-deep bg-ok-bg text-teal-deep'
                        : 'border-dashed border-line bg-paper text-transparent'
                    } ${d.isToday ? 'ring-4 ring-teal/30' : ''}`}
                  >
                    ✓
                  </span>
                  <span className="h-4 text-sm leading-none text-[#c9670a]" aria-label={d.star ? T.stamp.starAria : undefined}>
                    {d.star ? '★' : ''}
                  </span>
                  <span className={`text-sm ${d.isToday ? 'font-black text-teal-deep' : 'text-muted'}`}>
                    {d.isToday ? T.stamp.today : d.weekday}
                  </span>
                </li>
              )
            })}
          </ol>

          <p className="mt-2 text-center font-bold">{hint}</p>
          {next ? (
            <p className="text-center text-[0.9375rem] text-muted">{T.stamp.next(next.daysLeft, next.milestone.name)}</p>
          ) : (
            <p className="text-center text-[0.9375rem] text-muted">{T.stamp.allDone}</p>
          )}

          <div className="mt-3 border-t border-line pt-3">
            <p className="text-sm font-bold text-muted">{T.stamp.badges}</p>
            {earned.length ? (
              <ul className="mt-1.5 flex flex-wrap gap-2 pl-0">
                {earned.map((m) => (
                  <li
                    key={m.days}
                    className="rounded-full border-2 border-[#c9670a] bg-warn-bg px-3 py-1 text-[0.9375rem] font-black text-warn"
                  >
                    {m.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[0.9375rem] text-muted">{T.stamp.noBadges}</p>
            )}
            <p className="mt-2 text-sm text-muted">★ {T.stamp.star}</p>
          </div>
        </div>
      )}
    </section>
  )
}
