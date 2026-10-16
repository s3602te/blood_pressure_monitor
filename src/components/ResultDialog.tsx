import { useEffect } from 'react'
import { btnPrimary } from '../ui'
import { Modal } from './Modal'

export interface ResultInfo {
  kind: 'ok' | 'error' | 'warn'
  title: string
  detail?: string
}

const ICON = {
  ok: { text: '✓', cls: 'bg-ok-bg text-ok' },
  error: { text: '!', cls: 'bg-danger-bg text-danger' },
  warn: { text: '…', cls: 'bg-warn-bg text-warn' },
}

/** 儲存結果：成功 4 秒後自動關閉；失敗和暫存要按「好」才關 */
export function ResultDialog({ result, onClose }: { result: ResultInfo; onClose: () => void }) {
  useEffect(() => {
    if (result.kind !== 'ok') return
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [result, onClose])

  const icon = ICON[result.kind]
  return (
    <Modal onClose={onClose} labelledBy="resultTitle">
      <div
        aria-hidden="true"
        className={`mx-auto mb-3.5 flex size-16 items-center justify-center rounded-full text-4xl leading-none font-black ${icon.cls}`}
      >
        {icon.text}
      </div>
      <h2 id="resultTitle" className="text-[1.625rem] leading-tight font-black">
        {result.title}
      </h2>
      {result.detail && <p className="mt-2 break-words whitespace-pre-line text-muted">{result.detail}</p>}
      <button type="button" className={`${btnPrimary} mt-[22px]`} onClick={onClose} autoFocus>
        好
      </button>
    </Modal>
  )
}
