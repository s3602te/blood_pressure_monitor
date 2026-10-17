import type { Trend, TrendKind } from '../lib/records'
import { T } from '../text'

const STYLE: Record<TrendKind, { box: string; headline: string }> = {
  notEnough: { box: 'border-line bg-card text-ink', headline: T.trend.notEnough },
  better: { box: 'border-teal bg-ok-bg text-ok', headline: T.trend.better },
  steady: { box: 'border-teal bg-ok-bg text-ok', headline: T.trend.steady },
  worse: { box: 'border-warn bg-warn-bg text-warn', headline: T.trend.worse },
  steadyHigh: { box: 'border-warn bg-warn-bg text-warn', headline: T.trend.steadyHigh },
  mixed: { box: 'border-line bg-card text-ink', headline: T.trend.mixed },
}

const signed = (n: number) => (n === 0 ? T.trend.same : n > 0 ? T.trend.higher(n) : T.trend.lower(-n))
const md = (iso: string) => iso.slice(5).replace('-', '/')

/** 這週（最近 7 天）和上週的平均血壓比較，一句話告訴長輩是變好、持平還是要留意 */
export function TrendCard({ trend }: { trend: Trend }) {
  const style = STYLE[trend.kind]
  const { thisWeek, lastWeek, range } = trend
  const stillHigh = !!thisWeek && (thisWeek.sys >= 135 || thisWeek.dia >= 85)

  return (
    <section aria-label={T.trend.title} className={`mt-5 rounded-card border-2 px-4 py-3.5 ${style.box}`}>
      <p className="text-[0.9375rem] opacity-80">{T.trend.title}</p>
      <p className="text-[1.375rem] leading-snug font-black">{style.headline}</p>
      {trend.kind === 'notEnough' ? (
        <p className="mt-1 text-[0.9375rem] opacity-90">{T.trend.notEnoughHint}</p>
      ) : (
        thisWeek &&
        lastWeek && (
          <>
            <p className="mt-1 tabular-nums">
              {T.trend.thisWeek(md(range.thisFrom), md(range.thisTo), `${thisWeek.sys}/${thisWeek.dia}`)}
            </p>
            <p className="tabular-nums">
              {T.trend.lastWeek(md(range.lastFrom), md(range.lastTo), `${lastWeek.sys}/${lastWeek.dia}`)}
            </p>
            <p className="text-[0.9375rem] opacity-90">
              {T.trend.delta(signed(trend.dSys), signed(trend.dDia))}
            </p>
            {(trend.kind === 'better' || trend.kind === 'mixed') && stillHigh && (
              <p className="mt-1 text-[0.9375rem] font-bold text-warn">
                {T.trend.stillHigh}
              </p>
            )}
            {trend.kind === 'worse' && (
              <p className="mt-1 text-[0.9375rem]">{T.trend.worseHint}</p>
            )}
          </>
        )
      )}
    </section>
  )
}
