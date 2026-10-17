import { useEffect, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { errorOf, fetchRecords, handleAuthError } from '../lib/api'
import { T } from '../text'
import { fontSize, pendingQueue, recordCache, sessionStore } from '../lib/storage'

export const useSession = () => useSyncExternalStore(sessionStore.subscribe, sessionStore.get)

export const useLargeFont = () => useSyncExternalStore(fontSize.subscribe, fontSize.isLarge)

export const usePendingCount = () =>
  useSyncExternalStore(pendingQueue.subscribe, () => pendingQueue.count())

/**
 * 這個帳號的所有血壓紀錄。
 * 先秀出這台手機上次存的（馬上看得到），同時到背景抓最新的；失敗時畫面上仍保留舊資料。
 */
export function useRecords() {
  const username = useSession()?.username
  return useQuery({
    queryKey: ['records', username],
    enabled: !!username,
    retry: false,
    initialData: () => recordCache.read()?.records,
    initialDataUpdatedAt: () => recordCache.read()?.at,
    queryFn: async () => {
      const result = await fetchRecords()
      if (handleAuthError(result)) throw new Error(T.errors.authExpired)
      if (!result.ok) throw new Error(errorOf(result, T.errors.loadFailed))
      return result.records
    },
  })
}

/** 重新抓一次最新紀錄（修改、刪除、儲存之後用） */
export function useRefreshRecords() {
  const qc = useQueryClient()
  return () => qc.refetchQueries({ queryKey: ['records'] })
}

const subscribeOnline = (fn: () => void) => {
  window.addEventListener('online', fn)
  window.addEventListener('offline', fn)
  return () => {
    window.removeEventListener('online', fn)
    window.removeEventListener('offline', fn)
  }
}

/** 手機現在有沒有網路 */
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine)

/** 設定網頁標題（顯示在瀏覽器分頁上） */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = T.app.pageTitle(title)
  }, [title])
}
