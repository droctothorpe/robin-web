/**
 * An in-memory stand-in for the server, used by the sample rotation on /demo.
 * It implements the same surface as `api` against state that lives only in
 * this tab, so visitors can click everything without touching real data.
 */
import { ApiError, type AuditEntry, type RotationState, type Schedule } from '../api'
import type { RotationApi } from '../apiContext'
import { localTimeZone } from '../lib/format'

export const SAMPLE_EDIT_TOKEN = 'sample-edit-link'
export const SAMPLE_VIEW_TOKEN = 'sample-view-link'
const TTL_DAYS = 180
const DAY_MS = 86_400_000

const squash = (s: string) => s.split(/\s+/).filter(Boolean).join(' ')
const fold = (s: string) => s.toLocaleLowerCase()
const delay = <T,>(v: T) => new Promise<T>((resolve) => setTimeout(() => resolve(v), 120))

/** Next firing in the browser's local time. Close enough for a sample. */
function nextFireLocal(s: Schedule, after: Date): Date {
  const [h, m] = s.time.split(':').map(Number)
  const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
  const matches = (d: Date): boolean => {
    const weekday = (d.getDay() + 6) % 7
    switch (s.kind) {
      case 'daily':
        return true
      case 'weekdays':
        return weekday < 5
      case 'weekly':
        return weekday === s.weekday
      case 'every_n_weeks': {
        if (weekday !== s.weekday || !s.anchor || !s.interval_weeks) return false
        const [ay, am, ad] = s.anchor.split('-').map(Number)
        const weeks = Math.round((mondayOf(d).getTime() - mondayOf(new Date(ay, am - 1, ad)).getTime()) / (7 * DAY_MS))
        return ((weeks % s.interval_weeks) + s.interval_weeks) % s.interval_weeks === 0
      }
      case 'monthly': {
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
        return d.getDate() === Math.min(s.day_of_month ?? 1, last)
      }
    }
  }
  for (let offset = 0; offset < 400; offset++) {
    const d = new Date(after.getFullYear(), after.getMonth(), after.getDate() + offset, h, m)
    if (matches(d) && d.getTime() > after.getTime()) return d
  }
  return new Date(after.getTime() + DAY_MS)
}

