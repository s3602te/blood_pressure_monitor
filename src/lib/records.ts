import { T } from '../text'
import { MED_NO, MED_YES, type BpRecord } from './types'

/** 家庭血壓參考值（mmHg）：收縮 135、舒張 85 以上標示為偏高 */
export const HIGH_SYS = 135
export const HIGH_DIA = 85

export const WEEKDAYS = T.common.weekdays

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

export const slotName = (at: number) => (slotOf(at) === 0 ? T.common.morning : T.common.evening)

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
  med: typeof MED_YES | typeof MED_NO
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
      med: items.some((r) => r.med === MED_YES) ? MED_YES : MED_NO,
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
    if (r.med === MED_YES) d.took = true
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

/** 報告裡的一列＝一次量測（日期、早晚、血壓、脈搏、吃藥、狀況）。最新的在最上面。 */
export interface ReportRow {
  rec: BpRecord
  date: string
  label: string
  weekday: string
  slot: 0 | 1
  /** 記錄時間 HH:mm；很舊的資料沒有記錄時間就是空字串 */
  time: string
  /** 這是那一天的第一列（日期只在第一列顯示，同一天的其他列合併在下面） */
  firstOfDay: boolean
}

export interface Report {
  /** 這段期間（已去除重複）的每一筆量測，畫圖用 */
  readings: BpRecord[]
  days: ReportDay[]
  /** 逐筆列表，由新到舊（和歷史頁的順序一致） */
  rows: ReportRow[]
  stats: ReportStats
}

