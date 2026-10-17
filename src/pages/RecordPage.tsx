import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { addRecord, handleAuthError } from '../lib/api'
import { flushPending } from '../lib/pending'
import { pendingQueue } from '../lib/storage'
import { bpAdvice } from '../lib/advice'
import { dateText, todayStatus, WEEKDAYS } from '../lib/records'
import { MED_OPTIONS, type NewRecord } from '../lib/types'
import { T } from '../text'
import { usePageTitle, usePendingCount, useRecords } from '../hooks/hooks'
import { ResultDialog, type ResultInfo } from '../components/ResultDialog'
import { btnPrimary, btnQuiet, field, fieldHint, fieldLabel, input, pageTitle, segInput, segLabel, segWrap } from '../ui'

// 每次填寫一個專屬編號，送出失敗重試用同一個，伺服器才認得出「這是同一筆」；成功後換新的
const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2)

// 血壓計螢幕上的大數字輸入框
const bigInput =
  'w-full border-0 border-b-[3px] border-white/30 bg-transparent pb-0.5 text-[60px] leading-[1.15] font-black text-white tabular-nums placeholder:text-white/25 focus:border-glow focus:outline-none max-[380px]:text-[50px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

export default function RecordPage() {
  usePageTitle(T.record.pageTitle)
  const qc = useQueryClient()
  const records = useRecords() // 先把歷史紀錄抓好，之後打開歷史頁就不用等；同時確認登入還有效
  const pendingCount = usePendingCount()

  const today = new Date()
  const todayIso = dateText(today)
  const [date, setDate] = useState(todayIso)
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')
  const [pulse, setPulse] = useState('')
  const [med, setMed] = useState('')
  const [notes, setNotes] = useState('')
  const [requestId, setRequestId] = useState(newRequestId)
  const [busy, setBusy] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [result, setResult] = useState<ResultInfo | null>(null)

  // 今天早上、晚上各記錄了沒（還沒上傳、暫存在手機的也算）
  const status = todayStatus(
    [
      ...(records.data ?? []).map((r) => ({ date: r.date, at: r.at })),
      ...pendingQueue.read().map((p) => ({ date: p.date, at: p.clientAt ?? 0 })),
    ],
    todayIso,
  )
  const closeResult = useCallback(() => setResult(null), [])

  const resetForm = () => {
    setSys('')
    setDia('')
    setPulse('')
    setMed('')
    setNotes('')
    setRequestId(newRequestId())
    // 日期保留，連續補記幾天時不用重選
  }

  // 還沒送出的暫存資料：有網路時自動補送
  const sendPending = useCallback(
    async (manual: boolean) => {
      if (!pendingQueue.count()) return
      setRetrying(true)
      const outcome = await flushPending()
      setRetrying(false)

      if (outcome.dropped.length) {
        const lines = outcome.dropped.map((d) =>
          T.record.droppedLine(d.item.date, d.item.systolic, d.item.diastolic, d.error),
        )
        setResult({ kind: 'error', title: T.record.droppedTitle, detail: [...lines, T.record.droppedFooter].join('\n') })
      } else if (outcome.sent) {
        setResult({ kind: 'ok', title: T.record.sentTitle(outcome.sent), detail: T.record.sentDetail })
      } else if (manual && outcome.blocked) {
        setResult({ kind: 'warn', title: T.record.stillOfflineTitle, detail: T.record.stillOfflineDetail })
      }
      if (outcome.sent) void qc.invalidateQueries({ queryKey: ['records'] })
    },
    [qc],
  )

  // 紀錄抓成功（代表網路通、登入有效）就順便補送；之後每 30 秒、或手機恢復連線時再試
  const loadedOnce = useRef(false)
  useEffect(() => {
    if (records.isSuccess && !records.isFetching && !loadedOnce.current) {
      loadedOnce.current = true
      void sendPending(false)
    }
  }, [records.isSuccess, records.isFetching, sendPending])

  useEffect(() => {
    const onOnline = () => void sendPending(false)
    window.addEventListener('online', onOnline)
    const timer = setInterval(() => void sendPending(false), 30000)
    return () => {
      window.removeEventListener('online', onOnline)
      clearInterval(timer)
    }
  }, [sendPending])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return

    const params: NewRecord = {
      date,
      systolic: sys,
      diastolic: dia,
      pulse,
      medication: med,
      notes,
      requestId,
    }
    setBusy(true)
    const res = await addRecord(params)
    setBusy(false)

    if (handleAuthError(res)) return

    if (!res.ok && res.code === 'NETWORK') {
      // 沒訊號：先存在手機，補送時帶著「當初按下儲存的時間」，早上／晚上才不會算錯
      pendingQueue.add({ ...params, clientAt: Date.now() })
      const advice = bpAdvice(Number(params.systolic), Number(params.diastolic))
      const saved = T.record.queuedDetail
      setResult({
        kind: advice ? (advice.level === 'veryHigh' ? 'urgent' : 'care') : 'warn',
        title: advice ? T.record.queuedWithAdvice(advice.title) : T.record.queuedTitle,
        detail: advice ? [saved, advice.text].join('\n\n') : saved,
      })
      resetForm()
      return
    }

    if (!res.ok) {
      setResult({ kind: 'error', title: T.record.failedTitle, detail: res.error || T.record.failedFallback })
      return
    }

    if (res.duplicate) {
      setResult({ kind: 'ok', title: T.record.duplicateTitle, detail: T.record.duplicateDetail })
    } else {
      // 血壓偏高、偏低時，給一段溫和的提醒（要按「好」才會關，一定看得到）
      const advice = bpAdvice(Number(params.systolic), Number(params.diastolic))
      const saved = T.record.savedDetail(params.systolic, params.diastolic, params.pulse)
      setResult({
        kind: advice ? (advice.level === 'veryHigh' ? 'urgent' : 'care') : 'ok',
        title: advice ? T.record.savedWithAdvice(advice.title) : T.record.savedTitle,
        detail: advice ? [saved, advice.text].join('\n\n') : saved,
      })
    }
    resetForm()
    void qc.invalidateQueries({ queryKey: ['records'] }) // 背景更新歷史紀錄，不用等
  }

  return (
    <>
      <h1 className={pageTitle}>{T.record.heading}</h1>
      <p className="mt-1 text-muted">
        {T.record.today(today.getMonth() + 1, today.getDate(), WEEKDAYS[today.getDay()])}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2.5" aria-label={T.record.statusAria}>
        {(
          [
            [T.common.morning, status.morning],
            [T.common.evening, status.evening],
          ] as const
        ).map(([label, done]) => (
          <div
            key={label}
            className={`rounded-card border-2 px-3 py-2.5 text-center font-bold ${
              done ? 'border-teal bg-ok-bg text-teal-deep' : 'border-line bg-card text-muted'
            }`}
          >
            {done ? T.record.statusDone(label) : T.record.statusTodo(label)}
          </div>
        ))}
      </div>

      {pendingCount > 0 && (
        <div role="status" className="mt-4 rounded-xl bg-warn-bg px-4 py-3.5 font-bold text-warn">
          <p>{T.record.pendingText(pendingCount)}</p>
          <button type="button" className={`${btnQuiet} mt-2.5`} disabled={retrying} onClick={() => void sendPending(true)}>
            {T.record.pendingRetry}
          </button>
        </div>
      )}

      <form onSubmit={onSubmit}>
        <div className="readout-panel mt-5 rounded-panel px-[22px] pt-[22px] pb-5 text-white">
          <p className="text-base text-[#a9c7c8]">{T.record.panelCaption}</p>
          <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-end gap-2.5">
            <div>
              <label htmlFor="systolic" className="block text-base text-[#a9c7c8]">
                {T.common.systolic}
              </label>
              <input
                id="systolic"
                className={bigInput}
                type="number"
                inputMode="numeric"
                min={50}
                max={300}
                placeholder="120"
                required
                value={sys}
                onChange={(e) => setSys(e.target.value)}
              />
            </div>
            <span aria-hidden="true" className="pb-2 text-[52px] leading-none font-light text-[#6f9ea1]">
              /
            </span>
            <div>
              <label htmlFor="diastolic" className="block text-base text-[#a9c7c8]">
                {T.common.diastolic}
              </label>
              <input
                id="diastolic"
                className={bigInput}
                type="number"
                inputMode="numeric"
                min={30}
                max={200}
                placeholder="80"
                required
                value={dia}
                onChange={(e) => setDia(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-[18px] flex items-baseline gap-3 border-t border-white/15 pt-4">
            <label htmlFor="pulse" className="text-base whitespace-nowrap text-[#a9c7c8]">
              {T.common.pulse}
            </label>
            <input
              id="pulse"
              className={`${bigInput} w-[5ch]! text-4xl!`}
              type="number"
              inputMode="numeric"
              min={30}
              max={250}
              placeholder="70"
              required
              value={pulse}
              onChange={(e) => setPulse(e.target.value)}
            />
            <span className="text-[0.9375rem] text-[#a9c7c8]">{T.record.pulseUnit}</span>
          </div>
        </div>

        <div className={field}>
          <label htmlFor="date" className={fieldLabel}>
            {T.record.dateLabel}
          </label>
          <input
            id="date"
            className={input}
            type="date"
            max={todayIso}
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className={field} role="radiogroup" aria-labelledby="medLabel">
          <span className={fieldLabel} id="medLabel">
            {T.record.medLabel}
          </span>
          <div className={segWrap}>
            {MED_OPTIONS.map((v) => (
              <label key={v} className="relative m-0 block">
                <input
                  className={segInput}
                  type="radio"
                  name="medication"
                  value={v}
                  required
                  checked={med === v}
                  onChange={() => setMed(v)}
                />
                <span className={segLabel}>{v}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={field}>
          <label htmlFor="notes" className={fieldLabel}>
            {T.record.notesLabel} <span className={fieldHint}>{T.record.optional}</span>
          </label>
          <textarea
            id="notes"
            className={`${input} min-h-24 resize-y`}
            maxLength={500}
            placeholder={T.record.notesPlaceholder}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <button className={btnPrimary} type="submit" disabled={busy}>
          {busy ? T.common.saving : T.record.submit}
        </button>
      </form>

      {result && <ResultDialog result={result} onClose={closeResult} />}
    </>
  )
}
