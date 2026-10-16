import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChartPanel } from '../components/ChartPanel'
import { DayDialog } from '../components/DayDialog'
import { usePageTitle, useRecords, useRefreshRecords } from '../hooks/hooks'
import { aggregateByDate, average, HIGH_DIA, HIGH_SYS } from '../lib/records'
import { btnPrimary, btnQuiet, card, hiMark, input, linkBtn, pageTitle } from '../ui'

const PER_PAGE = 7

export default function HistoryPage() {
  usePageTitle('歷史紀錄')
  const records = useRecords()
  const refresh = useRefreshRecords()
  const days = useMemo(() => aggregateByDate(records.data ?? []), [records.data])

  const [page, setPage] = useState(1) // 第 1 頁 = 最新的 7 天
  const [openIso, setOpenIso] = useState<string | null>(null) // 打開「修改」視窗的那一天

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
      <h1 className={pageTitle}>歷史紀錄</h1>
      {loading && <p className="mt-1 text-muted">讀取中…</p>}
      {records.isError && records.data && <p className="mt-1 text-muted">目前顯示的是上次的紀錄（更新失敗）</p>}
      {records.isError && !records.data && (
        <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-3.5 py-3 font-bold text-danger">
          {records.error.message}
        </p>
      )}

      {records.data && days.length === 0 && !records.isFetching && (
        <div className="mt-7 rounded-card border border-dashed border-line bg-card px-5 py-7 text-center">
          <p>
            <strong>還沒有任何紀錄</strong>
          </p>
          <p className="mt-1 text-muted">量完血壓後，到「記錄血壓」存下第一筆。</p>
          <Link to="/" className={`${btnPrimary} mt-[18px]`}>
            去記錄血壓
          </Link>
        </div>
      )}

      {days.length > 0 && (
        <>
          <section className="readout-panel mt-5 rounded-panel px-[22px] pt-[22px] pb-5 text-white" aria-live="polite">
            <p className="text-base text-[#a9c7c8]">這 {slice.length} 天的平均</p>
            <p className="text-[60px] leading-[1.15] font-black tabular-nums max-[380px]:text-[50px]">
              <span>{average(slice, 'sys') ?? '--'}</span>
              <span className="mx-1.5 font-light text-[#6f9ea1]">/</span>
              <span>{average(slice, 'dia') ?? '--'}</span>
            </p>
            <p className="mt-1.5 text-[0.9375rem] text-[#a9c7c8]">
              平均血壓（收縮 / 舒張，mmHg）　平均脈搏 <span>{average(slice, 'pulse') ?? '--'}</span> 次／分鐘
            </p>
          </section>

          <section className={card} aria-label="血壓走勢圖">
            <ChartPanel days={slice} />
            <ul className="mt-3 list-disc pl-[22px] text-[0.9375rem] text-muted">
              <li>虛線是參考線：135（收縮壓）、85（舒張壓）。</li>
              <li>橘色大圓點表示高於參考值。</li>
              <li>點一下圖上的某一天，可以看到脈搏和吃藥狀況。</li>
            </ul>
          </section>

          <section className={card} aria-label="每日數值">
            <table className="w-full border-collapse tabular-nums">
              <caption className="pb-2 text-left font-bold">
                {slice[0].label} 到 {slice[slice.length - 1].label}
              </caption>
              <thead>
                <tr className="text-left text-[0.9375rem] font-medium text-muted">
                  <th scope="col" className="border-b-2 border-line px-1 py-1.5 font-medium">日期</th>
                  <th scope="col" className="border-b-2 border-line px-1 py-1.5 text-right font-medium">收縮</th>
                  <th scope="col" className="border-b-2 border-line px-1 py-1.5 text-right font-medium">舒張</th>
                  <th scope="col" className="border-b-2 border-line px-1 py-1.5 text-right font-medium">脈搏</th>
                  <th scope="col" className="border-b-2 border-line px-1 py-1.5 font-medium">吃藥</th>
                </tr>
              </thead>
              <tbody>
                {[...slice].reverse().map((d) => (
                  <tr key={d.iso}>
                    <td className="border-b border-line px-1 py-3 align-top">
                      <div className="font-bold whitespace-nowrap">
                        {d.label}
                        <span className="ml-1 text-sm font-normal text-muted">週{d.weekday}</span>
                      </div>
                      {d.notes && <div className="mt-0.5 text-[0.9375rem] font-normal break-words text-muted">{d.notes}</div>}
                      <button
                        type="button"
                        className={`${linkBtn} block py-1.5! text-[0.9375rem]!`}
                        aria-label={`修改或刪除 ${d.label} 的紀錄`}
                        onClick={() => setOpenIso(d.iso)}
                      >
                        修改
                      </button>
                    </td>
                    <td className="border-b border-line px-1 py-3 text-right align-top">
                      {d.sys >= HIGH_SYS ? <span className={hiMark}>{d.sys}</span> : d.sys}
                    </td>
                    <td className="border-b border-line px-1 py-3 text-right align-top">
                      {d.dia >= HIGH_DIA ? <span className={hiMark}>{d.dia}</span> : d.dia}
                    </td>
                    <td className="border-b border-line px-1 py-3 text-right align-top">{d.pulse ?? '--'}</td>
                    <td className="border-b border-line px-1 py-3 align-top">{d.med}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-muted">黃底數字高於家庭血壓參考值 135 / 85 mmHg，僅供參考，請依醫師指示判斷。</p>
            <p className="mt-3 text-sm text-muted">填錯了？按日期下面的「修改」，可以改數字或刪除那一筆。</p>
          </section>

          <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
            <button type="button" className={btnQuiet} disabled={current >= totalPages} onClick={() => setPage(current + 1)}>
              較早
            </button>
            <select
              className={`${input} min-h-12 px-3! py-0! text-[1.0625rem]`}
              aria-label="選擇頁數"
              value={current}
              onChange={(e) => setPage(Number(e.target.value))}
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => {
                // 用日期範圍當選項，一看就知道是哪一段；最新的一段排第一個
                const e = days.length - (n - 1) * PER_PAGE
                const s = Math.max(0, e - PER_PAGE)
                return (
                  <option key={n} value={n}>
                    {n === 1 ? '最新　' : ''}
                    {days[s].label} 到 {days[e - 1].label}
                  </option>
                )
              })}
            </select>
            <button type="button" className={btnQuiet} disabled={current <= 1} onClick={() => setPage(current - 1)}>
              較新
            </button>
          </div>
        </>
      )}

      {openDay && <DayDialog day={openDay} onChanged={refresh} onClose={() => setOpenIso(null)} />}
    </>
  )
}
