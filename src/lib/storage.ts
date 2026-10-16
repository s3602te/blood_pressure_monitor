import type { BpRecord, NewRecord, Session } from './types'

// 注意：這些 localStorage 的名稱和舊版網站完全相同，
// 所以改版之後，家人不用重新登入，暫存在手機裡的資料也還在。

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 無痕模式、空間滿了等情況：略過 */
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* 略過 */
  }
}

/* ───────────── 登入狀態 ───────────── */

const SESSION_KEY = 'bp_session'
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

// useSyncExternalStore 需要「內容沒變就回傳同一個物件」，所以用原始字串當快取鍵
let cachedRaw: string | null | undefined
let cachedSession: Session | null = null

export const sessionStore = {
  get(): Session | null {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(SESSION_KEY)
    } catch {
      /* 略過 */
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw
      try {
        const s = raw ? (JSON.parse(raw) as Session) : null
        cachedSession = s && s.token ? s : null
      } catch {
        cachedSession = null
      }
    }
    return cachedSession
  },
  set(session: Session) {
    write(SESSION_KEY, session)
    notify()
  },
  clear() {
    remove(SESSION_KEY)
    notify()
  },
  subscribe(fn: () => void) {
    listeners.add(fn)
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY) fn()
    }
    window.addEventListener('storage', onStorage) // 別的分頁登出、登入時同步
    return () => {
      listeners.delete(fn)
      window.removeEventListener('storage', onStorage)
    }
  },
}

/* ───────────── 上次看過的紀錄（開頁面先秀這份，背景再更新） ───────────── */

interface CachedRecords {
  at: number
  records: BpRecord[]
}

const recordKey = () => {
  const s = sessionStore.get()
  return s ? 'bp_records_' + s.username : null
}

export const recordCache = {
  read(): CachedRecords | null {
    const k = recordKey()
    const v = k ? read<CachedRecords>(k) : null
    return v && Array.isArray(v.records) ? v : null
  },
  write(records: BpRecord[]) {
    const k = recordKey()
    if (k) write(k, { at: Date.now(), records })
  },
  clear() {
    const k = recordKey()
    if (k) remove(k)
  },
}

/* ───────────── 沒訊號時暫存的紀錄 ───────────── */

// 登出時「不」清掉：還沒送出的血壓不能因為登出就消失。
const pendingKey = () => {
  const s = sessionStore.get()
  return s ? 'bp_pending_' + s.username : null
}

const pendingListeners = new Set<() => void>()
const notifyPending = () => pendingListeners.forEach((fn) => fn())

export const pendingQueue = {
  read(): NewRecord[] {
    const k = pendingKey()
    const v = k ? read<NewRecord[]>(k) : null
    return Array.isArray(v) ? v : []
  },
  write(list: NewRecord[]) {
    const k = pendingKey()
    if (!k) return
    if (list.length) write(k, list)
    else remove(k)
    notifyPending()
  },
  add(item: NewRecord) {
    this.write([...this.read(), item])
  },
  remove(requestId: string) {
    this.write(this.read().filter((i) => i.requestId !== requestId))
  },
  count(): number {
    return this.read().length
  },
  subscribe(fn: () => void) {
    pendingListeners.add(fn)
    return () => {
      pendingListeners.delete(fn)
    }
  },
}

/* ───────────── 字體大小 ───────────── */

const FONT_KEY = 'bp_font'
const fontListeners = new Set<() => void>()

export const fontSize = {
  isLarge(): boolean {
    try {
      return localStorage.getItem(FONT_KEY) === 'large'
    } catch {
      return false
    }
  },
  /** 把設定套用到網頁（html 標籤的 data-size），整個網站的字就一起放大或縮小 */
  apply(large: boolean) {
    if (large) document.documentElement.setAttribute('data-size', 'large')
    else document.documentElement.removeAttribute('data-size')
  },
  set(large: boolean) {
    // 這個值直接存字串（舊版就是這樣存的），不是 JSON
    try {
      if (large) localStorage.setItem(FONT_KEY, 'large')
      else localStorage.removeItem(FONT_KEY)
    } catch {
      /* 略過 */
    }
    this.apply(large)
    fontListeners.forEach((fn) => fn())
  },
  subscribe(fn: () => void) {
    fontListeners.add(fn)
    return () => {
      fontListeners.delete(fn)
    }
  },
}
