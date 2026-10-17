import { stampCard, type StampItem } from '../lib/stamps'
import { dayLabel } from '../lib/records'
import { T } from '../text'

/**
 * 記錄頁最上面的「蓋章卡」：最近 7 天，有記錄的那天蓋一個章；早晚都量再加一顆星。
 * 下面是連續天數、離下一個章還差幾天，以及已經得到的章。語氣放輕鬆：中斷了不責備，只說「重新開始」。
 */
export function StampCard({ items }: { items: StampItem[] }) {
  const { streak, week, earned, next } = stampCard(items, new Date())

  let hint: string
  if (streak.total === 0) hint = T.stamp.startHint
  else if (streak.current === 0) hint = T.stamp.restart(streak.best)
  else if (!streak.recordedToday) hint = T.stamp.todayTodo
  else hint = T.stamp.todayDone

  return (
    <section aria-label={T.stamp.title} className="mt-4 rounded-card border-2 border-teal/30 bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-black">{T.stamp.title}</h2>
        <p className="text-[1.625rem] leading-none font-black text-teal-deep tabular-nums" data-streak={streak.current}>
          {T.stamp.streak(streak.current)}
        </p>
      </div>

      <ol className="mt-3 grid grid-cols-7 gap-1 pl-0" aria-label={T.stamp.title}>
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
    </section>
  )
}
