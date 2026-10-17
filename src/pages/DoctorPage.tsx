import { Fragment, useMemo, useState } from 'react'
import { usePageTitle, useRecords, useSession } from '../hooks/hooks'
import { addDays, buildReport, dateText, isHigh, rangeFor, reportToCsv, type RangeChoice, type ReportRow } from '../lib/records'
import { btnPrimary, btnQuiet, field, fieldLabel, hiMark, input, pageTitle, segInput, segLabel } from '../ui'

const RANGES: { value: RangeChoice; label: string }[] = [
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
  { value: '90', label: '近 90 天' },
  { value: 'custom', label: '自訂' },
]

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-line bg-card px-3.5 py-3 print:break-inside-avoid">
      <div className="text-[0.9375rem] text-muted">{label}</div>
      <div className="text-[1.625rem] leading-tight font-black tabular-nums">{value}</div>
      {sub && <div className="text-sm text-muted">{sub}</div>}
    </div>
  )
}

const cell = 'px-1.5 py-2 align-top print:py-1'

/** 下載 CSV（用 Excel、Google 試算表都能開） */
function downloadCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 給醫師看：選一段時間，整理成平均、偏高次數，以及「一次量測一列」的清單（最新的在最上面，和歷史頁一樣）。
 * 一列一次量測，所以某天量好幾次、只量一次、沒量，表格都一樣整齊，不會出現一堆空格。
 * 可以直接列印或存成 PDF，也可以下載 CSV。
 */
