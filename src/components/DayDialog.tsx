import { useState, type FormEvent } from 'react'
import { deleteRecord, errorOf, handleAuthError, updateRecord, type RecordRef } from '../lib/api'
import { dateText, isHigh, pad, slotName, type DayAgg } from '../lib/records'
import { MED_OPTIONS, type BpRecord } from '../lib/types'
import { T } from '../text'
import { btnDanger, btnPrimary, btnQuiet, field, fieldLabel, hiMark, input, segInput, segLabel, segWrap } from '../ui'
import { Modal } from './Modal'

interface Props {
  day: DayAgg
  /** 修改或刪除成功後，重新抓最新紀錄 */
  onChanged: () => Promise<unknown>
  /** 刪除成功（讓畫面可以出現「復原」） */
  onDeleted: (record: BpRecord) => void
  onClose: () => void
}

const refOf = (r: BpRecord): RecordRef => ({ row: r.row as number, origAt: r.at, origDate: r.date })

function timeText(r: BpRecord) {
  if (!r.at) return T.day.noTime
  const t = new Date(r.at)
  return `${slotName(r.at)} ${pad(t.getHours())}:${pad(t.getMinutes())}`
}

/** 點歷史頁某一天的「修改」會打開這個視窗：列出那天的每一筆，可以逐筆修改或刪除 */
export function DayDialog({ day, onChanged, onDeleted, onClose }: Props) {
  const [editing, setEditing] = useState<number | null>(null) // 正在修改的列號
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 沒成功：顯示原因。資料如果已經被別處改過（STALE），順便更新畫面。
  const fail = async (result: Parameters<typeof errorOf>[0]) => {
    setError(errorOf(result, T.day.failedFallback))
    if (!result.ok && result.code === 'STALE') await onChanged()
  }

  const remove = async (r: BpRecord) => {
    const what = T.day.deleteWhat(r.date, r.sys, r.dia, Number.isFinite(r.pulse) ? String(r.pulse) : T.common.none)
    if (!confirm(T.day.deleteConfirm(what))) return
    setError('')
    setBusy(true)
    const result = await deleteRecord(refOf(r))
    setBusy(false)
    if (handleAuthError(result)) return
    if (!result.ok) return fail(result)
    onDeleted(r)
    await onChanged()
  }

  return (
    <Modal onClose={onClose} labelledBy="dayTitle" wide>
      <h2 id="dayTitle" className="text-center text-[1.625rem] leading-tight font-black">
        {T.day.title(day.label, T.common.weekday(day.weekday))}
      </h2>
      <p className="mt-2 text-center break-words text-muted">
        {day.items.length > 1 ? T.day.manyHint(day.items.length) : T.day.oneHint}
      </p>

      {day.items.map((r) =>
        editing === r.row ? (
          <EditForm
            key={r.row ?? r.at}
            record={r}
            busy={busy}
            onCancel={() => {
              setError('')
              setEditing(null)
            }}
            onSubmit={async (edit) => {
              setError('')
              setBusy(true)
              const result = await updateRecord(refOf(r), edit)
              setBusy(false)
              if (handleAuthError(result)) return
              if (!result.ok) return fail(result)
              setEditing(null)
              await onChanged()
              if (edit.date !== r.date) onClose() // 改了日期，這筆已經搬到別天
            }}
          />
        ) : (
          <div key={r.row ?? r.at} className="mt-3.5 rounded-card border border-line p-3.5">
            <div className="text-[0.9375rem] text-muted">{timeText(r)}</div>
            <div className="text-[1.625rem] font-black tabular-nums">
              <span className={isHigh(r.sys, r.dia) ? hiMark : ''}>
                {r.sys}/{r.dia}
              </span>
              {Number.isFinite(r.pulse) && (
                <span className="text-base font-normal text-muted">
                  　{T.common.pulse} {r.pulse}
                </span>
              )}
            </div>
            {(r.med || r.notes) && (
              <div className="break-words text-ink-soft">{[r.med, r.notes].filter(Boolean).join('　｜　')}</div>
            )}
            {r.row && (
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <button type="button" className={btnQuiet} disabled={busy} onClick={() => setEditing(r.row as number)}>
                  {T.day.edit}
                </button>
                <button type="button" className={btnDanger} disabled={busy} onClick={() => void remove(r)}>
                  {T.day.delete}
                </button>
              </div>
            )}
          </div>
        ),
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-3.5 py-3 font-bold text-danger">
          {error}
        </p>
      )}
      <button type="button" className={`${btnQuiet} mt-4`} onClick={onClose}>
        {T.common.close}
      </button>
    </Modal>
  )
}

interface EditProps {
  record: BpRecord
  busy: boolean
  onCancel: () => void
  onSubmit: (edit: {
    date: string
    systolic: string
    diastolic: string
    pulse: string
    medication: string
    notes: string
  }) => Promise<unknown>
}

function EditForm({ record, busy, onCancel, onSubmit }: EditProps) {
  const [date, setDate] = useState(record.date)
  const [sys, setSys] = useState(String(record.sys))
  const [dia, setDia] = useState(String(record.dia))
  const [pulse, setPulse] = useState(Number.isFinite(record.pulse) ? String(record.pulse) : '')
  const [med, setMed] = useState(record.med)
  const [notes, setNotes] = useState(record.notes || '')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void onSubmit({ date, systolic: sys, diastolic: dia, pulse, medication: med, notes })
  }

  return (
    <form onSubmit={submit} className="mt-3.5 rounded-card border-2 border-teal px-3.5 pb-3.5">
      <div className={field}>
        <label className={fieldLabel} htmlFor="editDate">
          {T.day.editDate}
        </label>
        <input id="editDate" className={input} type="date" max={dateText(new Date())} required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className={field}>
        <label className={fieldLabel} htmlFor="editSys">
          {T.common.systolic}
        </label>
        <input id="editSys" className={input} type="number" inputMode="numeric" min={50} max={300} required autoFocus value={sys} onChange={(e) => setSys(e.target.value)} />
      </div>
      <div className={field}>
        <label className={fieldLabel} htmlFor="editDia">
          {T.common.diastolic}
        </label>
        <input id="editDia" className={input} type="number" inputMode="numeric" min={30} max={200} required value={dia} onChange={(e) => setDia(e.target.value)} />
      </div>
      <div className={field}>
        <label className={fieldLabel} htmlFor="editPulse">
          {T.common.pulse}
        </label>
        <input id="editPulse" className={input} type="number" inputMode="numeric" min={30} max={250} required value={pulse} onChange={(e) => setPulse(e.target.value)} />
      </div>
      <div className={field} role="radiogroup" aria-label={T.common.medicationQuestion}>
        <span className={fieldLabel}>{T.common.medicationQuestion}</span>
        <div className={segWrap}>
          {MED_OPTIONS.map((v) => (
            <label key={v} className="relative m-0 block">
              <input className={segInput} type="radio" name="editMed" value={v} required checked={med === v} onChange={() => setMed(v)} />
              <span className={segLabel}>{v}</span>
            </label>
          ))}
        </div>
      </div>
      <div className={field}>
        <label className={fieldLabel} htmlFor="editNotes">
          {T.day.editNotes}
        </label>
        <textarea id="editNotes" className={`${input} min-h-24 resize-y`} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button type="submit" className={`${btnPrimary} mt-0 min-h-12`} disabled={busy}>
          {busy ? T.common.saving : T.day.save}
        </button>
        <button type="button" className={btnQuiet} disabled={busy} onClick={onCancel}>
          {T.common.cancel}
        </button>
      </div>
    </form>
  )
}