export function createSandbox(canEdit: boolean): { api: RotationApi; initial: RotationState } {
  const now = Date.now()
  const ago = (days: number, hours = 0) => new Date(now - days * DAY_MS - hours * 3_600_000).toISOString()

  let name = 'Standup lead'
  let members = ['Priya', 'Dana', 'Lee', 'Alex', 'Sam']
  let randomPicked: string[] = []
  let version = 5
  let schedule: Schedule | null = {
    kind: 'weekdays',
    time: '09:30',
    tz: localTimeZone(),
    weekday: null,
    interval_weeks: null,
    anchor: null,
    day_of_month: null,
  }
  let paused = false
  let nextFireAt: string | null = nextFireLocal(schedule, new Date()).toISOString()
  let webhookUrl: string | null = null
  const createdAt = ago(23)
  let lastVisited = new Date(now).toISOString()

  // Newest first, like the server returns them.
  const audit: AuditEntry[] = [
    { id: 5, at: ago(9, 3), actor: 'Schedule', kind: 'advanced', detail: { from: 'Sam', to: 'Priya', trigger: 'schedule' } },
    { id: 4, at: ago(12, 1), actor: 'Alex', kind: 'schedule_set', detail: { schedule, next_fire_at: ago(9, 3) } },
    { id: 3, at: ago(16, 5), actor: 'Alex', kind: 'advanced', detail: { from: 'Alex', to: 'Sam', trigger: 'manual' } },
    { id: 2, at: ago(20, 2), actor: 'Sam', kind: 'member_added', detail: { member: 'Lee' } },
    { id: 1, at: createdAt, actor: 'Alex', kind: 'created', detail: { name, members: ['Alex', 'Sam', 'Priya', 'Dana'] } },
  ]
  let nextId = 6

  function record(kind: string, actor: string, detail: Record<string, unknown> = {}) {
    audit.unshift({ id: nextId++, at: new Date().toISOString(), actor, kind, detail })
    version += 1
  }

  function state(): RotationState {
    const s: RotationState = {
      name,
      members,
      current: members[0] ?? null,
      random_picked: randomPicked,
      can_edit: canEdit,
      view_token: SAMPLE_VIEW_TOKEN,
      schedule,
      schedule_paused: paused,
      next_fire_at: nextFireAt,
      has_webhook: webhookUrl !== null,
      version,
      created_at: createdAt,
      expires_at: new Date(new Date(lastVisited).getTime() + TTL_DAYS * DAY_MS).toISOString(),
      ttl_days: TTL_DAYS,
    }
    if (canEdit) {
      s.edit_token = SAMPLE_EDIT_TOKEN
      s.webhook_url = webhookUrl
    }
    return s
  }

  const who = (w: string | null | undefined) => squash(w ?? '') || 'Someone'
  const invalid = (m: string) => new ApiError(422, m)
  function mutate<T>(fn: () => T): Promise<T> {
    if (!canEdit) return Promise.reject(new ApiError(403, 'This is a view-only link.'))
    try {
      return delay(fn())
    } catch (e) {
      return Promise.reject(e)
    }
  }
  const find = (n: string) => members.findIndex((m) => fold(m) === fold(n))

  const api: RotationApi = {
    create: () => Promise.reject(new ApiError(400, 'Not available in the sample.')),
    get: () => {
      lastVisited = new Date().toISOString()
      return delay(state())
    },
    audit: (_t, before, limit = 50) => {
      const entries = audit.filter((e) => (before ? e.id < before : true)).slice(0, limit)
      return delay({ entries, has_more: entries.length === limit })
    },
    advance: (_t, w) =>
      mutate(() => {
        if (members.length < 2) throw invalid('Add at least two members before advancing.')
        const from = members[0]
        members = [...members.slice(1), from]
        record('advanced', who(w), { from, to: members[0], trigger: 'manual' })
        return state()
      }),
    bump: (_t, w) =>
      mutate(() => {
        if (members.length < 2) throw invalid('Add at least two members before bumping.')
        const skipped = members[0]
        members = [members[1], members[0], ...members.slice(2)]
        record('bumped', who(w), { skipped, to: members[0] })
        return state()
      }),
    random: (_t, w) =>
      mutate(() => {
        if (members.length === 0) throw invalid('no members to pick from')
        const taken = new Set(randomPicked.map(fold))
        let pool = members.filter((m) => !taken.has(fold(m)))
        let kept = randomPicked
        if (pool.length === 0) {
          pool = members
          kept = []
        }
        const member = pool[Math.floor(Math.random() * pool.length)]
        const live = new Set(members.map(fold))
        randomPicked = [...kept.filter((a) => live.has(fold(a))), member]
        record('random_pick', who(w), { member, remaining_in_round: members.length - randomPicked.length })
        return { member, ...state() }
      }),
    addMember: (_t, raw, w) =>
      mutate(() => {
        const n = squash(raw)
        if (!n) throw invalid('member name is empty')
        if (find(n) !== -1) throw invalid(`${n} is already on this rotation.`)
        members = [...members, n]
        record('member_added', who(w), { member: n })
        return state()
      }),
    removeMember: (_t, n, w) =>
      mutate(() => {
        const idx = find(n)
        if (idx === -1) throw invalid(`${n} is not on this rotation.`)
        const removed = members[idx]
        members = members.filter((_, i) => i !== idx)
        record('member_removed', who(w), { member: removed, position: idx + 1 })
        return state()
      }),
    reorder: (_t, next, w) =>
      mutate(() => {
        const before = members
        members = next.map(squash).filter(Boolean)
        record('members_reordered', who(w), { before, after: members })
        return state()
      }),
    rename: (_t, raw, w) =>
      mutate(() => {
        const n = squash(raw)
        if (!n) throw invalid('Rotation name is empty.')
        if (n !== name) {
          record('renamed', who(w), { from: name, to: n })
          name = n
        }
        return state()
      }),
    setSchedule: (_t, s, w) =>
      mutate(() => {
        schedule = s
        paused = false
        nextFireAt = nextFireLocal(s, new Date()).toISOString()
        record('schedule_set', who(w), { schedule: s, next_fire_at: nextFireAt })
        return state()
      }),
    clearSchedule: (_t, w) =>
      mutate(() => {
        if (schedule) {
          schedule = null
          paused = false
          nextFireAt = null
          record('schedule_cleared', who(w))
        }
        return state()
      }),
    setPaused: (_t, p, w) =>
      mutate(() => {
        if (!schedule) throw invalid('There is no schedule to pause.')
        if (paused !== p) {
          paused = p
          if (!p) nextFireAt = nextFireLocal(schedule, new Date()).toISOString()
          record(p ? 'schedule_paused' : 'schedule_resumed', who(w))
        }
        return state()
      }),
    setWebhook: (_t, raw, w) =>
      mutate(() => {
        let host: string
        try {
          const u = new URL(raw.trim())
          if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error()
          host = u.hostname
        } catch {
          throw invalid('Webhook must be an http(s) URL.')
        }
        webhookUrl = raw.trim()
        record('webhook_set', who(w), { host })
        return state()
      }),
    clearWebhook: (_t, w) =>
      mutate(() => {
        if (webhookUrl !== null) {
          webhookUrl = null
          record('webhook_cleared', who(w))
        }
        return state()
      }),
    // The sample's links never change, so regenerating only leaves a trace in History.
    regenerate: (_t, which, w) =>
      mutate(() => {
        record('token_regenerated', who(w), { which })
        return state()
      }),
    delete: () => mutate(() => undefined),
  }

  return { api, initial: state() }
}
