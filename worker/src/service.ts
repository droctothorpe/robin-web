/**
 * All state changes to a Rotation go through here.
 *
 * Every mutation writes an AuditEntry, bumps the version, saves, and tells the
 * Rotation's Durable Object so open pages refresh. Mutations that change
 * Current return a Notification the caller must deliver.
 */
import * as db from './db'
import type { Rotation } from './db'
import { publicBaseUrl, ttlDays, type Env } from './env'
import * as ops from './ops'
import { nextFire, parseSchedule, scheduleJson, type Schedule } from './schedule'

export const SCHEDULE_ACTOR = 'Schedule'
export const DEFAULT_ACTOR = 'Someone'
const MAX_ACTOR_LEN = 40
const MAX_ROTATION_NAME_LEN = 80

export class ServiceError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
export const notFound = () => new ServiceError(404, 'No rotation at this link.')
export const forbidden = () => new ServiceError(403, 'This is a view-only link.')
export const invalid = (m: string) => new ServiceError(422, m)

export type Notification = { rotationId: string; url: string; payload: Record<string, unknown> }

const squash = (s: string) => s.split(/\s+/).filter(Boolean).join(' ')

// --- lookup -----------------------------------------------------------------

export async function resolve(env: Env, token: string): Promise<{ rotation: Rotation; canEdit: boolean }> {
  const rotation = await db.findByToken(env.DB, token)
  if (!rotation) throw notFound()
  return { rotation, canEdit: rotation.editToken === token }
}

export async function resolveEdit(env: Env, token: string): Promise<Rotation> {
  const { rotation, canEdit } = await resolve(env, token)
  if (!canEdit) throw forbidden()
  return rotation
}

/** Record a visit, which is what keeps a Rotation from expiring. */
export async function touch(env: Env, r: Rotation): Promise<void> {
  r.lastVisitedAt = new Date()
  await db.touchRotation(env.DB, r.id, r.lastVisitedAt).run()
}

export const expiresAt = (env: Env, r: Rotation) => new Date(r.lastVisitedAt.getTime() + ttlDays(env) * 86_400_000)

export function cleanActor(raw: string | null | undefined): string {
  if (raw == null) return DEFAULT_ACTOR
  return squash(raw).slice(0, MAX_ACTOR_LEN) || DEFAULT_ACTOR
}

export function cleanRotationName(raw: string): string {
  const name = squash(raw)
  if (!name) throw invalid('Rotation name is empty.')
  if (name.length > MAX_ROTATION_NAME_LEN) throw invalid(`Rotation name longer than ${MAX_ROTATION_NAME_LEN} characters.`)
  return name
}

// --- internals --------------------------------------------------------------

const stub = (env: Env, id: string) => env.ROTATION.get(env.ROTATION.idFromName(id))

/** Audit, bump version, save, notify. The audit insert and the save are one batch. */
async function commit(env: Env, r: Rotation, kind: string, actor: string, detail: Record<string, unknown> = {}) {
  r.version += 1
  await env.DB.batch([db.insertAudit(env.DB, r.id, kind, actor, detail, new Date()), db.updateRotation(env.DB, r)])
  await stub(env, r.id).broadcast({ version: r.version })
}

function notification(env: Env, r: Rotation, previous: string | null, trigger: string): Notification | null {
  const current = r.members[0] ?? null
  if (!r.webhookUrl || current === null) return null
  const viewUrl = `${publicBaseUrl(env)}/r/${r.viewToken}`
  let text = `*${r.name}*: it's ${current}'s turn`
  if (previous && previous !== current) text += ` (after ${previous})`
  text += `. <${viewUrl}|View rotation>`
  return {
    rotationId: r.id,
    url: r.webhookUrl,
    payload: {
      // Slack incoming webhooks read `text`; Discord reads `content`.
      text,
      content: `${r.name}: it's ${current}'s turn. ${viewUrl}`,
      rotation: r.name,
      current,
      previous,
      trigger,
      view_url: viewUrl,
    },
  }
}

const wrap = <T>(fn: () => T): T => {
  try {
    return fn()
  } catch (e) {
    throw invalid((e as Error).message)
  }
}

// --- lifecycle --------------------------------------------------------------

