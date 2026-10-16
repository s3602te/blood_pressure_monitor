import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callApi } from '../lib/api'
import { flushPending } from '../lib/pending'
import { fontSize, pendingQueue, recordCache, sessionStore } from '../lib/storage'
import type { NewRecord } from '../lib/types'

const item = (id: string): NewRecord => ({
  date: '2026-06-13',
  systolic: '120',
  diastolic: '80',
  pulse: '70',
  medication: '有吃',
  notes: '',
  requestId: id,
  clientAt: 1,
})

const respond = (body: object) => Promise.resolve({ json: async () => body } as Response)

beforeEach(() => {
  sessionStore.set({ token: 't', username: 'mom', displayName: '媽媽' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('登入狀態', () => {
  it('內容沒變就回傳同一個物件（React 才不會一直重畫）', () => {
    expect(sessionStore.get()).toBe(sessionStore.get())
    expect(sessionStore.get()?.username).toBe('mom')
  })

  it('登出後讀不到', () => {
    sessionStore.clear()
    expect(sessionStore.get()).toBeNull()
  })

  it('用和舊版網站相同的 localStorage 名稱，改版後不用重新登入', () => {
    expect(JSON.parse(localStorage.getItem('bp_session')!).token).toBe('t')
    recordCache.write([])
    expect(localStorage.getItem('bp_records_mom')).not.toBeNull()
    pendingQueue.add(item('a'))
    expect(localStorage.getItem('bp_pending_mom')).not.toBeNull()
  })
})

describe('字體大小', () => {
  it('放大、回到標準，並記在 localStorage（值和舊版相同）', () => {
    fontSize.set(true)
    expect(document.documentElement.getAttribute('data-size')).toBe('large')
    expect(localStorage.getItem('bp_font')).toBe('large')
    fontSize.set(false)
    expect(document.documentElement.hasAttribute('data-size')).toBe(false)
    expect(localStorage.getItem('bp_font')).toBeNull()
  })
})

describe('callApi', () => {
  it('帶上登入權杖，用表單格式 POST', async () => {
    const fetchMock = vi.fn(() => respond({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await callApi('list')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('POST')
    const body = init.body as URLSearchParams
    expect(body.get('action')).toBe('list')
    expect(body.get('token')).toBe('t')
  })

  it('連不上時回傳 NETWORK，不丟錯誤', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    expect(await callApi('list')).toMatchObject({ ok: false, code: 'NETWORK' })
  })

  it('超過時間沒回應也當作沒網路', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('abort'))))),
    )
    expect(await callApi('list', {}, 20)).toMatchObject({ ok: false, code: 'NETWORK' })
  })
})

describe('沒訊號暫存與補送', () => {
  it('補送成功就從暫存移除', async () => {
    pendingQueue.add(item('a'))
    pendingQueue.add(item('b'))
    vi.stubGlobal('fetch', vi.fn(() => respond({ ok: true })))
    const outcome = await flushPending()
    expect(outcome.sent).toBe(2)
    expect(pendingQueue.count()).toBe(0)
  })

  it('還是沒網路：資料留著，不遺失', async () => {
    pendingQueue.add(item('a'))
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    const outcome = await flushPending()
    expect(outcome.blocked).toBe(true)
    expect(outcome.sent).toBe(0)
    expect(pendingQueue.count()).toBe(1)
  })

  it('內容被後端拒絕（例如日期不合）：放棄那筆並回報，不會一直重試', async () => {
    pendingQueue.add(item('bad'))
    vi.stubGlobal('fetch', vi.fn(() => respond({ ok: false, error: '日期不能是未來的日子' })))
    const outcome = await flushPending()
    expect(outcome.dropped).toHaveLength(1)
    expect(outcome.dropped[0].error).toContain('未來')
    expect(pendingQueue.count()).toBe(0)
  })

  it('登入過期：暫存的資料保留，等重新登入再補送', async () => {
    pendingQueue.add(item('a'))
    vi.stubGlobal('fetch', vi.fn(() => respond({ ok: false, error: '登入已過期', code: 'AUTH' })))
    const outcome = await flushPending()
    expect(outcome.blocked).toBe(true)
    expect(sessionStore.get()).toBeNull() // 已登出
    sessionStore.set({ token: 't2', username: 'mom' }) // 重新登入
    expect(pendingQueue.count()).toBe(1)
  })

  it('補送時帶著當初的編號與時間，後端才認得是同一筆', async () => {
    pendingQueue.add(item('xyz'))
    const fetchMock = vi.fn(() => respond({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await flushPending()
    const body = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams
    expect(body.get('requestId')).toBe('xyz')
    expect(body.get('clientAt')).toBe('1')
  })
})
