import { describe, expect, it } from 'vitest'
import { daysUntil, describeAudit, describeSchedule, ordinal, parseMembers, relativeTime } from './format'

describe('describeSchedule', () => {
  it('describes each preset', () => {
    expect(describeSchedule({ kind: 'daily', time: '09:00', tz: 'UTC' })).toBe('Every day at 09:00 (UTC)')
    expect(describeSchedule({ kind: 'weekdays', time: '09:00', tz: 'UTC' })).toBe('Every weekday at 09:00 (UTC)')
    expect(describeSchedule({ kind: 'weekly', time: '09:00', tz: 'UTC', weekday: 2 })).toBe(
      'Every Wednesday at 09:00 (UTC)',
    )
    expect(
      describeSchedule({ kind: 'every_n_weeks', time: '09:00', tz: 'UTC', weekday: 0, interval_weeks: 2 }),
    ).toBe('Every 2 weeks on Monday at 09:00 (UTC)')
    expect(describeSchedule({ kind: 'monthly', time: '08:00', tz: 'UTC', day_of_month: 31 })).toBe(
      'Monthly on the 31st at 08:00 (UTC)',
    )
  })
})

describe('ordinal', () => {
  it('handles the awkward teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd',
    ])
  })
})

describe('describeAudit', () => {
  const base = { id: 1, at: '2026-11-24T00:00:00Z', actor: 'Alex' }
  it('reads as a sentence fragment after the actor', () => {
    expect(describeAudit({ ...base, kind: 'advanced', detail: { from: 'A', to: 'B', trigger: 'manual' } })).toBe(
      'advanced: A → B',
    )
    expect(describeAudit({ ...base, kind: 'advanced', detail: { from: 'A', to: 'B', trigger: 'schedule' } })).toBe(
      'advanced on schedule: A → B',
    )
    expect(describeAudit({ ...base, kind: 'bumped', detail: { skipped: 'A', to: 'B' } })).toBe('bumped A; B is up')
    expect(describeAudit({ ...base, kind: 'webhook_failed', detail: { reason: 'HTTP 404' } })).toBe(
      'webhook delivery failed (HTTP 404)',
    )
    expect(describeAudit({ ...base, kind: 'something_new', detail: {} })).toBe('something new')
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-11-24T12:00:00Z')
  it('covers past and future', () => {
    expect(relativeTime('2026-11-24T11:59:50Z', now)).toBe('just now')
    expect(relativeTime('2026-11-24T11:30:00Z', now)).toBe('30 minutes ago')
    expect(relativeTime('2026-11-24T13:00:00Z', now)).toBe('in 1 hour')
    expect(relativeTime('2026-11-20T12:00:00Z', now)).toBe('4 days ago')
  })
})

describe('daysUntil', () => {
  it('floors', () => {
    expect(daysUntil('2026-11-26T11:00:00Z', new Date('2026-11-24T12:00:00Z'))).toBe(1)
  })
})

describe('parseMembers', () => {
  it('splits on newlines and commas', () => {
    expect(parseMembers('Alex, Sam\nPriya\n\n ,Dana ')).toEqual(['Alex', 'Sam', 'Priya', 'Dana'])
  })
})