export async function createRotation(env: Env, name: string, members: string[], actor: string): Promise<Rotation> {
  const cleanName = cleanRotationName(name)
  const cleanMembers = wrap(() => ops.dedupe(members))
  const now = new Date()
  const r: Rotation = {
    id: crypto.randomUUID(),
    name: cleanName,
    editToken: ops.newToken(),
    viewToken: ops.newToken(),
    members: cleanMembers,
    randomPicked: [],
    webhookUrl: null,
    schedule: null,
    schedulePaused: false,
    nextFireAt: null,
    version: 1,
    createdAt: now,
    lastVisitedAt: now,
  }
  await env.DB.batch([
    db.insertRotation(env.DB, r),
    db.insertAudit(env.DB, r.id, 'created', actor, { name: cleanName, members: cleanMembers }, now),
  ])
  return r
}

export async function rename(env: Env, r: Rotation, name: string, actor: string): Promise<void> {
  const clean = cleanRotationName(name)
  if (clean === r.name) return
  const from = r.name
  r.name = clean
  await commit(env, r, 'renamed', actor, { from, to: clean })
}

export async function deleteRotation(env: Env, r: Rotation, confirmName: string): Promise<void> {
  if (squash(confirmName).toLocaleLowerCase() !== r.name.toLocaleLowerCase())
    throw invalid("Type the rotation's name exactly to delete it.")
  await env.DB.batch(db.deleteRotation(env.DB, r.id))
  const s = stub(env, r.id)
  await s.disarm()
  await s.broadcast({ deleted: true })
}

export async function regenerateToken(env: Env, r: Rotation, which: string, actor: string): Promise<void> {
  if (which === 'edit') r.editToken = ops.newToken()
  else if (which === 'view') r.viewToken = ops.newToken()
  else throw invalid("which must be 'edit' or 'view'.")
  await commit(env, r, 'token_regenerated', actor, { which })
}

// --- members ----------------------------------------------------------------

export async function addMember(env: Env, r: Rotation, name: string, actor: string): Promise<void> {
  const clean = wrap(() => ops.normalizeName(name))
  if (ops.find(r.members, clean) !== -1) throw invalid(`${clean} is already on this rotation.`)
  if (r.members.length >= ops.MAX_MEMBERS) throw invalid(`A rotation holds at most ${ops.MAX_MEMBERS} members.`)
  r.members = [...r.members, clean]
  await commit(env, r, 'member_added', actor, { member: clean })
}

export async function removeMember(env: Env, r: Rotation, name: string, actor: string): Promise<void> {
  const idx = ops.find(r.members, name)
  if (idx === -1) throw invalid(`${name} is not on this rotation.`)
  const removed = r.members[idx]
  r.members = r.members.filter((_, i) => i !== idx)
  await commit(env, r, 'member_removed', actor, { member: removed, position: idx + 1 })
}

export async function reorderMembers(env: Env, r: Rotation, members: string[], actor: string): Promise<void> {
  const clean = wrap(() => ops.dedupe(members))
  if (!ops.sameSet(clean, r.members)) throw invalid('Reorder must contain exactly the current members.')
  if (clean.every((m, i) => m === r.members[i])) return
  const before = r.members
  r.members = clean
  await commit(env, r, 'members_reordered', actor, { before, after: clean })
}

// --- turns ------------------------------------------------------------------

export async function advance(env: Env, r: Rotation, actor: string, trigger = 'manual'): Promise<Notification | null> {
  if (r.members.length < 2) throw invalid('Add at least two members before advancing.')
  const before = r.members
  r.members = ops.advance(before)
  await commit(env, r, 'advanced', actor, { from: before[0], to: r.members[0], trigger })
  return notification(env, r, before[0], trigger)
}

export async function bump(env: Env, r: Rotation, actor: string): Promise<Notification | null> {
  if (r.members.length < 2) throw invalid('Add at least two members before bumping.')
  const before = r.members
  r.members = ops.bump(before)
  await commit(env, r, 'bumped', actor, { skipped: before[0], to: r.members[0] })
  return notification(env, r, before[0], 'bump')
}

export async function randomPick(env: Env, r: Rotation, actor: string): Promise<string> {
  const { picked, already } = wrap(() => ops.randomPick(r.members, r.randomPicked))
  r.randomPicked = already
  const remaining = r.members.length - already.length
  await commit(env, r, 'random_pick', actor, { member: picked, remaining_in_round: remaining })
  return picked
}

// --- schedule ---------------------------------------------------------------

async function arm(env: Env, r: Rotation): Promise<void> {
  const s = stub(env, r.id)
  if (r.nextFireAt && !r.schedulePaused) await s.arm(r.id, r.nextFireAt.getTime())
  else await s.disarm()
}

export async function setSchedule(env: Env, r: Rotation, schedule: Schedule, actor: string): Promise<void> {
  r.schedule = scheduleJson(schedule) as unknown as Schedule
  r.schedulePaused = false
  r.nextFireAt = nextFire(schedule, new Date())
  await commit(env, r, 'schedule_set', actor, { schedule: r.schedule, next_fire_at: r.nextFireAt.toISOString() })
  await arm(env, r)
}

