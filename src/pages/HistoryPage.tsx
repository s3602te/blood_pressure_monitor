import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChartPanel } from '../components/ChartPanel'
import { DayDialog } from '../components/DayDialog'
import { TrendCard } from '../components/TrendCard'
import { UndoToast } from '../components/UndoToast'
import { usePageTitle, useRecords, useRefreshRecords } from '../hooks/hooks'
import { aggregateByDate, average, HIGH_DIA, HIGH_SYS, weekTrend } from '../lib/records'
import type { BpRecord } from '../lib/types'
import { T } from '../text'
import { btnPrimary, btnQuiet, card, hiMark, input, linkBtn, pageTitle } from '../ui'

const PER_PAGE = 7

export default function HistoryPage() {
  usePageTitle(T.history.pageTitle)
  const records = useRecords()
  const refresh = useRefreshRecords()
  const days = useMemo(() => aggregateByDate(records.data ?? []), [records.data])
  const trend = useMemo(() => weekTrend(days, new Date()), [days])

  const [page, setPage] = useState(1) // 第 1 頁 = 最新的 7 天
  const [openIso, setOpenIso] = useState<string | null>(null) // 打開「修改」視窗的那一天
  const [deleted, setDeleted] = useState<BpRecord | null>(null) // 剛刪除的那一筆（15 秒內可以復原）

  const totalPages = Math.max(1, Math.ceil(days.length / PER_PAGE))
  const current = Math.min(page, totalPages)
  const end = days.length - (current - 1) * PER_PAGE
  const slice = days.slice(Math.max(0, end - PER_PAGE), end)
  const openDay = days.find((d) => d.iso === openIso)

  // 刪光了那天的紀錄，視窗就自動關閉
  useEffect(() => {
    if (openIso && !openDay) setOpenIso(null)
  }, [openIso, openDay])

  const loading = records.isLoading || (records.isFetching && !records.data)

  return (
    <>
      <h1 className={pageTitle}>{T.history.pageTitle}</h1>
      {loading && <p className="mt-1 text-muted">{T.common.loading}</p>}
      {records.isError && records.data && <p className="mt-1 text-muted">{T.common.staleList}</p>}
      {records.isError && !records.data && (
        <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-3.5 py-3 font-bold text-danger">
          {records.error.message}
        </p>
      )}

      {records.data && days.length === 0 && !records.isFetching && (
        <div className="mt-7 rounded-card border border-dashed border-line bg-card px-5 py-7 text-center">
          <p>
            <strong>{T.history.emptyTitle}</strong>
          </p>
          <p className="mt-1 text-muted">{T.history.emptyText}</p>
          <Link to="/" className={`${btnPrimary} mt-[18px]`}>
            {T.history.emptyButton}
          </Link>
        </div>
      )}

      {days.length > 0 && (
        <>
          <section className="readout-panel mt-5 rounded-panel px-[22px] pt-[22px] pb-5 text-white" aria-live="polite">
            <p className="text-base text-[#a9c7c8]">
              {T.history.panelCaption(slice[0].label, slice[slice.length - 1].label, slice.length)}
            </p>
            <p className="text-[60px] leading-[1.15] font-black tabular-nums max-[380px]:text-[50px]">
              <span>{average(slice, 'sys') ?? T.common.none}</span>
              <span className="mx-1.5 font-light text-[#6f9ea1]">/</span>
              <span>{average(slice, 'dia') ?? T.common.none}</span>
            </p>
            <p className="mt-1.5 text-[0.9375rem] text-[#a9c7c8]">
              {T.history.panelUnit}　{T.history.avgPulse} <span>{average(slice, 'pulse') ?? T.common.none}</span> {T.record.pulseUnit}
            </p>
          </section>

          <TrendCard trend={trend} />

          <section className={card} aria-label={T.history.chartAria}>
            <ChartPanel days={slice} />
            <ul className="mt-3 list-disc pl-[22px] text-[0.9375rem] text-muted">
              {T.history.chartNotes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <section className={card} aria-label={T.history.tableAria}>
            <table className="w-full border-collapse tabular-nums">
              <caption className="pb-2 text-left font-bold">
                {T.common.range(slice[0].label, slice[slice.length - 1].label)}
              </caption>
              <thead>
                <tr className="text-left text-[0.9375rem] font-medium text-muted">
                  <th scope="col" className="border-b-2 border-line px-1 py-1.5 font-medium">{T.history.colDate}</th>
                  <th scope="col" className="border-b-2 border-line px-1 py-1.5 text-right font-medium">{T.history.colSys}</th>
                  <th scope="col" className="border-b-2 border-line px-1 py-1.5 text-right font-medium">{T.history.colDia}</th>
                  <th scope="col" className="border-b-2 border-line px-1 py-1.5 text-right font-medium">{T.history.colPulse}</th>
                  <th scope="col" className="border-b-2 border-line px-1 py-1.5 font-medium">{T.history.colMed}</th>
                </tr>
              </thead>
              <tbody>
                {[...slice].reverse().map((d) => (
                  <tr key={d.iso}>
                    <td className="border-b border-line px-1 py-3 align-top">
                      <div className="font-bold whitespace-nowrap">
                        {d.label}
                        <span className="ml-1 text-sm font-normal text-muted">{T.common.weekday(d.weekday)}</span>
                      </div>
                      {d.notes && <div className="mt-0.5 text-[0.9375rem] font-normal break-words text-muted">{d.notes}</div>}
                      <button
                        type="button"
                        className={`${linkBtn} block py-1.5! text-[0.9375rem]!`}
                        aria-label={T.history.editAria(d.label)}
                        onClick={() => setOpenIso(d.iso)}
                      >
                        {T.history.edit}
                      </button>
                    </td>
                    <td className="border-b border-line px-1 py-3 text-right align-top">
                      {d.sys >= HIGH_SYS ? <span className={hiMark}>{d.sys}</span> : d.sys}
                    </td>
                    <td className="border-b border-line px-1 py-3 text-right align-top">
                      {d.dia >= HIGH_DIA ? <span className={hiMark}>{d.dia}</span> : d.dia}
                    </td>
                    <td className="border-b border-line px-1 py-3 text-right align-top">{d.pulse ?? T.common.none}</td>
                    <td className="border-b border-line px-1 py-3 align-top">{d.med}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-muted">{T.history.legend}</p>
            <p className="mt-3 text-sm text-muted">{T.history.editHint}</p>
          </section>

          <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
            <button type="button" className={btnQuiet} disabled={current >= totalPages} onClick={() => setPage(current + 1)}>
              {T.history.older}
            </button>
            <select
              className={`${input} min-h-12 px-3! py-0! text-[1.0625rem]`}
              aria-label={T.history.pageSelectAria}
              value={current}
              onChange={(e) => setPage(Number(e.target.value))}
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => {
                // 用日期範圍當選項，一看就知道是哪一段；最新的一段排第一個
                const e = days.length - (n - 1) * PER_PAGE
                const s = Math.max(0, e - PER_PAGE)
                return (
                  <option key={n} value={n}>
                    {n === 1 ? T.history.latest : ''}
                    {T.common.range(days[s].label, days[e - 1].label)}
                  </option>
                )
              })}
            </select>
            <button type="button" className={btnQuiet} disabled={current <= 1} onClick={() => setPage(current - 1)}>
              {T.history.newer}
            </button>
          </div>
        </>
      )}

      {openDay && (
        <DayDialog day={openDay} onChanged={refresh} onDeleted={setDeleted} onClose={() => setOpenIso(null)} />
      )}
      {deleted && <UndoToast key={deleted.at + '-' + deleted.row} record={deleted} onRestored={refresh} onDismiss={() => setDeleted(null)} />}
    </>
  )
}
