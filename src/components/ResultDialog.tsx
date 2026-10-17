import { useEffect } from 'react'
import { T } from '../text'
import { btnPrimary } from '../ui'
import { Modal } from './Modal'

export interface ResultInfo {
  /** ok 成功；error 失敗；warn 暫存；care 血壓偏高／偏低的提醒；urgent 數值很高的提醒 */
  kind: 'ok' | 'error' | 'warn' | 'care' | 'urgent'
  title: string
  detail?: string
}

const ICON = {
  ok: { text: '✓', cls: 'bg-ok-bg text-ok' },
  error: { text: '!', cls: 'bg-danger-bg text-danger' },
  warn: { text: '…', cls: 'bg-warn-bg text-warn' },
  care: { text: '!', cls: 'bg-warn-bg text-warn' },
  urgent: { text: '!', cls: 'bg-danger-bg text-danger' },
}

/** 儲存結果：成功 4 秒後自動關閉；失敗、暫存、血壓提醒要按「好」才關（提醒一定要看到） */
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
        {T.common.ok}
      </button>
    </Modal>
  )
}
