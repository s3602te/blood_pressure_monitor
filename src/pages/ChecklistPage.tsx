import { useMemo, useState } from 'react'
import { usePageTitle } from '../hooks/hooks'
import { checklistStore, type ChecklistState } from '../lib/storage'
import { T } from '../text'
import { btnQuiet, card, input, pageTitle } from '../ui'

const sections = T.checklist.sections

/** 真機驗收單：拿真的手機把每個功能試一遍，每項按「正常」或「有問題」，結果記在這支手機上。 */
export default function ChecklistPage() {
  usePageTitle(T.checklist.pageTitle)
  const [state, setState] = useState<ChecklistState>(() => checklistStore.read())
  const [copyText, setCopyText] = useState('') // 複製失敗時，把文字顯示出來讓人手動複製
  const [copied, setCopied] = useState(false)

  const update = (next: ChecklistState) => {
    setState(next)
    checklistStore.write(next)
    setCopied(false)
  }

  const total = useMemo(() => sections.reduce((n, s) => n + s.items.length, 0), [])
  const done = Object.keys(state.marks).length
  const badItems = sections.flatMap((s) =>
    s.items.filter((it) => state.marks[it.id] === 'bad').map((it) => `${s.title}：${it.text}`),
  )

  const mark = (id: string, value: 'ok' | 'bad') => {
    const marks = { ...state.marks }
    if (marks[id] === value) delete marks[id] // 再按一次取消
    else marks[id] = value
    update({ ...state, marks })
  }

  const copy = async () => {
    const text = T.checklist.summary(state.device.trim(), done, total, badItems)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setCopyText('')
    } catch {
      setCopyText(text)
    }
  }

  return (
    <>
      <h1 className={pageTitle}>{T.checklist.heading}</h1>
      <p className="mt-1 text-muted">{T.checklist.intro}</p>

      <div className="mt-4">
        <label htmlFor="deviceInfo" className="mb-1.5 block font-bold">
          {T.checklist.deviceLabel}
        </label>
        <input
          id="deviceInfo"
          className={input}
          type="text"
          placeholder={T.checklist.devicePlaceholder}
          value={state.device}
          onChange={(e) => update({ ...state, device: e.target.value })}
        />
      </div>

      <p role="status" className="mt-4 rounded-xl bg-ok-bg px-4 py-3 font-bold text-ok">
        {T.checklist.progress(done, total, badItems.length)}
      </p>

      {sections.map((section) => (
        <section key={section.title} className={card} aria-label={section.title}>
          <h2 className="text-xl font-black">{section.title}</h2>
          {section.items.map((it) => {
            const m = state.marks[it.id]
            return (
              <div key={it.id} className="mt-4 border-t border-line pt-3" data-item={it.id}>
                <p className="font-bold">{it.text}</p>
                <p className="mt-0.5 text-[0.9375rem] text-muted">
                  {T.checklist.expect}
                  {it.expect}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    aria-pressed={m === 'ok'}
                    onClick={() => mark(it.id, 'ok')}
                    className={`min-h-12 cursor-pointer rounded-card border-2 font-bold ${
                      m === 'ok' ? 'border-teal bg-teal-deep text-white' : 'border-line bg-card text-ink'
                    }`}
                  >
                    {m === 'ok' ? '✓ ' : ''}
                    {T.checklist.ok}
                  </button>
                  <button
                    type="button"
                    aria-pressed={m === 'bad'}
                    onClick={() => mark(it.id, 'bad')}
                    className={`min-h-12 cursor-pointer rounded-card border-2 font-bold ${
                      m === 'bad' ? 'border-danger bg-danger text-white' : 'border-line bg-card text-ink'
                    }`}
                  >
                    {m === 'bad' ? '✗ ' : ''}
                    {T.checklist.bad}
                  </button>
                </div>
              </div>
            )
          })}
        </section>
      ))}

      <div className="mt-6 grid gap-2.5">
        <button type="button" className={btnQuiet} onClick={() => void copy()}>
          {T.checklist.copy}
        </button>
        {copied && (
          <p role="status" className="rounded-xl bg-ok-bg px-4 py-3 font-bold text-ok">
            {T.checklist.copied}
          </p>
        )}
        {copyText && (
          <div>
            <p className="mb-1 text-sm text-muted">{T.checklist.copyFallback}</p>
            <textarea readOnly className={`${input} min-h-32`} value={copyText} onFocus={(e) => e.currentTarget.select()} />
          </div>
        )}
        {badItems.length === 0 && done === total && <p className="text-center font-bold text-ok">{T.checklist.noProblem}</p>}
        <button
          type="button"
          className={btnQuiet}
          onClick={() => {
            if (confirm(T.checklist.resetConfirm)) {
              checklistStore.clear()
              setState({ device: state.device, marks: {} })
              setCopyText('')
              setCopied(false)
            }
          }}
        >
          {T.checklist.reset}
        </button>
      </div>
    </>
  )
}
