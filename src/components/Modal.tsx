import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  onClose: () => void
  labelledBy: string
  /** 寬版：內容比較多時用（歷史頁的修改視窗），內容太長可以捲動 */
  wide?: boolean
  children: ReactNode
}

/** 畫面正中央的視窗：點背景或按 Esc 可以關閉 */
export function Modal({ onClose, labelledBy, wide, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-ink/55 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`animate-modal-in w-full rounded-panel bg-card px-6 pt-7 pb-6 ${
          wide ? 'max-h-[90vh] max-w-[460px] overflow-y-auto text-left' : 'max-w-[360px] text-center'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
