import type { BpRecord } from './types'

/** 家庭血壓參考值（mmHg）：收縮 135、舒張 85 以上標示為偏高 */
export const HIGH_SYS = 135
export const HIGH_DIA = 85

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export const pad = (n: number) => String(n).padStart(2, '0')

export const dateText = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

export const isHigh = (sys: number, dia: number) => sys >= HIGH_SYS || dia >= HIGH_DIA

/** 'yyyy-MM-dd' → { label: '06/13', weekday: '五' } */
export function dayLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return { label: `${pad(m)}/${pad(d)}`, weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()] }
}

/** 早上＝凌晨 4 點到中午 12 點前記錄的；其餘算晚上（半夜補記的也算前一天的晚上） */
export function slotOf(at: number): 0 | 1 {
  const h = new Date(at).getHours()
  return h >= 4 && h < 12 ? 0 : 1
}

export const slotName = (at: number) => (slotOf(at) === 0 ? '早上' : '晚上')

const valid = (r: BpRecord) => !!r.date && Number.isFinite(r.sys) && Number.isFinite(r.dia)

const mean = (values: number[]) => {
  const v = values.filter(Number.isFinite)
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
}

/* ───────────── 歷史頁：每天合併成一筆 ───────────── */

export interface DayAgg {
  iso: string
  label: string
  weekday: string
  sys: number
  dia: number
  pulse: number | null
  med: '有吃' | '沒吃'
  notes: string
  /** 這天的每一筆原始紀錄（修改、刪除要用，由舊到新） */
  items: BpRecord[]
}

/** 同一天多筆合併成一筆：血壓取平均，有任何一筆「有吃」就算有吃，狀況文字合併 */
export function aggregateByDate(records: BpRecord[]): DayAgg[] {
  const byDate = new Map<string, BpRecord[]>()
  records
    .filter(valid)
    .sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at)
    .forEach((r) => {
      const list = byDate.get(r.date) ?? []
      list.push(r)
      byDate.set(r.date, list)
    })

  return [...byDate.entries()].map(([iso, items]) => {
    const notes: string[] = []
    items.forEach((r) => {
      if (r.notes && !notes.includes(r.notes)) notes.push(r.notes)
    })
    return {
      iso,
      ...dayLabel(iso),
      sys: mean(items.map((r) => r.sys)) as number,
      dia: mean(items.map((r) => r.dia)) as number,
      pulse: mean(items.map((r) => r.pulse)),
      med: items.some((r) => r.med === '有吃') ? '有吃' : '沒吃',
      notes: notes.join('；'),
      items,
    }
  })
}

export const average = (list: DayAgg[], key: 'sys' | 'dia' | 'pulse') =>
  mean(list.map((d) => d[key]).filter((v): v is number => v !== null))

/* ───────────── 給醫師看 ───────────── */

export type RangeChoice = '7' | '30' | '90' | 'custom'

export function rangeFor(choice: RangeChoice, today: Date, custom?: { from: string; to: string }) {
  if (choice === 'custom') {
    if (!custom?.from || !custom.to) return null
    return custom.from > custom.to ? { from: custom.to, to: custom.from } : custom
  }
  return { from: dateText(addDays(today, -(Number(choice) - 1))), to: dateText(today) }
}

/** 同一天、數值完全相同、記錄時間相差不到 1 分鐘的視為重複（舊版曾有連按兩次存成兩筆的情形） */
export function dedupe(list: BpRecord[]): BpRecord[] {
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at)
  const out: BpRecord[] = []
  for (const r of sorted) {
    const prev = out[out.length - 1]
    if (
      prev &&
      prev.date === r.date &&
      prev.sys === r.sys &&
      prev.dia === r.dia &&
      prev.pulse === r.pulse &&
      Math.abs(r.at - prev.at) < 60000
    ) {
      continue
    }
    out.push(r)
  }
  return out
}

export interface ReportDay {
  date: string
  label: string
  weekday: string
  /** [早上, 晚上] 各自的每一次量測 */
  slots: [BpRecord[], BpRecord[]]
  took: boolean
  notes: string[]
}

/** 沒有記錄時間的舊資料，先放早上、已有再放晚上 */
export function groupByDay(readings: BpRecord[]): ReportDay[] {
  const days = new Map<string, ReportDay>()
  for (const r of readings) {
    let d = days.get(r.date)
    if (!d) {
      d = { date: r.date, ...dayLabel(r.date), slots: [[], []], took: false, notes: [] }
      days.set(r.date, d)
    }
    if (r.med === '有吃') d.took = true
    if (r.notes && !d.notes.includes(r.notes)) d.notes.push(r.notes)
    const slot = r.at ? slotOf(r.at) : d.slots[0].length ? 1 : 0
    d.slots[slot].push(r)
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export const bpText = (list: BpRecord[]) => {
  const s = mean(list.map((r) => r.sys))
  const d = mean(list.map((r) => r.dia))
  return s === null || d === null ? '--' : `${s}/${d}`
}

export interface ReportStats {
  avgBp: string
  avgPulse: number | null
  dayCount: number
  readingCount: number
  morning: { bp: string; n: number }
  evening: { bp: string; n: number }
  high: number
  highPct: number
  tookDays: number
  peak: BpRecord
}

export interface Report {
  days: ReportDay[]
  stats: ReportStats
}

/** 整理某段期間的報告；那段期間沒有任何紀錄時回傳 null */
export function buildReport(records: BpRecord[], from: string, to: string): Report | null {
  const readings = dedupe(records.filter((r) => valid(r) && r.date >= from && r.date <= to))
  if (!readings.length) return null
  const days = groupByDay(readings)
  const morning = days.flatMap((d) => d.slots[0])
  const evening = days.flatMap((d) => d.slots[1])
  const high = readings.filter((r) => isHigh(r.sys, r.dia)).length
  return {
    days,
    stats: {
      avgBp: bpText(readings),
      avgPulse: mean(readings.map((r) => r.pulse)),
      dayCount: days.length,
      readingCount: readings.length,
      morning: { bp: bpText(morning), n: morning.length },
      evening: { bp: bpText(evening), n: evening.length },
      high,
      highPct: Math.round((high / readings.length) * 100),
      tookDays: days.filter((d) => d.took).length,
      peak: readings.reduce((a, b) => (b.sys > a.sys ? b : a)),
    },
  }
}
