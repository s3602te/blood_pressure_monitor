// 全站共用的 Tailwind 樣式組合（避免每個頁面重複寫一長串）

/** 頁面內容的寬度與左右留白（橫放手機時避開瀏海） */
export const wrap =
  'mx-auto w-full max-w-[520px] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))]'

export const pageTitle = 'mt-[22px] text-[1.75rem] leading-tight font-black'

export const btn =
  'flex min-h-[3.6rem] w-full cursor-pointer items-center justify-center rounded-card border-2 border-transparent px-5 text-xl font-bold no-underline transition-colors disabled:opacity-60'

export const btnPrimary = `${btn} mt-[26px] bg-teal-deep text-white hover:bg-teal disabled:cursor-wait`

export const btnQuiet = `${btn} min-h-12 border-line bg-card text-[1.0625rem] text-ink hover:not-disabled:bg-ok-bg disabled:cursor-not-allowed disabled:opacity-40`

export const btnDanger = `${btnQuiet} text-danger border-danger-bg hover:not-disabled:bg-danger-bg`

export const input =
  'w-full rounded-xl border-2 border-line bg-card p-3.5 text-ink focus:border-teal focus:ring-4 focus:ring-teal/20 focus:outline-none'

export const field = 'mt-5'
export const fieldLabel = 'mb-1.5 block font-bold'
export const fieldHint = 'text-[0.9375rem] font-normal text-muted'

export const linkBtn =
  'cursor-pointer border-0 bg-transparent px-1 py-2 text-base font-bold text-teal-deep underline underline-offset-[3px]'

export const card = 'mt-5 rounded-card border border-line bg-card p-4'

export const statusBase = 'mt-4 rounded-xl px-3.5 py-3 font-bold'
export const statusKind = {
  ok: 'bg-ok-bg text-ok',
  error: 'bg-danger-bg text-danger',
  info: 'bg-[#e6edec] text-ink-soft',
} as const

/** 左右兩選一的大按鈕（有吃／沒吃、登入／建立帳號）：搭配隱藏的 radio 使用 */
export const segWrap = 'grid grid-cols-2 gap-2.5'
export const segInput = 'peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0'
export const segLabel =
  'flex min-h-14 items-center justify-center rounded-card border-2 border-line bg-card font-bold peer-checked:border-teal peer-checked:bg-ok-bg peer-checked:text-teal-deep peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal'

/** 偏高的數字標示（黃底） */
export const hiMark = 'rounded-md bg-warn-bg px-1.5 py-0.5 font-black text-warn print:border print:border-warn'
