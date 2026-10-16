import { describe, expect, it } from 'vitest'
import { aggregateByDate, average, buildReport, dedupe, groupByDay, isHigh, rangeFor, slotOf } from '../lib/records'
import type { BpRecord } from '../lib/types'

// 台灣時間的某天某時（測試機器的時區可能不同，所以用本機時間組出來）
const at = (date: string, h: number, m = 0, s = 0) => {
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m, s).getTime()
}

const rec = (over: Partial<BpRecord>): BpRecord => ({
  row: 2,
  date: '2026-06-13',
  sys: 130,
  dia: 80,
  pulse: 70,
  med: '沒吃',
  notes: '',
  at: at('2026-06-13', 7, 30),
  ...over,
})

describe('偏高判斷', () => {
  it('收縮 135 或舒張 85 以上就算偏高', () => {
    expect(isHigh(135, 70)).toBe(true)
    expect(isHigh(120, 85)).toBe(true)
    expect(isHigh(134, 84)).toBe(false)
  })
})

describe('早上／晚上', () => {
  it('凌晨 4 點到中午前是早上，其餘是晚上（半夜補記算晚上）', () => {
    expect(slotOf(at('2026-06-13', 3, 59))).toBe(1)
    expect(slotOf(at('2026-06-13', 4, 0))).toBe(0)
    expect(slotOf(at('2026-06-13', 11, 59))).toBe(0)
    expect(slotOf(at('2026-06-13', 12, 0))).toBe(1)
    expect(slotOf(at('2026-06-13', 23, 30))).toBe(1)
  })
})

describe('歷史頁：每天合併', () => {
  const list = [
    rec({ row: 2, sys: 140, dia: 90, pulse: 80, med: '沒吃', notes: '晚睡', at: at('2026-06-13', 22, 0) }),
    rec({ row: 3, sys: 120, dia: 70, pulse: 60, med: '有吃', notes: '晚睡', at: at('2026-06-13', 7, 0) }),
    rec({ row: 4, date: '2026-06-12', sys: 130, dia: 80, pulse: 70, at: at('2026-06-12', 8) }),
  ]

  it('依日期由舊到新，同一天取平均、有任何一筆有吃就算有吃、備註不重複', () => {
    const days = aggregateByDate(list)
    expect(days.map((d) => d.iso)).toEqual(['2026-06-12', '2026-06-13'])
    const d = days[1]
    expect([d.sys, d.dia, d.pulse]).toEqual([130, 80, 70])
    expect(d.med).toBe('有吃')
    expect(d.notes).toBe('晚睡')
    expect(d.label).toBe('06/13')
    expect(d.weekday).toBe('六') // 2026-06-13 是星期六
  })

  it('保留每一筆原始紀錄（依記錄時間由舊到新），修改、刪除要用', () => {
    const d = aggregateByDate(list)[1]
    expect(d.items.map((r) => r.row)).toEqual([3, 2])
  })

  it('略過沒有日期或數值壞掉的資料', () => {
    expect(aggregateByDate([rec({ date: '' }), rec({ sys: NaN })])).toEqual([])
  })

  it('平均值：沒有資料顯示 null', () => {
    expect(average([], 'sys')).toBeNull()
    expect(average(aggregateByDate(list), 'sys')).toBe(130)
  })
})

describe('給醫師看', () => {
  it('同一天、數值相同、1 分鐘內的重複紀錄只算一筆', () => {
    const a = rec({ at: at('2026-06-13', 22, 10, 0) })
    const b = rec({ at: at('2026-06-13', 22, 10, 1) })
    const c = rec({ at: at('2026-06-13', 22, 20, 0) }) // 隔 10 分鐘：是另一次量測
    expect(dedupe([a, b, c])).toHaveLength(2)
  })

  it('分成早上、晚上；沒有記錄時間的舊資料先放早上、再放晚上', () => {
    const days = groupByDay([
      rec({ at: at('2026-06-13', 7), sys: 120 }),
      rec({ at: at('2026-06-13', 22), sys: 140 }),
      rec({ date: '2026-06-14', at: 0, sys: 110 }),
      rec({ date: '2026-06-14', at: 0, sys: 111 }),
    ])
    expect(days[0].slots[0].map((r) => r.sys)).toEqual([120])
    expect(days[0].slots[1].map((r) => r.sys)).toEqual([140])
    expect(days[1].slots[0].map((r) => r.sys)).toEqual([110])
    expect(days[1].slots[1].map((r) => r.sys)).toEqual([111])
  })

  it('整理報告：統計與期間篩選', () => {
    const records = [
      rec({ date: '2026-06-10', sys: 150, dia: 90, at: at('2026-06-10', 7), med: '有吃' }), // 期間外
      rec({ date: '2026-06-12', sys: 130, dia: 80, pulse: 70, at: at('2026-06-12', 7), med: '有吃' }),
      rec({ date: '2026-06-12', sys: 140, dia: 90, pulse: 80, at: at('2026-06-12', 22) }),
      rec({ date: '2026-06-13', sys: 120, dia: 70, pulse: 60, at: at('2026-06-13', 7) }),
    ]
    const report = buildReport(records, '2026-06-11', '2026-06-13')!
    const s = report.stats
    expect(s.dayCount).toBe(2)
    expect(s.readingCount).toBe(3)
    expect(s.avgBp).toBe('130/80')
    expect(s.morning).toEqual({ bp: '125/75', n: 2 })
    expect(s.evening).toEqual({ bp: '140/90', n: 1 })
    expect(s.high).toBe(1)
    expect(s.highPct).toBe(33)
    expect(s.tookDays).toBe(1)
    expect(s.peak.sys).toBe(140)
  })

  it('期間內沒有紀錄回傳 null', () => {
    expect(buildReport([rec({})], '2026-01-01', '2026-01-31')).toBeNull()
  })

  it('時間範圍：近 N 天含今天；自訂範圍起訖顛倒會自動對調', () => {
    const today = new Date(2026, 5, 30)
    expect(rangeFor('7', today)).toEqual({ from: '2026-06-24', to: '2026-06-30' })
    expect(rangeFor('30', today)).toEqual({ from: '2026-06-01', to: '2026-06-30' })
    expect(rangeFor('custom', today, { from: '2026-06-20', to: '2026-06-10' })).toEqual({ from: '2026-06-10', to: '2026-06-20' })
    expect(rangeFor('custom', today, { from: '', to: '2026-06-10' })).toBeNull()
  })
})