export async function clearSchedule(env: Env, r: Rotation, actor: string): Promise<void> {
  if (r.schedule === null) return
  r.schedule = null
  r.schedulePaused = false
  r.nextFireAt = null
  await commit(env, r, 'schedule_cleared', actor)
  await arm(env, r)
}

export async function setPaused(env: Env, r: Rotation, paused: boolean, actor: string): Promise<void> {
  if (r.schedule === null) throw invalid('There is no schedule to pause.')
  if (r.schedulePaused === paused) return
  r.schedulePaused = paused
  // Resuming never fires immediately for windows missed while paused.
  if (!paused) r.nextFireAt = nextFire(parseSchedule(r.schedule), new Date())
  await commit(env, r, paused ? 'schedule_paused' : 'schedule_resumed', actor)
  await arm(env, r)
}

/**
 * Run by the Rotation's alarm. Advances once if the schedule is due, then arms
 * the next firing from `now`. Never advances more than once per call however
 * late the alarm is.
 */
export async function fireSchedule(env: Env, rotationId: string, now: Date): Promise<Notification | null> {
  const r = await db.getById(env.DB, rotationId)
  if (!r || r.schedule === null || r.schedulePaused) return null
  if (r.nextFireAt && r.nextFireAt.getTime() > now.getTime() + 1000) {
    // Woken early; go back to sleep until the real time.
    await arm(env, r)
    return null
  }
  const schedule = parseSchedule(r.schedule)
  r.nextFireAt = nextFire(schedule, now)
  let n: Notification | null = null
  if (r.members.length < 2) {
    await db.updateRotation(env.DB, r).run()
  } else {
    n = await advance(env, r, SCHEDULE_ACTOR, 'schedule')
  }
  await arm(env, r)
  return n
}

// --- webhook ----------------------------------------------------------------

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal'])

function isPrivateIp(host: string): boolean {
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    )
  }
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h.includes(':')) return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')
  return false
}

export function validateWebhookUrl(raw: string): string {
  const url = raw.trim()
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw invalid('Webhook must be an http(s) URL.')
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname)
    throw invalid('Webhook must be an http(s) URL.')
  const host = parsed.hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.internal') || host.endsWith('.local') || isPrivateIp(host))
    throw invalid('Webhook host is not allowed.')
  if (url.length > 2000) throw invalid('Webhook URL is too long.')
  return url
}

export async function setWebhook(env: Env, r: Rotation, rawUrl: string, actor: string): Promise<void> {
  const url = validateWebhookUrl(rawUrl)
  if (url === r.webhookUrl) return
  r.webhookUrl = url
  await commit(env, r, 'webhook_set', actor, { host: new URL(url).hostname })
}

export async function clearWebhook(env: Env, r: Rotation, actor: string): Promise<void> {
  if (r.webhookUrl === null) return
  r.webhookUrl = null
  await commit(env, r, 'webhook_cleared', actor)
}

export async function recordWebhookFailure(env: Env, rotationId: string, reason: string): Promise<void> {
  const r = await db.getById(env.DB, rotationId)
  if (!r) return
  await commit(env, r, 'webhook_failed', 'Robin', { reason })
}

// --- expiry and housekeeping ------------------------------------------------

export async function deleteExpired(env: Env, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - ttlDays(env) * 86_400_000)
  const ids = await db.expiredIds(env.DB, cutoff)
  for (const id of ids) {
    await env.DB.batch(db.deleteRotation(env.DB, id))
    await stub(env, id).disarm()
  }
  return ids.length
}

export async function pruneCreations(env: Env, now: Date): Promise<void> {
  await db.pruneCreations(env.DB, new Date(now.getTime() - 3_600_000)).run()
}

// --- rate limiting ----------------------------------------------------------

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Throws 429 if this IP has hit the hourly creation limit; otherwise records the creation. */
export async function enforceCreateLimit(env: Env, ip: string, limit: number): Promise<void> {
  const hash = await sha256(ip)
  const now = new Date()
  const n = await db.creationsSince(env.DB, hash, new Date(now.getTime() - 3_600_000))
  if (n >= limit) throw new ServiceError(429, 'Too many rotations created from this address. Try again later.')
  await db.recordCreation(env.DB, hash, now).run()
}

// --- audit ------------------------------------------------------------------

export const auditPage = (env: Env, r: Rotation, before: number | null, limit: number) =>
  db.auditPage(env.DB, r.id, before, limit)
