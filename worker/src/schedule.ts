/**
 * Schedule presets and the pure math for when they next fire.
 *
 * A Schedule is stored as JSON on the Rotation. This module validates it and
 * computes the next firing time. It has no database or clock dependencies.
 */
import { z } from 'zod'

export const MAX_INTERVAL_WEEKS = 52
// Enough days to find a match for any preset, including every 52 weeks.
const SEARCH_DAYS = 400
const DAY_MS = 86_400_000

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const ScheduleSchema = z
  .object({
    kind: z.enum(['daily', 'weekdays', 'weekly', 'every_n_weeks', 'monthly']),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM'),
    tz: z.string().refine(isValidTimeZone, { message: 'unknown timezone' }),
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    interval_weeks: z.number().int().min(1).max(MAX_INTERVAL_WEEKS).nullable().optional(),
    anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'anchor must be YYYY-MM-DD').nullable().optional(),
    day_of_month: z.number().int().min(1).max(31).nullable().optional(),
  })
  .superRefine((s, ctx) => {
    if ((s.kind === 'weekly' || s.kind === 'every_n_weeks') && s.weekday == null)
      ctx.addIssue({ code: 'custom', message: `${s.kind} requires weekday` })
    if (s.kind === 'every_n_weeks') {
      if (s.interval_weeks == null) ctx.addIssue({ code: 'custom', message: 'every_n_weeks requires interval_weeks' })
      if (s.anchor == null) ctx.addIssue({ code: 'custom', message: 'every_n_weeks requires anchor' })
    }
    if (s.kind === 'monthly' && s.day_of_month == null)
      ctx.addIssue({ code: 'custom', message: 'monthly requires day_of_month' })
  })

export type Schedule = z.infer<typeof ScheduleSchema>

/** Parse and validate a stored or submitted schedule. Throws on bad input. */
export function parseSchedule(input: unknown): Schedule {
  const r = ScheduleSchema.safeParse(input)
  if (!r.success) throw new Error(r.error.issues.map((i) => i.message).join('; '))
  return r.data
}

/** Normalized JSON shape with every optional field present, matching the old API. */
export function scheduleJson(s: Schedule): Record<string, unknown> {
  return {
    kind: s.kind,
    time: s.time,
    tz: s.tz,
    weekday: s.weekday ?? null,
    interval_weeks: s.interval_weeks ?? null,
    anchor: s.anchor ?? null,
    day_of_month: s.day_of_month ?? null,
  }
}

// --- calendar helpers (dates are UTC-midnight Date objects used as plain dates) ---

type Parts = { y: number; m: number; d: number; h: number; mi: number }

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    fmtCache.set(tz, f)
  }
  return f
}

/** Wall-clock components of an instant in a zone. */
function wallParts(instantMs: number, tz: string): Parts & { s: number } {
  const out: Record<string, number> = {}
  for (const p of formatter(tz).formatToParts(new Date(instantMs))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return { y: out.year, m: out.month, d: out.day, h: out.hour === 24 ? 0 : out.hour, mi: out.minute, s: out.second }
}

/** Zone offset in ms at an instant (positive east of UTC). */
function offsetAt(instantMs: number, tz: string): number {
  const p = wallParts(instantMs, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(instantMs / 1000) * 1000
}

/** The instant at which a zone's wall clock reads the given components. */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const off1 = offsetAt(guess, tz)
  let result = guess - off1
  const off2 = offsetAt(result, tz)
  if (off2 !== off1) result = guess - off2
  return new Date(result)
}

/** Python-style weekday for a UTC calendar date: Monday = 0. */
const weekdayOf = (date: Date) => (date.getUTCDay() + 6) % 7
const mondayOf = (date: Date) => new Date(date.getTime() - weekdayOf(date) * DAY_MS)
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function matchesDay(s: Schedule, date: Date): boolean {
  switch (s.kind) {
    case 'daily':
      return true
    case 'weekdays':
      return weekdayOf(date) < 5
    case 'weekly':
      return weekdayOf(date) === s.weekday
    case 'every_n_weeks': {
      if (weekdayOf(date) !== s.weekday) return false
      const weeks = Math.floor((mondayOf(date).getTime() - mondayOf(parseDate(s.anchor!)).getTime()) / (7 * DAY_MS))
      return ((weeks % s.interval_weeks!) + s.interval_weeks!) % s.interval_weeks! === 0
    }
    case 'monthly': {
      const last = lastDayOfMonth(date.getUTCFullYear(), date.getUTCMonth() + 1)
      return date.getUTCDate() === Math.min(s.day_of_month!, last)
    }
  }
}

/** First firing strictly after `after`. */
export function nextFire(s: Schedule, after: Date): Date {
  const [hour, minute] = s.time.split(':').map(Number)
  const local = wallParts(after.getTime(), s.tz)
  const start = new Date(Date.UTC(local.y, local.m - 1, local.d))
  for (let offset = 0; offset < SEARCH_DAYS; offset++) {
    const day = new Date(start.getTime() + offset * DAY_MS)
    if (!matchesDay(s, day)) continue
    const candidate = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, minute, s.tz)
    if (candidate.getTime() > after.getTime()) return candidate
  }
  throw new Error('no firing found within search window')
}
