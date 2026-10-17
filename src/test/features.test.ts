import { describe, expect, it } from 'vitest'
import { bpAdvice } from '../lib/advice'
import {
  aggregateByDate,
  agoText,
  buildReport,
  daysSince,
  reportToCsv,
  todayStatus,
  weekTrend,
} from '../lib/records'
import type { BpRecord } from '../lib/types'

const at = (date: string, h: number, m = 0) => {
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).getTime()
}
const rec = (date: string, h: number, sys: number, dia: number, over: Partial<BpRecord> = {}): BpRecord => ({
  row: 2,
  date,
  sys,
  dia,
  pulse: 70,
  med: '沒吃',
  notes: '',
  at: at(date, h),
  ...over,
})

describe('血壓提醒', () => {
  it('正常範圍不打擾', () => {
    expect(bpAdvice(120, 80)).toBeNull()
    expect(bpAdvice(134, 84)).toBeNull()
  })
  it('偏高：135/85 以上', () => {
    expect(bpAdvice(135, 70)?.level).toBe('high')
    expect(bpAdvice(120, 85)?.level).toBe('high')
    expect(bpAdvice(150, 90)?.text).toContain('休息 5 分鐘')
  })
  it('很高：180/110 以上，要提醒聯絡家人、必要時 119', () => {
    const a = bpAdvice(185, 100)!
    expect(a.level).toBe('veryHigh')
    expect(a.text).toContain('119')
    expect(bpAdvice(150, 110)?.level).toBe('veryHigh')
  })
  it('偏低：90/60 以下', () => {
    expect(bpAdvice(85, 70)?.level).toBe('low')
    expect(bpAdvice(110, 55)?.level).toBe('low')
  })
  it('每一種提醒都說明不是診斷', () => {
    for (const [s, d] of [[150, 90], [190, 100], [80, 50]]) expect(bpAdvice(s, d)!.text).toContain('不是診斷')
  })
})

describe('今天早上、晚上各記錄了沒（分開看）', () => {
  const today = '2026-10-17'
  it('只有早上記錄 → 早上打勾、晚上沒有', () => {
    expect(todayStatus([{ date: today, at: at(today, 7) }], today)).toEqual({ morning: true, evening: false })
  })
  it('早晚都有', () => {
    expect(todayStatus([{ date: today, at: at(today, 7) }, { date: today, at: at(today, 22) }], today)).toEqual({ morning: true, evening: true })
  })
  it('別天的紀錄不算；沒有記錄時間的舊資料算早上', () => {
    expect(todayStatus([{ date: '2026-10-16', at: at('2026-10-16', 22) }], today)).toEqual({ morning: false, evening: false })
    expect(todayStatus([{ date: today, at: 0 }], today)).toEqual({ morning: true, evening: false })
  })
  it('中午 12 點整算晚上、凌晨 4 點前算晚上', () => {
    expect(todayStatus([{ date: today, at: at(today, 12) }], today).evening).toBe(true)
    expect(todayStatus([{ date: today, at: at(today, 3, 30) }], today).evening).toBe(true)
  })
})

describe('這週和上週比較', () => {
  const today = new Date(2026, 9, 17)
  // 最近 7 天（10/11~10/17）每天一筆、前 7 天（10/4~10/10）每天一筆
  const week = (startDay: number, sys: number, dia: number, n = 7) =>
    Array.from({ length: n }, (_, i) => rec(`2026-10-${String(startDay + i).padStart(2, '0')}`, 7, sys, dia))
  const trendOf = (thisSys: number, thisDia: number, lastSys: number, lastDia: number) =>
    weekTrend(aggregateByDate([...week(4, lastSys, lastDia), ...week(11, thisSys, thisDia)]), today)

  it('比上週低 → 好轉', () => {
    const t = trendOf(125, 78, 132, 82)
    expect(t.kind).toBe('better')
    expect([t.dSys, t.dDia]).toEqual([-7, -4])
  })
  it('比上週高 → 要留意', () => {
    expect(trendOf(138, 86, 130, 80).kind).toBe('worse')
  })
  it('差不多且在安全範圍 → 維持得很好', () => {
    expect(trendOf(124, 78, 125, 78).kind).toBe('steady')
  })
  it('差不多但仍偏高 → 仍然偏高', () => {
    expect(trendOf(140, 88, 140, 88).kind).toBe('steadyHigh')
  })
  it('一個升一個降 → 有升有降', () => {
    expect(trendOf(122, 86, 128, 80).kind).toBe('mixed')
  })
  it('任何一週少於 3 天紀錄 → 資料不夠', () => {
    const days = aggregateByDate([...week(4, 130, 80), ...week(11, 130, 80, 2)])
    expect(weekTrend(days, today).kind).toBe('notEnough')
  })
})

describe('給醫師看：逐筆清單、CSV', () => {
  const records = [
    rec('2026-10-15', 7, 130, 80, { notes: '晚睡' }),
    rec('2026-10-16', 7, 128, 78),
    rec('2026-10-16', 22, 140, 90, { med: '有吃', notes: '=1+1, "危險"' }),
    rec('2026-10-16', 22, 137, 88, { med: '有吃', at: at('2026-10-16', 22, 10) }),
  ]
  const report = buildReport(records, '2026-10-01', '2026-10-31')!

  it('一次量測一列，最新的在最上面（和歷史頁一樣）', () => {
    expect(report.rows.map((r) => `${r.date} ${r.slot === 0 ? '早' : '晚'} ${r.rec.sys}`)).toEqual([
      '2026-10-16 晚 137',
      '2026-10-16 晚 140',
      '2026-10-16 早 128',
      '2026-10-15 早 130',
    ])
  })
  it('日期只在每天的第一列顯示', () => {
    expect(report.rows.map((r) => r.firstOfDay)).toEqual([true, false, false, true])
  })
  it('有量一次、量多次、沒量的日子，列數正好等於量測次數（沒有空格列）', () => {
    expect(report.rows).toHaveLength(report.stats.readingCount)
  })
  it('CSV：由新到舊、有標題、中文不亂碼用的 BOM、公式與引號有處理', () => {
    const csv = reportToCsv(report)
    expect(csv.startsWith('﻿日期,星期,時段,時間,收縮壓,舒張壓,脈搏,吃藥,今日狀況')).toBe(true)
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(5)
    expect(lines[1].startsWith('2026-10-16,週五,晚上,22:10,137,88,70,有吃')).toBe(true)
    expect(lines[2]).toContain('"\'=1+1, ""危險"""') // 以 = 開頭加單引號，逗號與引號用雙引號包起來
  })
})

describe('管理頁：多久沒用', () => {
  const now = new Date(2026, 9, 17, 12)
  it('用日曆日算', () => {
    expect(daysSince(0, now)).toBeNull()
    expect(agoText(0, now)).toBe('從來沒有')
    expect(agoText(new Date(2026, 9, 17, 1).getTime(), now)).toBe('今天')
    expect(agoText(new Date(2026, 9, 16, 23).getTime(), now)).toBe('昨天')
    expect(agoText(new Date(2026, 9, 10, 8).getTime(), now)).toBe('7 天前')
  })
})
