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

const NOTE = '這只是提醒，不是診斷，請依醫師的指示服藥。'

/**
 * 儲存血壓後，依數字給一段溫和的提醒。正常範圍回傳 null（不打擾）。
 * 收縮壓、舒張壓只要有一個到門檻就提醒。優先順序：很高 → 偏高 → 偏低。
 * （老人家常見「收縮壓高、舒張壓低」，例如 150/55，這時以「偏高」為主，再補一句舒張壓偏低。）
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

  const high = sys >= 135 || dia >= 85
  const low = sys < LOW_SYS || dia < LOW_DIA

  if (high) {
    return {
      level: 'high',
      title: '這次偏高',
      text:
        '請坐著休息 5 分鐘後再量一次，量的時候不要說話，手臂放在桌上、和心臟差不多高。\n' +
        (low ? `另外，${dia < LOW_DIA ? '舒張壓' : '收縮壓'}有點低，回診時也跟醫師說一聲。\n` : '') +
        '如果常常這樣，回診時記得給醫師看「給醫師看」的紀錄。\n' +
        NOTE,
    }
  }

  if (low) {
    return {
      level: 'low',
      title: '這次偏低',
      text:
        '如果覺得頭暈、冒冷汗，請先坐下或躺下休息，起身要慢慢來，並告訴家人。\n' + NOTE,
    }
  }
  return null
}