const timeOf = (at: number) => {
  if (!at) return ''
  const t = new Date(at)
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`
}

/** 整理某段期間的報告；那段期間沒有任何紀錄時回傳 null */
export function buildReport(records: BpRecord[], from: string, to: string): Report | null {
  const readings = dedupe(records.filter((r) => valid(r) && r.date >= from && r.date <= to))
  if (!readings.length) return null
  const days = groupByDay(readings)
  const morning = days.flatMap((d) => d.slots[0])
  const evening = days.flatMap((d) => d.slots[1])
  const high = readings.filter((r) => isHigh(r.sys, r.dia)).length

  // 由新到舊：日期新的在前；同一天晚上在前、早上在後，各自也是新的在前
  const rows: ReportRow[] = []
  for (const d of [...days].reverse()) {
    const items = ([1, 0] as const).flatMap((slot) =>
      [...d.slots[slot]].sort((a, b) => b.at - a.at).map((rec) => ({ rec, slot })),
    )
    items.forEach(({ rec, slot }, i) =>
      rows.push({ rec, date: d.date, label: d.label, weekday: d.weekday, slot, time: timeOf(rec.at), firstOfDay: i === 0 }),
    )
  }

  return {
    readings,
    days,
    rows,
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

/* ───────────── 下載 CSV（用 Excel 或試算表開啟） ───────────── */

// 以 = + - @ 開頭的文字，Excel 會當成公式執行，所以加上單引號強制當純文字
const csvCell = (value: string | number) => {
  let text = String(value)
  if (/^[=+\-@]/.test(text)) text = "'" + text
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * 把報告轉成 CSV。每一列是一次量測，由新到舊；開頭加 BOM，Excel 才不會把中文變亂碼。
 * includeNotes = false 時整欄「今日狀況」都不放（備註有私人內容時用）。
 */
export function reportToCsv(report: Report, includeNotes = true): string {
  const header = includeNotes ? [...T.doctor.csvHeader, T.doctor.csvNotesHeader] : T.doctor.csvHeader
  const lines = report.rows.map((r) =>
    [
      r.date,
      T.common.weekday(r.weekday),
      r.slot === 0 ? T.common.morning : T.common.evening,
      r.time,
      r.rec.sys,
      r.rec.dia,
      r.rec.pulse,
      r.rec.med,
      ...(includeNotes ? [r.rec.notes] : []),
    ]
      .map(csvCell)
      .join(','),
  )
  return '\uFEFF' + [header.join(','), ...lines].join('\r\n') + '\r\n'
}

/* ───────────── 圖表：早晚一起看／只看早上／只看晚上 ───────────── */

export type ChartMode = 'all' | 'morning' | 'evening'

/**
 * 依時段重新算每天的數字：'all' 原樣；'morning'／'evening' 只用那個時段的量測重算每天的平均，
 * 那一天那個時段沒有量就不畫那一天。時段的算法和報告相同（groupByDay）。
 */
export function filterBySlot(days: DayAgg[], mode: ChartMode): DayAgg[] {
  if (mode === 'all') return days
  const want = mode === 'morning' ? 0 : 1
  const out: DayAgg[] = []
  for (const d of days) {
    const items = groupByDay(d.items)[0]?.slots[want] ?? []
    if (!items.length) continue
    const notes: string[] = []
    items.forEach((r) => {
      if (r.notes && !notes.includes(r.notes)) notes.push(r.notes)
    })
    out.push({
      ...d,
      sys: mean(items.map((r) => r.sys)) as number,
      dia: mean(items.map((r) => r.dia)) as number,
      pulse: mean(items.map((r) => r.pulse)),
      med: items.some((r) => r.med === MED_YES) ? MED_YES : MED_NO,
      notes: notes.join('；'),
      items,
    })
  }
  return out
}

/* ───────────── 記錄頁：今天早上、晚上各記錄了沒 ───────────── */

export interface TodayStatus {
  morning: boolean
  evening: boolean
}

/** 今天有沒有記錄：早上、晚上分開看（時段的算法和報告相同；沒有記錄時間的舊資料算早上） */
export function todayStatus(items: { date: string; at: number }[], todayIso: string): TodayStatus {
  const status: TodayStatus = { morning: false, evening: false }
  for (const it of items) {
    if (it.date !== todayIso) continue
    if (!it.at || slotOf(it.at) === 0) status.morning = true
    else status.evening = true
  }
  return status
}

/* ───────────── 歷史頁：這週和上週比 ───────────── */

export interface WeekStats {
  sys: number
  dia: number
  days: number
}

export type TrendKind = 'notEnough' | 'better' | 'worse' | 'steady' | 'steadyHigh' | 'mixed'

export interface Trend {
  kind: TrendKind
  /** 這週、上週各是哪幾天（yyyy-MM-dd），畫面上要寫清楚 */
  range: { thisFrom: string; thisTo: string; lastFrom: string; lastTo: string }
  thisWeek: WeekStats | null
  lastWeek: WeekStats | null
  /** 這週減上週（mmHg）；負的代表比上週低 */
  dSys: number
  dDia: number
}

const MIN_DAYS = 3

function weekStats(days: DayAgg[], from: string, to: string): WeekStats | null {
  const list = days.filter((d) => d.iso >= from && d.iso <= to)
  if (list.length < MIN_DAYS) return null
  return { sys: average(list, 'sys') as number, dia: average(list, 'dia') as number, days: list.length }
}

/**
 * 最近 7 天（含今天）和前 7 天的平均血壓比較。每週至少要有 3 天紀錄才比較。
 * 差 2～3 mmHg 以內算「持平」；持平又在安全範圍（低於 135/85）就是「維持得很好」。
 */
export function weekTrend(days: DayAgg[], today: Date): Trend {
  const range = {
    thisFrom: dateText(addDays(today, -6)),
    thisTo: dateText(today),
    lastFrom: dateText(addDays(today, -13)),
    lastTo: dateText(addDays(today, -7)),
  }
  const thisWeek = weekStats(days, range.thisFrom, range.thisTo)
  const lastWeek = weekStats(days, range.lastFrom, range.lastTo)
  if (!thisWeek || !lastWeek) return { kind: 'notEnough', range, thisWeek, lastWeek, dSys: 0, dDia: 0 }

  const dSys = thisWeek.sys - lastWeek.sys
  const dDia = thisWeek.dia - lastWeek.dia
  let kind: TrendKind
  if ((dSys <= -3 || dDia <= -2) && dSys <= 2 && dDia <= 2) kind = 'better'
  else if ((dSys >= 3 || dDia >= 2) && dSys >= -2 && dDia >= -2) kind = 'worse'
  else if (Math.abs(dSys) <= 2 && Math.abs(dDia) <= 1) kind = thisWeek.sys >= HIGH_SYS || thisWeek.dia >= HIGH_DIA ? 'steadyHigh' : 'steady'
  else kind = 'mixed'
  return { kind, range, thisWeek, lastWeek, dSys, dDia }
}

/* ───────────── 歷史頁：最近 1 個月 ───────────── */

export interface MonthSummary {
  days: DayAgg[]
  from: string
  to: string
  avgBp: string
  /** 有記錄的天數 */
  count: number
  /** 其中偏高的天數（當天平均 ≥135/85） */
  highDays: number
}

/** 最近 30 個日曆天（含今天）的總覽；有記錄的天數少於 3 天就不顯示（回傳 null） */
export function monthSummary(days: DayAgg[], today: Date): MonthSummary | null {
  const from = dateText(addDays(today, -29))
  const to = dateText(today)
  const list = days.filter((d) => d.iso >= from && d.iso <= to)
  if (list.length < 3) return null
  return {
    days: list,
    from,
    to,
    avgBp: `${average(list, 'sys')}/${average(list, 'dia')}`,
    count: list.length,
    highDays: list.filter((d) => isHigh(d.sys, d.dia)).length,
  }
}

/* ───────────── 管理頁：多久沒用 ───────────── */

/** 距離現在幾天（用日曆日算：今天 0、昨天 1）；沒有時間（0）回傳 null */
export function daysSince(ms: number, now: Date): number | null {
  if (!ms) return null
  const a = new Date(ms)
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((dayStart(now) - dayStart(a)) / 86400000)
}

export function agoText(ms: number, now: Date): string {
  const d = daysSince(ms, now)
  if (d === null) return T.admin.ago.never
  if (d <= 0) return T.admin.ago.today
  if (d === 1) return T.admin.ago.yesterday
  return T.admin.ago.days(d)
}
