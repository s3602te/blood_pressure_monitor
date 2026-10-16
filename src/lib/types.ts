/** 試算表裡的一筆血壓紀錄（後端 list 回傳的格式） */
export interface BpRecord {
  /** 試算表的列號；舊版後端沒有這個欄位，所以可能沒有 */
  row?: number
  date: string // yyyy-MM-dd
  sys: number
  dia: number
  pulse: number
  med: string // 有吃／沒吃
  notes: string
  /** 建立時間（毫秒）；很舊的資料可能是 0 */
  at: number
}

export interface Session {
  token: string
  username: string
  displayName?: string
}

/** 後端統一的回應格式 */
export type ApiResult<T = object> = ({ ok: true } & T) | { ok: false; error?: string; code?: string }

/** 要送出的一筆新紀錄（表單欄位 + 防重複編號） */
export interface NewRecord {
  date: string
  systolic: string
  diastolic: string
  pulse: string
  medication: string
  notes: string
  requestId: string
  /** 沒訊號暫存時，記下當初按下儲存的時間 */
  clientAt?: number
}
