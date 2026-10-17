import type { ChartMode } from '../lib/records'
import { T } from '../text'

const MODES: { value: ChartMode; label: string }[] = [
  { value: 'all', label: T.chart.all },
  { value: 'morning', label: T.chart.morning },
  { value: 'evening', label: T.chart.evening },
]

/** 圖表要看哪個時段：早晚一起（預設）／只看早上／只看晚上。三個按鈕選一個。 */
export function ChartModeSwitch({ value, onChange }: { value: ChartMode; onChange: (mode: ChartMode) => void }) {
  return (
    <div role="radiogroup" aria-label={T.chart.modeAria} className="mt-3 grid grid-cols-3 gap-2">
      {MODES.map((m) => {
        const on = m.value === value
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(m.value)}
            className={`min-h-12 cursor-pointer rounded-card border-2 px-1 text-base font-bold ${
              on ? 'border-teal bg-ok-bg text-teal-deep' : 'border-line bg-card text-ink'
            }`}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}

/** 圖表下面一行說明，讓人（和印出來的報告）知道現在看的是哪個時段 */
export const chartCaption = (mode: ChartMode) =>
  mode === 'morning' ? T.chart.captionMorning : mode === 'evening' ? T.chart.captionEvening : T.chart.captionAll
