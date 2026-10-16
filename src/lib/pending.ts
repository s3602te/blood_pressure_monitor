import { addRecord, handleAuthError } from './api'
import { pendingQueue } from './storage'
import type { NewRecord } from './types'

export interface FlushOutcome {
  sent: number
  /** 因為內容有問題而放棄的（要請使用者重新輸入） */
  dropped: { item: NewRecord; error: string }[]
  /** 還是沒網路，或登入過期 */
  blocked: boolean
}

let flushing = false

/** 把暫存的資料一筆一筆補送出去。同一筆帶同一個編號，所以重送不會變成兩筆。 */
export async function flushPending(): Promise<FlushOutcome> {
  const outcome: FlushOutcome = { sent: 0, dropped: [], blocked: false }
  if (flushing) return outcome
  flushing = true
  try {
    for (const item of pendingQueue.read()) {
      const res = await addRecord(item)
      if (res.ok) {
        pendingQueue.remove(item.requestId)
        outcome.sent++
      } else if (res.code === 'NETWORK' || res.code === 'AUTH') {
        outcome.blocked = true
        handleAuthError(res)
        break
      } else {
        pendingQueue.remove(item.requestId)
        outcome.dropped.push({ item, error: res.error || '無法儲存' })
      }
    }
  } finally {
    flushing = false
  }
  return outcome
}
