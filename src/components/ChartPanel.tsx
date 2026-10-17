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
import { T } from '../text'
import { useLargeFont } from '../hooks/hooks'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)
ChartJS.defaults.font.family = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif'

const SYS_COLOR = '#1f5f8b' // 藍色＝收縮壓（高壓）
const DIA_COLOR = '#2ba38f' // 綠色＝舒張壓（低壓）
const HIGH_COLOR = '#c9670a' // 橘色外圈＝高於參考值

// 135 和 85 的參考虛線（右邊標上數字）：一眼看出哪幾天超過
const refLines: Plugin<'line'> = {
  id: 'refLines',
  afterDatasetsDraw(chart) {
    const {
      ctx,
      chartArea: area,
      scales: { y },
    } = chart
    const size = Number(chart.options.font?.size ?? 12)
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
      ctx.setLineDash([])
      ctx.globalAlpha = 1
      ctx.fillStyle = color
      ctx.font = `700 ${size}px ${ChartJS.defaults.font.family}`
      ctx.textAlign = 'right'
      ctx.fillText(String(value), area.right - 2, py - 4)
      ctx.restore()
    }
  },
}

/**
 * 血壓走勢圖：藍線＝收縮壓（高壓），綠線＝舒張壓（低壓）。
 * 點的顏色永遠和線一樣；高於參考值的點會變大，並加上橘色外圈。
 * 點一下可以看脈搏和吃藥。
 */
export function ChartPanel({ days }: { days: DayAgg[] }) {
  const k = useLargeFont() ? 1.25 : 1 // 放大字體時圖表文字一起放大

  const line = (label: string, key: 'sys' | 'dia', color: string, limit: number) => {
    const isHigh = (c: { raw: unknown }) => (c.raw as number) >= limit
    return {
      label,
      data: days.map((d) => d[key]),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 3,
      tension: 0.25,
      pointBackgroundColor: color,
      pointBorderColor: (c: { raw: unknown }) => (isHigh(c) ? HIGH_COLOR : color),
      pointBorderWidth: (c: { raw: unknown }) => (isHigh(c) ? 4 : 1),
      pointRadius: (c: { raw: unknown }) => (isHigh(c) ? 7 : 4),
      pointHoverRadius: 9,
    }
  }

  return (
    <div className="relative h-[300px]">
      <Line
        aria-label={T.history.chartAria}
        role="img"
        plugins={[refLines]}
        data={{
          labels: days.map((d) => d.label),
          datasets: [
            line(T.common.systolic, 'sys', SYS_COLOR, HIGH_SYS),
            line(T.common.diastolic, 'dia', DIA_COLOR, HIGH_DIA),
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          font: { size: 11 * k },
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: { ticks: { autoSkip: false, font: { size: 13 * k } } },
            y: { suggestedMin: 50, suggestedMax: 160, ticks: { font: { size: 13 * k } } },
          },
          plugins: {
            legend: {
              labels: {
                usePointStyle: true,
                font: { size: 14 * k },
                // 圖例的圓點用「線的顏色」，不要跟著橘色外圈
                generateLabels: (chart) =>
                  ChartJS.defaults.plugins.legend.labels.generateLabels(chart).map((item, i) => {
                    const color = i === 0 ? SYS_COLOR : DIA_COLOR
                    return { ...item, fillStyle: color, strokeStyle: color, pointStyle: 'circle' as const }
                  }),
              },
            },
            tooltip: {
              titleFont: { size: 14 * k },
              bodyFont: { size: 14 * k },
              footerFont: { size: 13 * k },
              callbacks: {
                footer: (items) => {
                  const d = days[items[0].dataIndex]
                  return [`${T.common.pulse}：${d.pulse ?? T.common.none}`, `${T.history.colMed}：${d.med}`]
                },
              },
            },
          },
        }}
      />
    </div>
  )
}
