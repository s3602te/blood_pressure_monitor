import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type Plugin,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { HIGH_DIA, HIGH_SYS, type DayAgg } from '../lib/records'
import { useLargeFont } from '../hooks/hooks'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)
ChartJS.defaults.font.family = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif'

const SYS_COLOR = '#1f5f8b'
const DIA_COLOR = '#2ba38f'
const HIGH_COLOR = '#c9670a'

// 135 和 85 的參考虛線：一眼看出哪幾天超過
const refLines: Plugin<'line'> = {
  id: 'refLines',
  afterDatasetsDraw(chart) {
    const {
      ctx,
      chartArea: area,
      scales: { y },
    } = chart
    for (const [value, color] of [
      [HIGH_SYS, SYS_COLOR],
      [HIGH_DIA, DIA_COLOR],
    ] as const) {
      if (value < y.min || value > y.max) continue
      const py = y.getPixelForValue(value)
      ctx.save()
      ctx.setLineDash([6, 5])
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(area.left, py)
      ctx.lineTo(area.right, py)
      ctx.stroke()
      ctx.restore()
    }
  },
}

/** 血壓走勢圖：收縮壓、舒張壓兩條線，高於參考值的點是橘色大圓點，點一下可以看脈搏和吃藥 */
export function ChartPanel({ days }: { days: DayAgg[] }) {
  const k = useLargeFont() ? 1.25 : 1 // 放大字體時圖表文字一起放大

  const line = (label: string, key: 'sys' | 'dia', color: string, limit: number) => ({
    label,
    data: days.map((d) => d[key]),
    borderColor: color,
    backgroundColor: color,
    borderWidth: 3,
    tension: 0.25,
    // 高於參考值的點改成橘色並放大，一看就知道
    pointBackgroundColor: (c: { raw: unknown }) => ((c.raw as number) >= limit ? HIGH_COLOR : color),
    pointBorderColor: (c: { raw: unknown }) => ((c.raw as number) >= limit ? HIGH_COLOR : color),
    pointRadius: (c: { raw: unknown }) => ((c.raw as number) >= limit ? 7 : 4),
    pointHoverRadius: 8,
  })

  return (
    <div className="relative h-[300px]">
      <Line
        aria-label="血壓走勢圖"
        role="img"
        plugins={[refLines]}
        data={{
          labels: days.map((d) => d.label),
          datasets: [
            line('收縮壓（高壓）', 'sys', SYS_COLOR, HIGH_SYS),
            line('舒張壓（低壓）', 'dia', DIA_COLOR, HIGH_DIA),
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: { ticks: { autoSkip: false, font: { size: 13 * k } } },
            y: { suggestedMin: 50, suggestedMax: 160, ticks: { font: { size: 13 * k } } },
          },
          plugins: {
            legend: { labels: { usePointStyle: true, font: { size: 14 * k } } },
            tooltip: {
              titleFont: { size: 14 * k },
              bodyFont: { size: 14 * k },
              footerFont: { size: 13 * k },
              callbacks: {
                footer: (items) => {
                  const d = days[items[0].dataIndex]
                  return [`脈搏：${d.pulse ?? '--'}`, `吃藥：${d.med}`]
                },
              },
            },
          },
        }}
      />
    </div>
  )
}
