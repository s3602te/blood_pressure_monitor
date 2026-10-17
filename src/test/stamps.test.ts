import { describe, expect, it } from 'vitest'
import { computeStreak, stampCard, stampMessage, type StampItem } from '../lib/stamps'

const at = (date: string, h = 8) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, h).getTime()
}
const item = (date: string, h = 8): StampItem => ({ date, at: at(date, h) })
const days = (...dates: string[]) => dates.map((d) => item(d))
const today = new Date(2026, 9, 17) // 2026-10-17

describe('連續簽到', () => {
  it('今天有記錄：從今天往回數連續幾天', () => {
    const s = computeStreak(days('2026-10-15', '2026-10-16', '2026-10-17'), today)
    expect(s).toMatchObject({ current: 3, best: 3, total: 3, recordedToday: true })
  })

  it('今天還沒記錄、昨天有：連續還在（今天記錄就接著算）', () => {
    const s = computeStreak(days('2026-10-15', '2026-10-16'), today)
    expect(s).toMatchObject({ current: 2, recordedToday: false })
  })

  it('昨天和今天都沒記錄：目前連續歸零，但最長紀錄還在', () => {
    const s = computeStreak(days('2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'), today)
    expect(s).toMatchObject({ current: 0, best: 4, total: 4 })
  })

  it('中間斷了一天：重新算，歷史最長取較長的那段', () => {
    const s = computeStreak(days('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-16', '2026-10-17'), today)
    expect(s).toMatchObject({ current: 2, best: 4, total: 6 })
  })

  it('同一天記錄好幾次只算一天；順序亂也沒關係', () => {
    const s = computeStreak([item('2026-10-17', 22), item('2026-10-16'), item('2026-10-17', 7), item('2026-10-15')], today)
    expect(s).toMatchObject({ current: 3, total: 3 })
  })

  it('跨月、跨年也連得起來', () => {
    const jan = new Date(2027, 0, 2)
    expect(computeStreak(days('2026-12-31', '2027-01-01', '2027-01-02'), jan).current).toBe(3)
    expect(computeStreak(days('2026-02-28', '2026-03-01'), new Date(2026, 2, 1)).current).toBe(2) // 2026 年 2 月沒有 29 日，28 日和 3/1 是連續的
    expect(computeStreak(days('2028-02-28', '2028-03-01'), new Date(2028, 2, 1)).current).toBe(1) // 2028 是閏年，中間隔了 2/29
  })

  it('一筆紀錄都沒有', () => {
    expect(computeStreak([], today)).toEqual({ current: 0, best: 0, total: 0, recordedToday: false })
  })
})

describe('蓋章卡', () => {
  const items = [
    item('2026-10-12'),
    item('2026-10-13'),
    item('2026-10-14'),
    item('2026-10-15', 7),
    item('2026-10-15', 22), // 這天早晚都量
    item('2026-10-16'),
  ]
  const card = stampCard(items, today)

  it('最近 7 天，最後一個是今天；有記錄的那天蓋章', () => {
    expect(card.week).toHaveLength(7)
    expect(card.week[6]).toMatchObject({ iso: '2026-10-17', isToday: true, stamped: false })
    expect(card.week.map((d) => d.stamped)).toEqual([false, true, true, true, true, true, false])
  })

  it('早上和晚上都量的那天多一顆星', () => {
    expect(card.week.filter((d) => d.star).map((d) => d.iso)).toEqual(['2026-10-15'])
  })

  it('得到的章是「最長連續」達到的門檻；下一個目標是還沒達到的最近一個', () => {
    expect(card.streak.current).toBe(5)
    expect(card.earned.map((m) => m.days)).toEqual([3])
    expect(card.next).toMatchObject({ daysLeft: 2, milestone: { days: 7 } })
  })

  it('中斷後得過的章不會消失', () => {
    const c = stampCard(days('2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07'), today)
    expect(c.streak.current).toBe(0)
    expect(c.earned.map((m) => m.days)).toEqual([3, 7])
    expect(c.next?.milestone.days).toBe(3) // 重新開始，目標又從第一個章算起
  })

  it('全部的章都拿到了，沒有下一個目標', () => {
    const many = Array.from({ length: 365 }, (_, i) => {
      const d = new Date(2026, 9, 17 - i)
      return item(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    })
    const c = stampCard(many, today)
    expect(c.streak.current).toBe(365)
    expect(c.next).toBeNull()
  })
})

describe('儲存後的鼓勵話', () => {
  const t = (iso: string, h: number) => ({ date: iso, at: at(iso, h) })

  it('第一次蓋章：從今天開始連續記錄', () => {
    expect(stampMessage([], t('2026-10-17', 8), today)).toEqual(['蓋章完成！從今天開始連續記錄'])
  })

  it('接在昨天後面：蓋章完成，連續 N 天', () => {
    expect(stampMessage(days('2026-10-16'), t('2026-10-17', 8), today)).toEqual(['蓋章完成！連續 2 天'])
  })

  it('剛好達到門檻：多一句得到新的章', () => {
    const lines = stampMessage(days('2026-10-15', '2026-10-16'), t('2026-10-17', 8), today)
    expect(lines).toEqual(['蓋章完成！連續 3 天', '得到新的章：「3 天小章」！'])
  })

  it('同一天第二次記錄、而且還是同一個時段：不重複慶祝', () => {
    expect(stampMessage([t('2026-10-17', 7)], t('2026-10-17', 9), today)).toEqual([])
  })

  it('同一天早上量過、晚上又量：多得一顆星', () => {
    expect(stampMessage([t('2026-10-17', 7)], t('2026-10-17', 22), today)).toEqual(['今天早晚都量了，多得一顆星！'])
  })

  it('補記以前的日子：說「這一天的章蓋好了」，不會亂算連續天數', () => {
    expect(stampMessage(days('2026-10-17'), t('2026-10-10', 8), today)).toEqual(['這一天的章蓋好了'])
  })

  it('補記讓連續天數跳起來時，也算慶祝', () => {
    // 10/14、10/16、10/17；補記 10/15 → 連續從 2 天變成 4 天
    const lines = stampMessage(days('2026-10-14', '2026-10-16', '2026-10-17'), t('2026-10-15', 8), today)
    expect(lines).toContain('蓋章完成！連續 4 天')
    expect(lines).toContain('得到新的章：「3 天小章」！')
  })
})
