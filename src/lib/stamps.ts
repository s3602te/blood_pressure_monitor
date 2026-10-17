import { T } from '../text'
import { addDays, dateText, dayLabel, todayStatus } from './records'

/**
 * 連續簽到／蓋章：每天只要有記錄血壓（不管幾次），那一天就蓋一個章；
 * 早上和晚上都量了，那天再加一顆星。全部用已經載入的紀錄（加上還沒上傳、暫存在手機的）計算，不需要後端。
 */

/** 一筆「某天有記錄」：日期和記錄時間（沒有時間的舊資料給 0） */
export interface StampItem {
  date: string
  at: number
}

export interface Streak {
  /** 目前連續幾天（今天還沒記錄時，只要昨天有，連續就還在，今天記錄就接著算） */
  current: number
  /** 歷史上最長連續幾天（得過的章不會因為中斷而消失，所以用這個） */
  best: number
  /** 總共記錄過幾天 */
  total: number
  recordedToday: boolean
}

const DAY = 86400000
const toUtcDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) // 用 UTC 日期相減，不受夏令時間影響
}

export function computeStreak(items: StampItem[], today: Date): Streak {
  const days = [...new Set(items.map((i) => i.date))].sort()
  const set = new Set(days)
  const todayIso = dateText(today)
  const recordedToday = set.has(todayIso)

  // 目前連續：從今天（沒記錄就從昨天）往回數，連續有記錄的天數
  let current = 0
  let cursor = recordedToday ? today : addDays(today, -1)
  while (set.has(dateText(cursor))) {
    current++
    cursor = addDays(cursor, -1)
  }

  // 歷史最長連續
  let best = 0
  let run = 0
  let prev: number | null = null
  for (const iso of days) {
    const t = toUtcDay(iso)
    run = prev !== null && t - prev === DAY ? run + 1 : 1
    if (run > best) best = run
    prev = t
  }

  return { current, best, total: days.length, recordedToday }
}

export interface StampDay {
  iso: string
  weekday: string
  stamped: boolean
  /** 早上和晚上都有量，多一顆星 */
  star: boolean
  isToday: boolean
}

export interface Milestone {
  days: number
  name: string
}

export interface StampCardData {
  streak: Streak
  /** 最近 7 天（最後一個是今天） */
  week: StampDay[]
  /** 已經得到的章（連續天數曾經達到的門檻） */
  earned: Milestone[]
  /** 下一個目標；全部都拿到了就是 null */
  next: { milestone: Milestone; daysLeft: number } | null
}

const MILESTONES: Milestone[] = T.stamp.milestones

export function stampCard(items: StampItem[], today: Date): StampCardData {
  const streak = computeStreak(items, today)
  const week: StampDay[] = []
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i)
    const iso = dateText(d)
    const status = todayStatus(items, iso) // 借用「這一天早上、晚上各有沒有」的算法
    week.push({
      iso,
      weekday: dayLabel(iso).weekday,
      stamped: status.morning || status.evening,
      star: status.morning && status.evening,
      isToday: i === 0,
    })
  }
  const earned = MILESTONES.filter((m) => m.days <= streak.best)
  const nextMilestone = MILESTONES.find((m) => m.days > streak.current)
  return {
    streak,
    week,
    earned,
    next: nextMilestone ? { milestone: nextMilestone, daysLeft: nextMilestone.days - streak.current } : null,
  }
}

/**
 * 儲存一筆之後，要加在「已儲存」視窗裡的鼓勵話（蓋章完成、得到新的章、早晚都量加一顆星）。
 * 沒有新的東西就回傳空陣列（同一天第二次記錄不會一直重複慶祝）。
 */
export function stampMessage(before: StampItem[], saved: StampItem, today: Date): string[] {
  const after = [...before, saved]
  const b = computeStreak(before, today)
  const a = computeStreak(after, today)
  const lines: string[] = []

  if (a.total > b.total) {
    if (a.current > b.current) lines.push(a.current <= 1 ? T.stamp.firstStamp : T.stamp.celebration(a.current))
    else lines.push(T.stamp.stampedPast)
  }
  for (const m of MILESTONES) {
    if (b.best < m.days && m.days <= a.best) lines.push(T.stamp.milestone(m.name))
  }
  if (saved.date === dateText(today)) {
    const sb = todayStatus(before, saved.date)
    const sa = todayStatus(after, saved.date)
    if (!(sb.morning && sb.evening) && sa.morning && sa.evening) lines.push(T.stamp.bothSlots)
  }
  return lines
}

