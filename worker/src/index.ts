import { Hono } from 'hono'
import { z } from 'zod'
import type { AuditEntry, Rotation } from './db'
import { createLimit, ttlDays, type Env } from './env'
import * as service from './service'
import { ServiceError } from './service'
import { ScheduleSchema } from './schedule'
import { deliver } from './webhook'

export { RotationObject } from './rotation-object'

type Vars = { actor: string }
const app = new Hono<{ Bindings: Env; Variables: Vars }>()

// --- schemas ----------------------------------------------------------------

const CreateIn = z.object({ name: z.string().min(1).max(200), members: z.array(z.string()).max(500).default([]) })
const NameIn = z.object({ name: z.string().min(1).max(200) })
const MembersIn = z.object({ members: z.array(z.string()).max(500) })
const PausedIn = z.object({ paused: z.boolean() })
const WebhookIn = z.object({ url: z.string().min(1).max(2000) })
const RegenerateIn = z.object({ which: z.enum(['edit', 'view']) })
const DeleteIn = z.object({ confirm_name: z.string() })

async function body<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new ServiceError(422, 'Request body must be JSON.')
  }
  const r = schema.safeParse(raw)
  if (!r.success) throw new ServiceError(422, r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
  return r.data
}

// --- serialization ----------------------------------------------------------

const iso = (d: Date | null) => (d ? d.toISOString() : null)

function state(env: Env, r: Rotation, canEdit: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: r.name,
    members: r.members,
    current: r.members[0] ?? null,
    random_picked: r.randomPicked,
    can_edit: canEdit,
    view_token: r.viewToken,
    schedule: r.schedule,
    schedule_paused: r.schedulePaused,
    next_fire_at: iso(r.nextFireAt),
    has_webhook: r.webhookUrl !== null,
    version: r.version,
    created_at: r.createdAt.toISOString(),
    expires_at: service.expiresAt(env, r).toISOString(),
    ttl_days: ttlDays(env),
  }
  if (canEdit) {
    out.edit_token = r.editToken
    out.webhook_url = r.webhookUrl
  }
  return out
}

const auditJson = (e: AuditEntry) => ({ id: e.id, at: e.at.toISOString(), actor: e.actor, kind: e.kind, detail: e.detail })

// --- middleware -------------------------------------------------------------

app.use('*', async (c, next) => {
  c.set('actor', service.cleanActor(c.req.header('X-Display-Name')))
  await next()
})

app.onError((err, c) => {
  if (err instanceof ServiceError) return c.json({ detail: err.message }, err.status as 400)
  console.error(err)
  return c.json({ detail: 'Internal error.' }, 500)
})

app.notFound((c) => c.json({ detail: 'Not found.' }, 404))

const clientIp = (c: { req: { header: (n: string) => string | undefined } }) =>
  c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0].trim() ?? 'unknown'

// --- routes -----------------------------------------------------------------

app.get('/health', (c) => c.json({ status: 'ok' }))

app.post('/api/rotations', async (c) => {
  const input = await body(c, CreateIn)
  await service.enforceCreateLimit(c.env, clientIp(c), createLimit(c.env))
  const r = await service.createRotation(c.env, input.name, input.members, c.get('actor'))
  return c.json(state(c.env, r, true), 201)
})

app.get('/api/r/:token', async (c) => {
  const { rotation, canEdit } = await service.resolve(c.env, c.req.param('token'))
  await service.touch(c.env, rotation)
  return c.json(state(c.env, rotation, canEdit))
})

app.get('/api/r/:token/audit', async (c) => {
  const { rotation } = await service.resolve(c.env, c.req.param('token'))
  const beforeRaw = c.req.query('before')
  const before = beforeRaw ? Number(beforeRaw) : null
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50) || 50))
  const entries = await service.auditPage(c.env, rotation, Number.isFinite(before) ? before : null, limit)
  return c.json({ entries: entries.map(auditJson), has_more: entries.length === limit })
})