export default function DoctorPage() {
  usePageTitle('給醫師看')
  const records = useRecords()
  const session = useSession()

  const today = useMemo(() => new Date(), [])
  const [choice, setChoice] = useState<RangeChoice>('7')
  const [from, setFrom] = useState(dateText(addDays(today, -29)))
  const [to, setTo] = useState(dateText(today))

  const range = rangeFor(choice, today, { from, to })
  const report = useMemo(
    () => (range && records.data ? buildReport(records.data, range.from, range.to) : null),
    [range, records.data],
  )
  const loading = records.isLoading || (records.isFetching && !records.data)
  const s = report?.stats
  const name = session?.displayName || session?.username || ''

  // 同一天的幾列放在同一個區塊，列印換頁時不會把同一天拆開
  const groups = useMemo(() => {
    const out: ReportRow[][] = []
    for (const row of report?.rows ?? []) {
      if (row.firstOfDay) out.push([row])
      else out[out.length - 1].push(row)
    }
    return out
  }, [report])

  return (
    <>
      <div className="print:hidden">
        <h1 className={pageTitle}>給醫師看</h1>
        <p className="mt-1 text-muted">選一段時間，把這段期間的血壓整理給醫師看。</p>

        <div className={field} role="radiogroup" aria-label="選擇時間範圍">
          <div className="grid grid-cols-4 gap-2 max-[380px]:grid-cols-2 [html[data-size=large]_&]:grid-cols-2">
            {RANGES.map((r) => (
              <label key={r.value} className="relative m-0 block">
                <input
                  className={segInput}
                  type="radio"
                  name="range"
                  value={r.value}
                  checked={choice === r.value}
                  onChange={() => setChoice(r.value)}
                />
                <span className={`${segLabel} min-h-[3.25rem]! px-0.5 text-base`}>{r.label}</span>
              </label>
            ))}
          </div>
        </div>

        {choice === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div className={field}>
              <label className={fieldLabel} htmlFor="fromDate">
                從
              </label>
              <input id="fromDate" className={input} type="date" max={dateText(today)} value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className={field}>
              <label className={fieldLabel} htmlFor="toDate">
                到
              </label>
              <input id="toDate" className={input} type="date" max={dateText(today)} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        )}

        {loading && <p className="mt-1 text-muted">讀取中…</p>}
        {records.isError && !records.data && (
          <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-3.5 py-3 font-bold text-danger">
            {records.error.message}
          </p>
        )}
        {records.isError && records.data && <p className="mt-1 text-muted">目前顯示的是上次的紀錄（更新失敗）</p>}
      </div>

      {records.data && !report && !loading && (
        <div className="mt-7 rounded-card border border-dashed border-line bg-card px-5 py-7 text-center print:hidden">
          <p>
            <strong>這段時間沒有紀錄</strong>
          </p>
          <p className="mt-1 text-muted">換一個時間範圍試試看。</p>
        </div>
      )}

      {report && s && range && (
        <section>
          <div className="mt-6 print:mt-0">
            <h2 className="text-[1.625rem] font-black">血壓紀錄</h2>
            <p className="mt-0.5 text-muted">
              {name}　{range.from} 到 {range.to}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 print:grid-cols-4">
            <Stat label="平均血壓" value={s.avgBp} sub={`脈搏 ${s.avgPulse ?? '--'}`} />
            <Stat label="記錄天數" value={`${s.dayCount} 天`} sub={`共 ${s.readingCount} 次量測`} />
            <Stat label="早上平均" value={s.morning.bp} sub={`${s.morning.n} 次`} />
            <Stat label="晚上平均" value={s.evening.bp} sub={`${s.evening.n} 次`} />
            <Stat label="偏高次數" value={`${s.high} 次`} sub={`佔 ${s.highPct}%（135/85 以上）`} />
            <Stat label="有吃藥" value={`${s.tookDays} 天`} sub={`記錄的 ${s.dayCount} 天中`} />
            <Stat label="最高一次" value={`${s.peak.sys}/${s.peak.dia}`} sub={s.peak.date.slice(5).replace('-', '/')} />
          </div>

          <table className="mt-[18px] w-full border-collapse bg-card tabular-nums">
            <thead>
              <tr className="text-left text-[0.9375rem] font-medium whitespace-nowrap text-muted">
                {['日期', '時段', '血壓', '脈搏', '吃藥'].map((h) => (
                  <th key={h} scope="col" className="border-b-2 border-line px-1.5 py-1.5 font-medium print:border-[#999]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((rows) => (
              <tbody key={rows[0].date} className="border-b border-line print:break-inside-avoid print:border-[#999]">
                {rows.map(({ rec, label, weekday, slot, time, firstOfDay }, i) => (
                  <Fragment key={`${rec.at}-${rec.row ?? i}`}>
                    <tr>
                      <td className={`${cell} font-bold whitespace-nowrap`}>
                        {firstOfDay && (
                          <>
                            {label}
                            <span className="ml-1 text-sm font-normal text-muted">週{weekday}</span>
                          </>
                        )}
                      </td>
                      <td className={`${cell} whitespace-nowrap`}>
                        {slot === 0 ? '早上' : '晚上'}
                        {time && <span className="block text-sm text-muted print:ml-1.5 print:inline">{time}</span>}
                      </td>
                      <td className={`${cell} whitespace-nowrap`}>
                        <span className={isHigh(rec.sys, rec.dia) ? hiMark : 'font-bold'}>
                          {rec.sys}/{rec.dia}
                        </span>
                      </td>
                      <td className={cell}>{Number.isFinite(rec.pulse) ? rec.pulse : '--'}</td>
                      <td className={`${cell} whitespace-nowrap`}>{rec.med}</td>
                    </tr>
                    {rec.notes && (
                      <tr>
                        <td />
                        <td colSpan={4} className="pb-2 text-[0.9375rem] break-words text-muted print:pb-1">
                          狀況：{rec.notes}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            ))}
          </table>

          <ul className="mt-3 list-disc pl-[22px] text-[0.9375rem] text-muted">
            <li>每一列是一次量測，最新的在最上面。</li>
            <li>血壓是「收縮壓／舒張壓」（mmHg），脈搏是每分鐘幾下。</li>
            <li>黃底表示高於家庭血壓參考值 135／85，僅供參考，請依醫師指示判斷。</li>
            <li>早上＝中午 12 點前記錄；晚上＝中午 12 點後記錄。</li>
            <li>同一天量了好幾次，會排在同一天底下，日期只寫一次。</li>
          </ul>
          <p className="mt-3 text-sm text-muted">整理日期：{dateText(today)}</p>

          <div className="mt-[26px] grid grid-cols-2 gap-2.5 print:hidden">
            <button type="button" className={`${btnPrimary} mt-0 text-lg!`} onClick={() => window.print()}>
              列印／存成 PDF
            </button>
            <button
              type="button"
              className={`${btnQuiet} min-h-[3.6rem] text-lg!`}
              onClick={() => downloadCsv(reportToCsv(report), `血壓紀錄_${name}_${range.from}_${range.to}.csv`)}
            >
              下載 CSV
            </button>
          </div>
        </section>
      )}
    </>
  )
}
