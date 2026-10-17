import { useEffect, useState } from 'react'
import { addRecord, errorOf, handleAuthError } from '../lib/api'
import type { BpRecord } from '../lib/types'

export const UNDO_SECONDS = 15

interface Props {
  /** 剛刪除的那一筆 */
  record: BpRecord
  /** 復原成功後（已放回試算表），重新抓最新紀錄 */
  onRestored: () => Promise<unknown>
  onDismiss: () => void
}

const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2)

/**
 * 刪除之後，畫面下方出現「已刪除　復原」，15 秒內按「復原」就把那筆放回去。
 * 放回去時帶著原本的記錄時間，所以早上／晚上的歸類不會變。
 */
export function UndoToast({ record, onRestored, onDismiss }: Props) {
  const [left, setLeft] = useState(UNDO_SECONDS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (busy || error) return
    if (left <= 0) {
      onDismiss()
      return
    }
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [left, busy, error, onDismiss])

  const restore = async () => {
    setBusy(true)
    setError('')
    const result = await addRecord({
      date: record.date,
      systolic: String(record.sys),
      diastolic: String(record.dia),
      pulse: String(record.pulse),
      medication: record.med,
      notes: record.notes,
      requestId: newRequestId(),
      clientAt: record.at || undefined,
    })
    if (handleAuthError(result)) return
    if (!result.ok) {
      setBusy(false)
      setError(errorOf(result, '復原失敗，請再試一次'))
      return
    }
    await onRestored()
    onDismiss()
  }

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 mx-auto flex w-[calc(100%-2.5rem)] max-w-[480px] items-center gap-3 rounded-card bg-ink px-4 py-3 text-white shadow-lg print:hidden"
    >
      <div className="min-w-0 flex-1">
        {error ? (
          <span className="font-bold text-danger-bg">{error}</span>
        ) : (
          <>
            <div className="font-bold">已刪除</div>
            <div className="truncate text-[0.9375rem] text-[#a9c7c8]">
              {record.date.slice(5).replace('-', '/')}　{record.sys}/{record.dia}　脈搏 {record.pulse}
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void restore()}
        className="min-h-11 cursor-pointer rounded-xl border-0 bg-glow px-4 text-lg font-black text-ink disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? '復原中…' : error ? '再試一次' : `復原（${left}）`}
      </button>
      <button
        type="button"
        aria-label="關閉提示"
        onClick={onDismiss}
        disabled={busy}
        className="min-h-11 cursor-pointer border-0 bg-transparent px-1 text-2xl text-[#a9c7c8]"
      >
        ×
      </button>
    </div>
  )
}
