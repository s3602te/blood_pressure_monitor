/** 家庭血壓的提醒用門檻（mmHg）。只是提醒，不是診斷。 */
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

const NOTE = '這只是提醒，不是診斷，請依醫師的指示服藥。'

/**
 * 儲存血壓後，依數字給一段溫和的提醒。正常範圍回傳 null（不打擾）。
 * 順序：很高 → 偏低 → 偏高。
 */
export function bpAdvice(sys: number, dia: number): Advice | null {
  if (sys >= VERY_HIGH_SYS || dia >= VERY_HIGH_DIA) {
    return {
      level: 'veryHigh',
      title: '數值很高',
      text:
        '請先坐下來休息 5 分鐘，再量一次。\n' +
        '如果還是這麼高，或有頭痛、胸悶、頭暈、看不清楚、說話不順，請馬上聯絡家人，必要時撥 119。\n' +
        NOTE,
    }
  }
  if (sys < LOW_SYS || dia < LOW_DIA) {
    return {
      level: 'low',
      title: '這次偏低',
      text:
        '如果覺得頭暈、冒冷汗，請先坐下或躺下休息，起身要慢慢來，並告訴家人。\n' + NOTE,
    }
  }
  if (sys >= 135 || dia >= 85) {
    return {
      level: 'high',
      title: '這次偏高',
      text:
        '請坐著休息 5 分鐘後再量一次，量的時候不要說話，手臂放在桌上、和心臟差不多高。\n' +
        '如果常常這樣，回診時記得給醫師看「給醫師看」的紀錄。\n' +
        NOTE,
    }
  }
  return null
}
