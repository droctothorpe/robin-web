import type { AuditEntry, Schedule } from '../api'

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export function describeSchedule(s: Schedule): string {
  const at = `at ${s.time} (${s.tz})`
  switch (s.kind) {
    case 'daily':
      return `Every day ${at}`
    case 'weekdays':
      return `Every weekday ${at}`
    case 'weekly':
      return `Every ${WEEKDAYS[s.weekday ?? 0]} ${at}`
    case 'every_n_weeks':
      return `Every ${s.interval_weeks} weeks on ${WEEKDAYS[s.weekday ?? 0]} ${at}`
    case 'monthly':
      return `Monthly on the ${ordinal(s.day_of_month ?? 1)} ${at}`
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

export function describeAudit(e: AuditEntry): string {
  const d = e.detail
  switch (e.kind) {
    case 'created':
      return `created the rotation with ${Array.isArray(d.members) ? d.members.length : 0} member(s)`
    case 'renamed':
      return `renamed “${str(d.from)}” to “${str(d.to)}”`
    case 'member_added':
      return `added ${str(d.member)}`
    case 'member_removed':
      return `removed ${str(d.member)}`
    case 'members_reordered': {
      const after = Array.isArray(d.after) ? (d.after as string[]) : []
      return `reordered the list (now ${after.join(', ')})`
    }
    case 'advanced':
      return d.trigger === 'schedule'
        ? `advanced on schedule: ${str(d.from)} → ${str(d.to)}`
        : `advanced: ${str(d.from)} → ${str(d.to)}`
    case 'bumped':
      return `bumped ${str(d.skipped)}; ${str(d.to)} is up`
    case 'undone':
      return `undid the last ${d.of === 'bumped' ? 'skip' : 'advance'}: ${str(d.from)} → ${str(d.to)}`
    case 'random_pick':
      return `randomly picked ${str(d.member)}`
    case 'schedule_set': {
      const s = d.schedule as Schedule | undefined
      return s ? `set the schedule: ${describeSchedule(s)}` : 'set the schedule'
    }
    case 'schedule_cleared':
      return 'removed the schedule'
    case 'schedule_paused':
      return 'paused the schedule'
    case 'schedule_resumed':
      return 'resumed the schedule'
    case 'webhook_set':
      return `set a webhook to ${str(d.host)}`
    case 'webhook_cleared':
      return 'removed the webhook'
    case 'webhook_failed':
      return `webhook delivery failed (${str(d.reason)})`
    case 'token_regenerated':
      return `regenerated the ${str(d.which)} link`
    default:
      return e.kind.replace(/_/g, ' ')
  }
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = (new Date(iso).getTime() - now.getTime()) / 1000
  const abs = Math.abs(diff)
  const future = diff > 0
  const fmt = (n: number, unit: string) => {
    const v = Math.round(n)
    const s = `${v} ${unit}${v === 1 ? '' : 's'}`
    return future ? `in ${s}` : `${s} ago`
  }
  if (abs < 45) return future ? 'in a moment' : 'just now'
  if (abs < 3600) return fmt(abs / 60, 'minute')
  if (abs < 86400) return fmt(abs / 3600, 'hour')
  if (abs < 86400 * 30) return fmt(abs / 86400, 'day')
  return fmt(abs / (86400 * 30), 'month')
}

export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.floor((new Date(iso).getTime() - now.getTime()) / 86400000)
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function timeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  try {
    const zones = intl.supportedValuesOf?.('timeZone') ?? []
    return zones.length ? ['UTC', ...zones.filter((z) => z !== 'UTC')] : ['UTC']
  } catch {
    return ['UTC']
  }
}

export function parseMembers(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
