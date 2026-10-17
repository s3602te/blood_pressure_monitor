import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { btnPrimary, btnQuiet } from '../ui'
import { Modal } from './Modal'

/** 清掉這支手機上存的網站快取並重新載入，確保拿到最新版（登入狀態與紀錄不受影響） */
async function reloadLatest() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    await Promise.all(regs.map((r) => r.unregister()))
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  } catch {
    /* 略過，直接重新載入 */
  }
  location.reload()
}

/** 版本資訊：給管理者看的，長輩平常看不到（在畫面左上角「血壓記錄」連點 5 下才會出現）。也從這裡進管理員頁面。 */
export function VersionDialog({ username, onClose }: { username: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  return (
    <Modal onClose={onClose} labelledBy="versionTitle" dismissOnBackdrop={false}>
      <h2 id="versionTitle" className="text-[1.625rem] leading-tight font-black">
        版本資訊
      </h2>
      <dl className="mt-3 text-left text-base">
        {[
          ['版本', __APP_VERSION__],
          ['建置時間', __BUILD_TIME__],
          ['登入帳號', username],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-line py-2">
            <dt className="text-muted">{k}</dt>
            <dd className="m-0 font-bold break-all">{v}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        className={`${btnQuiet} mt-4`}
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void reloadLatest()
        }}
      >
        {busy ? '重新載入中…' : '清除快取並重新載入'}
      </button>
      <button type="button" className={`${btnQuiet} mt-3`} onClick={() => navigate('/admin')}>
        管理員頁面
      </button>
      <button type="button" className={`${btnPrimary} mt-3`} onClick={onClose}>
        關閉
      </button>
    </Modal>
  )
}
