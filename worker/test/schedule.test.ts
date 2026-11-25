import { describe, expect, it } from 'vitest'
import { nextFire, parseSchedule } from '../src/schedule'

const utc = (y: number, m: number, d: number, hh = 0, mm = 0) => new Date(Date.UTC(y, m - 1, d, hh, mm))

describe('nextFire', () => {
  it('daily fires the same day if the time has not passed', () => {
    const s = parseSchedule({ kind: 'daily', time: '09:00', tz: 'UTC' })
    expect(nextFire(s, utc(2026, 11, 24, 8, 59))).toEqual(utc(2026, 11, 24, 9, 0))
  })

  it('daily fires the next day if the time has passed or is equal', () => {
    const s = parseSchedule({ kind: 'daily', time: '09:00', tz: 'UTC' })
    expect(nextFire(s, utc(2026, 11, 24, 9, 0))).toEqual(utc(2026, 11, 25, 9, 0))
  })

  it('weekdays skip the weekend', () => {
    const s = parseSchedule({ kind: 'weekdays', time: '10:00', tz: 'UTC' })
    // 2026-11-27 is a Friday
    expect(nextFire(s, utc(2026, 11, 27, 11, 0))).toEqual(utc(2026, 11, 30, 10, 0))
  })

  it('weekly fires on the chosen weekday', () => {
    const s = parseSchedule({ kind: 'weekly', time: '09:30', tz: 'UTC', weekday: 0 })
    expect(nextFire(s, utc(2026, 11, 24, 0, 0))).toEqual(utc(2026, 11, 30, 9, 30))
  })

  it('every two weeks respects the anchor', () => {
    const s = parseSchedule({ kind: 'every_n_weeks', time: '09:00', tz: 'UTC', weekday: 0, interval_weeks: 2, anchor: '2026-11-23' })
    expect(nextFire(s, utc(2026, 11, 23, 9, 0))).toEqual(utc(2026, 12, 7, 9, 0))
    expect(nextFire(s, utc(2026, 12, 7, 9, 0))).toEqual(utc(2026, 12, 21, 9, 0))
  })

  it('monthly clamps to the end of short months', () => {
    const s = parseSchedule({ kind: 'monthly', time: '08:00', tz: 'UTC', day_of_month: 31 })
    expect(nextFire(s, utc(2027, 2, 1))).toEqual(utc(2027, 2, 28, 8, 0))
    expect(nextFire(s, utc(2027, 2, 28, 8, 0))).toEqual(utc(2027, 3, 31, 8, 0))
  })

  it('converts zone wall time to UTC', () => {
    const s = parseSchedule({ kind: 'daily', time: '09:00', tz: 'America/New_York' })
    // 09:00 New York on 2026-11-24 (EST, UTC-5) is 14:00 UTC
    expect(nextFire(s, utc(2026, 11, 24, 0, 0))).toEqual(utc(2026, 11, 24, 14, 0))
  })

  it('keeps local time across a DST transition', () => {
    const s = parseSchedule({ kind: 'daily', time: '09:00', tz: 'America/New_York' })
    // DST ends 2026-11-01; the day before is EDT (UTC-4), the day after EST (UTC-5)
    expect(nextFire(s, utc(2026, 10, 31, 20, 0))).toEqual(utc(2026, 11, 1, 14, 0))
  })

  it('handles zones east of UTC where the local date is ahead', () => {
    const s = parseSchedule({ kind: 'daily', time: '01:00', tz: 'Asia/Tokyo' })
    // 2026-11-24 23:00 UTC is 2026-11-25 08:00 Tokyo, so the next 01:00 is on the 26th local = 25th 16:00 UTC
    expect(nextFire(s, utc(2026, 11, 24, 23, 0))).toEqual(utc(2026, 11, 25, 16, 0))
  })
})

describe('parseSchedule', () => {
  it('rejects unknown timezones', () => {
    expect(() => parseSchedule({ kind: 'daily', time: '09:00', tz: 'Mars/Olympus' })).toThrow(/timezone/)
  })
  it('rejects a weekly schedule without a weekday', () => {
    expect(() => parseSchedule({ kind: 'weekly', time: '09:00', tz: 'UTC' })).toThrow(/weekday/)
  })
  it('rejects bad times', () => {
    expect(() => parseSchedule({ kind: 'daily', time: '25:00', tz: 'UTC' })).toThrow()
  })
})