/** Live updates. The Worker checks the token, then hands the socket to the Rotation's Durable Object. */
app.get('/api/r/:token/ws', async (c) => {
  const { rotation } = await service.resolve(c.env, c.req.param('token'))
  if (c.req.header('Upgrade') !== 'websocket') return c.json({ detail: 'Expected a WebSocket upgrade.' }, 426)
  const stub = c.env.ROTATION.get(c.env.ROTATION.idFromName(rotation.id))
  const url = new URL(c.req.url)
  url.searchParams.set('version', String(rotation.version))
  return stub.fetch(new Request(url, c.req.raw))
})

/** Routes below need the edit token. */
const edit = new Hono<{ Bindings: Env; Variables: Vars & { rotation: Rotation } }>()
edit.use('*', async (c, next) => {
  c.set('rotation', await service.resolveEdit(c.env, c.req.param('token')!))
  await next()
})

edit.patch('/', async (c) => {
  const { name } = await body(c, NameIn)
  const r = c.get('rotation')
  await service.rename(c.env, r, name, c.get('actor'))
  return c.json(state(c.env, r, true))
})

edit.post('/delete', async (c) => {
  const { confirm_name } = await body(c, DeleteIn)
  await service.deleteRotation(c.env, c.get('rotation'), confirm_name)
  return c.body(null, 204)
})

edit.post('/regenerate', async (c) => {
  const { which } = await body(c, RegenerateIn)
  const r = c.get('rotation')
  await service.regenerateToken(c.env, r, which, c.get('actor'))
  return c.json(state(c.env, r, true))
})

edit.post('/members', async (c) => {
  const { name } = await body(c, NameIn)
  const r = c.get('rotation')
  await service.addMember(c.env, r, name, c.get('actor'))
  return c.json(state(c.env, r, true))
})

edit.delete('/members/:name', async (c) => {
  const r = c.get('rotation')
  await service.removeMember(c.env, r, c.req.param('name'), c.get('actor'))
  return c.json(state(c.env, r, true))
})

edit.put('/members', async (c) => {
  const { members } = await body(c, MembersIn)
  const r = c.get('rotation')
  await service.reorderMembers(c.env, r, members, c.get('actor'))
  return c.json(state(c.env, r, true))
})

edit.post('/advance', async (c) => {
  const r = c.get('rotation')
  const n = await service.advance(c.env, r, c.get('actor'))
  c.executionCtx.waitUntil(deliver(c.env, n))
  return c.json(state(c.env, r, true))
})

edit.post('/bump', async (c) => {
  const r = c.get('rotation')
  const n = await service.bump(c.env, r, c.get('actor'))
  c.executionCtx.waitUntil(deliver(c.env, n))
  return c.json(state(c.env, r, true))
})

edit.post('/random', async (c) => {
  const r = c.get('rotation')
  const member = await service.randomPick(c.env, r, c.get('actor'))
  return c.json({ member, ...state(c.env, r, true) })
})

edit.put('/schedule', async (c) => {
  const schedule = await body(c, ScheduleSchema)
  const r = c.get('rotation')
  await service.setSchedule(c.env, r, schedule, c.get('actor'))
  return c.json(state(c.env, r, true))
})

edit.delete('/schedule', async (c) => {
  const r = c.get('rotation')
  await service.clearSchedule(c.env, r, c.get('actor'))
  return c.json(state(c.env, r, true))
})

edit.post('/schedule/paused', async (c) => {
  const { paused } = await body(c, PausedIn)
  const r = c.get('rotation')
  await service.setPaused(c.env, r, paused, c.get('actor'))
  return c.json(state(c.env, r, true))
})

edit.put('/webhook', async (c) => {
  const { url } = await body(c, WebhookIn)
  const r = c.get('rotation')
  await service.setWebhook(c.env, r, url, c.get('actor'))
  return c.json(state(c.env, r, true))
})

edit.delete('/webhook', async (c) => {
  const r = c.get('rotation')
  await service.clearWebhook(c.env, r, c.get('actor'))
  return c.json(state(c.env, r, true))
})

app.route('/api/r/:token', edit)

// --- cron -------------------------------------------------------------------

async function scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  const now = new Date()
  ctx.waitUntil(
    (async () => {
      const n = await service.deleteExpired(env, now)
      if (n) console.log(`deleted ${n} expired rotation(s)`)
      await service.pruneCreations(env, now)
    })(),
  )
}

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>
