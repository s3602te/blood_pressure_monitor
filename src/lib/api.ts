import { API_URL } from '../config'
import { T } from '../text'
import { recordCache, sessionStore } from './storage'
import type { ApiResult, BpRecord, NewRecord, Session } from './types'

type Params = Record<string, string | number | undefined>

/**
 * 呼叫後端（Apps Script）。全部用 POST，而且用表單格式，瀏覽器就不會多做一次預檢請求，比較快。
 * 超過時間沒回應就當作沒網路（Apps Script 偶爾會卡住），不會一直轉圈。
 */
export async function callApi<T extends object = object>(
  action: string,
  params: Params = {},
  timeoutMs = 30000,
): Promise<ApiResult<T>> {
  const body = new URLSearchParams({ action })
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v))
  const session = sessionStore.get()
  if (session && !body.has('token')) body.set('token', session.token)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(API_URL, { method: 'POST', body, signal: controller.signal })
    return (await res.json()) as ApiResult<T>
  } catch {
    return { ok: false, error: T.errors.network, code: 'NETWORK' }
  } finally {
    clearTimeout(timer)
  }
}

/** 登入過期：清掉登入狀態（畫面會自動回到登入頁）。回傳 true 代表已處理。 */
export function handleAuthError(result: ApiResult<object>): boolean {
  if (!result.ok && result.code === 'AUTH') {
    recordCache.clear()
    sessionStore.clear()
    return true
  }
  return false
}

export const errorOf = (result: ApiResult<object>, fallback: string) =>
  (!result.ok && result.error) || fallback

/* ───────────── 帳號 ───────────── */

interface AuthOk {
  token: string
  username: string
  displayName?: string
}

export async function authenticate(
  mode: 'login' | 'register',
  params: { username: string; password: string; displayName?: string; inviteCode?: string },
): Promise<ApiResult<AuthOk>> {
  return callApi<AuthOk>(mode, params)
}

export const saveSession = (r: AuthOk) =>
  sessionStore.set({ token: r.token, username: r.username, displayName: r.displayName } satisfies Session)

export const ping = () => callApi('ping') // 登入頁先喚醒伺服器，登入時就不必等冷啟動

export async function logout() {
  await callApi('logout')
  recordCache.clear()
  sessionStore.clear()
}

/* ───────────── 紀錄 ───────────── */

interface ListOk {
  displayName?: string
  records: BpRecord[]
}

/** 抓最新紀錄並存起來；順便更新顯示名稱，同時也能用來確認登入是否還有效 */
export async function fetchRecords(): Promise<ApiResult<ListOk>> {
  const result = await callApi<ListOk>('list')
  if (result.ok) {
    recordCache.write(result.records)
    const session = sessionStore.get()
    if (session && result.displayName && session.displayName !== result.displayName) {
      sessionStore.set({ ...session, displayName: result.displayName })
    }
  }
  return result
}

export const addRecord = (rec: NewRecord, timeoutMs = 20000) =>
  callApi<{ duplicate?: boolean }>('add', { ...rec }, timeoutMs)

/** 修改、刪除都要帶「原本那筆」的列號、日期、建立時間，後端核對對得上才動 */
export interface RecordRef {
  row: number
  origAt: number
  origDate: string
}

export interface RecordEdit {
  date: string
  systolic: string
  diastolic: string
  pulse: string
  medication: string
  notes: string
}

export const updateRecord = (ref: RecordRef, edit: RecordEdit) =>
  callApi('update', { ...ref, ...edit }, 20000)

export const deleteRecord = (ref: RecordRef) => callApi('delete', { ...ref }, 20000)

/* ───────────── 管理頁 ───────────── */

/** 管理頁看到的帳號狀況（時間是毫秒，0＝從來沒有） */
export interface AdminAccount {
  username: string
  displayName: string
  lastSeen: number
  lastRecord: number
  count: number
  /** 屬於哪一群（用哪一組邀請碼註冊的） */
  group: string
}

export const adminList = (adminCode: string) =>
  callApi<{ accounts: AdminAccount[]; groups?: string[] }>('adminList', { adminCode })

export const adminDelete = (adminCode: string, username: string, deleteData: boolean) =>
  callApi('adminDelete', { adminCode, username, deleteData: String(deleteData) })

export const adminReset = (adminCode: string, username: string, newPassword: string) =>
  callApi('adminReset', { adminCode, username, newPassword })
