import type { Trend, TrendKind } from '../lib/records'

const STYLE: Record<TrendKind, { box: string; headline: string }> = {
  notEnough: { box: 'border-line bg-card text-ink', headline: '再多記錄幾天，就能和上週比較了' },
  better: { box: 'border-teal bg-ok-bg text-ok', headline: '比上週低，好轉中 ↓' },
  steady: { box: 'border-teal bg-ok-bg text-ok', headline: '和上週差不多，維持得很好 ✓' },
  worse: { box: 'border-warn bg-warn-bg text-warn', headline: '比上週高，要多留意 ↑' },
  steadyHigh: { box: 'border-warn bg-warn-bg text-warn', headline: '和上週差不多，但仍然偏高' },
  mixed: { box: 'border-line bg-card text-ink', headline: '和上週相比有升有降' },
}

const signed = (n: number) => (n === 0 ? '一樣' : n > 0 ? `高 ${n}` : `低 ${-n}`)

/** 這週（最近 7 天）和上週的平均血壓比較，一句話告訴長輩是變好、持平還是要留意 */
export function TrendCard({ trend }: { trend: Trend }) {
  const style = STYLE[trend.kind]
  const { thisWeek, lastWeek } = trend

  return (
    <section aria-label="和上週比較" className={`mt-5 rounded-card border-2 px-4 py-3.5 ${style.box}`}>
      <p className="text-[0.9375rem] opacity-80">和上週比較</p>
      <p className="text-[1.375rem] leading-snug font-black">{style.headline}</p>
      {trend.kind === 'notEnough' ? (
        <p className="mt-1 text-[0.9375rem] opacity-90">最近 7 天和前 7 天，各要至少有 3 天的紀錄。</p>
      ) : (
        thisWeek &&
        lastWeek && (
          <>
            <p className="mt-1 tabular-nums">
              這週平均 <strong>{thisWeek.sys}/{thisWeek.dia}</strong>　上週 {lastWeek.sys}/{lastWeek.dia}
            </p>
            <p className="text-[0.9375rem] opacity-90">
              收縮壓{signed(trend.dSys)}、舒張壓{signed(trend.dDia)}（單位 mmHg）
            </p>
            {trend.kind === 'worse' && (
              <p className="mt-1 text-[0.9375rem]">如果連續幾週都偏高，回診時記得給醫師看「給醫師看」的紀錄。</p>
            )}
          </>
        )
      )}
    </section>
  )
}
