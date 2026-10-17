import { T } from '../text'

/** 家庭血壓的提醒用門檻（mmHg）。只是提醒，不是診斷。收縮壓、舒張壓「任何一個」超過就會提醒。 */
export const VERY_HIGH_SYS = 180
export const VERY_HIGH_DIA = 110
export const LOW_SYS = 90
export const LOW_DIA = 60

export type CareLevel = 'high' | 'veryHigh' | 'low'

export interface Advice {
  level: CareLevel
  title: string
  text: string
}

/**
 * 儲存血壓後，依數字給一段溫和的提醒。正常範圍回傳 null（不打擾）。
 * 收縮壓、舒張壓只要有一個到門檻就提醒。優先順序：很高 → 偏高 → 偏低。
 * （老人家常見「收縮壓高、舒張壓低」，例如 150/55，這時以「偏高」為主，再補一句舒張壓偏低。）
 * 提醒的文字在 src/text.ts 的 advice。
 */
export function bpAdvice(sys: number, dia: number): Advice | null {
  const A = T.advice

  if (sys >= VERY_HIGH_SYS || dia >= VERY_HIGH_DIA) {
    return { level: 'veryHigh', title: A.veryHigh.title, text: [A.veryHigh.text, A.note].join('\n') }
  }

  const high = sys >= 135 || dia >= 85
  const low = sys < LOW_SYS || dia < LOW_DIA

  if (high) {
    const lines = [A.high.text]
    if (low) lines.push(A.high.alsoLow(dia < LOW_DIA ? A.high.diastolic : A.high.systolic))
    lines.push(A.high.footer, A.note)
    return { level: 'high', title: A.high.title, text: lines.join('\n') }
  }

  if (low) {
    return { level: 'low', title: A.low.title, text: [A.low.text, A.note].join('\n') }
  }
  return null
}
