import { env, runDurableObjectAlarm, SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import * as service from '../src/service'

const H = { 'X-Display-Name': 'Alex' }
const base = 'https://robin.test'

type Json = Record<string, any>

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await SELF.fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json: Json = res.status === 204 ? {} : await res.json()
  return { status: res.status, json, res }
}

async function createRotation(name = 'Standup lead', members = ['Alex', 'Sam', 'Priya']): Promise<Json> {
  const r = await call('POST', '/api/rotations', { name, members }, H)
  expect(r.status).toBe(201)
  return r.json
}

const kinds = async (token: string) => (await call('GET', `/api/r/${token}/audit`)).json.entries.map((e: Json) => e.kind)

describe('rotations API', () => {
  let rotation: Json
  beforeEach(async () => {
    // Storage is shared across tests, so start each one from empty tables.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM audit_entries'),
      env.DB.prepare('DELETE FROM rotations'),
      env.DB.prepare('DELETE FROM creations'),
    ])
    rotation = await createRotation()
  })

  it('create returns both tokens and dedupes members', async () => {
    const r = await call('POST', '/api/rotations', { name: '  Chores ', members: ['A', 'a', 'B'] }, H)
    expect(r.status).toBe(201)
    expect(r.json.name).toBe('Chores')
    expect(r.json.members).toEqual(['A', 'B'])
    expect(r.json.current).toBe('A')
    expect(r.json.edit_token).not.toBe(r.json.view_token)
    expect(r.json.can_edit).toBe(true)
  })

  it('view token reads but hides secrets', async () => {
    const r = await call('GET', `/api/r/${rotation.view_token}`)
    expect(r.status).toBe(200)
    expect(r.json.can_edit).toBe(false)
    expect(r.json).not.toHaveProperty('edit_token')
    expect(r.json).not.toHaveProperty('webhook_url')
  })

  it('view token cannot mutate', async () => {
    expect((await call('POST', `/api/r/${rotation.view_token}/advance`, undefined, H)).status).toBe(403)
    expect((await call('POST', `/api/r/${rotation.view_token}/members`, { name: 'Z' }, H)).status).toBe(403)
  })

  it('unknown token is 404', async () => {
    expect((await call('GET', '/api/r/nope')).status).toBe(404)
  })

  it('advance and bump are audited', async () => {
    const t = rotation.edit_token
    let r = await call('POST', `/api/r/${t}/advance`, undefined, H)
    expect(r.json.members).toEqual(['Sam', 'Priya', 'Alex'])
    r = await call('POST', `/api/r/${t}/bump`, undefined, { 'X-Display-Name': 'Sam' })
    expect(r.json.members).toEqual(['Priya', 'Sam', 'Alex'])
    const entries = (await call('GET', `/api/r/${t}/audit`)).json.entries
    expect(entries.map((e: Json) => e.kind)).toEqual(['bumped', 'advanced', 'created'])
    expect(entries[0].actor).toBe('Sam')
    expect(entries[1].detail).toEqual({ from: 'Alex', to: 'Sam', trigger: 'manual' })
  })

  it('undo reverts the last advance or bump, once, until the order changes again', async () => {
    const t = rotation.edit_token
    expect(rotation.can_undo).toBe(false)
    let r = await call('POST', `/api/r/${t}/advance`, undefined, H)
    expect(r.json.can_undo).toBe(true)
    r = await call('POST', `/api/r/${t}/undo`, undefined, H)
    expect(r.status).toBe(200)
    expect(r.json.members).toEqual(['Alex', 'Sam', 'Priya'])
    expect(r.json.can_undo).toBe(false)
    expect((await call('POST', `/api/r/${t}/undo`, undefined, H)).status).toBe(422)
    r = await call('POST', `/api/r/${t}/bump`, undefined, H)
    expect(r.json.members).toEqual(['Sam', 'Alex', 'Priya'])
    r = await call('POST', `/api/r/${t}/undo`, undefined, H)
    expect(r.json.members).toEqual(['Alex', 'Sam', 'Priya'])
    // A membership change after an advance makes that advance final.
    await call('POST', `/api/r/${t}/advance`, undefined, H)
    r = await call('POST', `/api/r/${t}/members`, { name: 'Dana' }, H)
    expect(r.json.can_undo).toBe(false)
    expect((await call('POST', `/api/r/${t}/undo`, undefined, H)).status).toBe(422)
    const entries = (await call('GET', `/api/r/${t}/audit`)).json.entries.map((e: Json) => e.kind)
    expect(entries.slice(0, 4)).toEqual(['member_added', 'advanced', 'undone', 'bumped'])
  })

  it('advance requires two members', async () => {
    const solo = await createRotation('Solo', ['Only'])
    expect((await call('POST', `/api/r/${solo.edit_token}/advance`, undefined, H)).status).toBe(422)
  })

  it('random pick is logged, does not reorder, and covers everyone before repeating', async () => {
    const t = rotation.edit_token
    const first = await call('POST', `/api/r/${t}/random`, undefined, H)
    expect(rotation.members).toContain(first.json.member)
    expect(first.json.members).toEqual(rotation.members)
    expect(first.json.random_picked).toEqual([first.json.member])
    expect((await kinds(t))[0]).toBe('random_pick')
    const picks = [first.json.member]
    for (let i = 0; i < 2; i++) picks.push((await call('POST', `/api/r/${t}/random`, undefined, H)).json.member)
    expect([...picks].sort()).toEqual([...rotation.members].sort())
    const again = await call('POST', `/api/r/${t}/random`, undefined, H)
    expect(again.json.random_picked).toEqual([again.json.member])
  })

  it('members add, remove, reorder', async () => {
    const t = rotation.edit_token
    expect((await call('POST', `/api/r/${t}/members`, { name: 'alex' }, H)).status).toBe(422)
    let r = await call('POST', `/api/r/${t}/members`, { name: 'Dana' }, H)
    expect(r.json.members.at(-1)).toBe('Dana')
    r = await call('PUT', `/api/r/${t}/members`, { members: ['Dana', 'Alex', 'Priya', 'Sam'] }, H)
    expect(r.json.members).toEqual(['Dana', 'Alex', 'Priya', 'Sam'])
    expect((await call('PUT', `/api/r/${t}/members`, { members: ['Dana', 'Alex'] }, H)).status).toBe(422)
    r = await call('DELETE', `/api/r/${t}/members/priya`, undefined, H)
    expect(r.json.members).toEqual(['Dana', 'Alex', 'Sam'])
    expect((await kinds(t)).slice(0, 3)).toEqual(['member_removed', 'members_reordered', 'member_added'])
  })

  it('defaults the actor when no name is sent', async () => {
    const t = rotation.edit_token
    await call('POST', `/api/r/${t}/advance`)
    expect((await call('GET', `/api/r/${t}/audit`)).json.entries[0].actor).toBe('Someone')
  })

  it('regenerate invalidates the old link', async () => {
    const old = rotation.edit_token
    const r = await call('POST', `/api/r/${old}/regenerate`, { which: 'edit' }, H)
    expect(r.json.edit_token).not.toBe(old)
    expect((await call('GET', `/api/r/${old}`)).status).toBe(404)
    expect((await call('GET', `/api/r/${r.json.edit_token}`)).status).toBe(200)
  })

  it('delete requires the exact name', async () => {
    const t = rotation.edit_token
    expect((await call('POST', `/api/r/${t}/delete`, { confirm_name: 'wrong' })).status).toBe(422)
    expect((await call('POST', `/api/r/${t}/delete`, { confirm_name: 'standup lead' })).status).toBe(204)
    expect((await call('GET', `/api/r/${t}`)).status).toBe(404)
    expect((await call('GET', `/api/r/${rotation.view_token}`)).status).toBe(404)
  })

  it('rename', async () => {
    const t = rotation.edit_token
    const r = await call('PATCH', `/api/r/${t}`, { name: 'On-call' }, H)
    expect(r.json.name).toBe('On-call')
    expect((await kinds(t))[0]).toBe('renamed')
  })

  it('rate limits creation per IP', async () => {
    // beforeEach already created one; the test limit is 5 per hour.
    for (let i = 0; i < 4; i++) expect((await call('POST', '/api/rotations', { name: 'x', members: [] })).status).toBe(201)
    expect((await call('POST', '/api/rotations', { name: 'x', members: [] })).status).toBe(429)
    const other = await call('POST', '/api/rotations', { name: 'x', members: [] }, { 'CF-Connecting-IP': '203.0.113.9' })
    expect(other.status).toBe(201)
  })

  it('schedule set computes next fire, pauses, clears', async () => {
    const t = rotation.edit_token
    let r = await call('PUT', `/api/r/${t}/schedule`, { kind: 'daily', time: '09:00', tz: 'UTC' }, H)
    expect(r.status).toBe(200)
    expect(r.json.schedule.kind).toBe('daily')
    expect(r.json.next_fire_at).not.toBeNull()
    r = await call('POST', `/api/r/${t}/schedule/paused`, { paused: true }, H)
    expect(r.json.schedule_paused).toBe(true)
    r = await call('DELETE', `/api/r/${t}/schedule`, undefined, H)
    expect(r.json.schedule).toBeNull()
    expect(r.json.next_fire_at).toBeNull()
    expect((await kinds(t)).slice(0, 3)).toEqual(['schedule_cleared', 'schedule_paused', 'schedule_set'])
  })

  it('schedule rejects invalid input', async () => {
    const t = rotation.edit_token
    expect((await call('PUT', `/api/r/${t}/schedule`, { kind: 'weekly', time: '09:00', tz: 'UTC' }, H)).status).toBe(422)
  })

  it('a due schedule advances once and arms the next firing', async () => {
    const t = rotation.edit_token
    await call('PUT', `/api/r/${t}/schedule`, { kind: 'daily', time: '09:00', tz: 'UTC' }, H)
    const id = (await env.DB.prepare('SELECT id FROM rotations').first<{ id: string }>())!.id
    // Pretend the firing time was ten days ago.
    const past = new Date(Date.now() - 10 * 86_400_000).toISOString()
    await env.DB.prepare('UPDATE rotations SET next_fire_at = ? WHERE id = ?').bind(past, id).run()
    const stub = env.ROTATION.get(env.ROTATION.idFromName(id))
    // Arm for the future; runDurableObjectAlarm runs it now regardless of the time.
    await stub.arm(id, Date.now() + 60_000)

    expect(await runDurableObjectAlarm(stub)).toBe(true)
    const after = (await call('GET', `/api/r/${t}`)).json
    expect(after.members).toEqual(['Sam', 'Priya', 'Alex'])
    expect(new Date(after.next_fire_at).getTime()).toBeGreaterThan(Date.now())
    const top = (await call('GET', `/api/r/${t}/audit`)).json.entries[0]
    expect(top.actor).toBe('Schedule')
    expect(top.kind).toBe('advanced')
    // The alarm is re-armed for the future, so running it now fires nothing new.
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    expect((await call('GET', `/api/r/${t}`)).json.members).toEqual(['Sam', 'Priya', 'Alex'])
  })

  it('a paused schedule does not fire', async () => {
    const t = rotation.edit_token
    await call('PUT', `/api/r/${t}/schedule`, { kind: 'daily', time: '09:00', tz: 'UTC' }, H)
    await call('POST', `/api/r/${t}/schedule/paused`, { paused: true }, H)
    const id = (await env.DB.prepare('SELECT id FROM rotations').first<{ id: string }>())!.id
    const stub = env.ROTATION.get(env.ROTATION.idFromName(id))
    // Pausing disarms the alarm.
    expect(await runDurableObjectAlarm(stub)).toBe(false)
    expect((await call('GET', `/api/r/${t}`)).json.members).toEqual(['Alex', 'Sam', 'Priya'])
  })

  it('webhook set builds a Slack-compatible notification', async () => {
    const t = rotation.edit_token
    const r = await call('PUT', `/api/r/${t}/webhook`, { url: 'https://hooks.slack.com/services/T/B/x' }, H)
    expect(r.json.has_webhook).toBe(true)
    expect(r.json.webhook_url.startsWith('https://hooks')).toBe(true)
    const view = (await call('GET', `/api/r/${rotation.view_token}`)).json
    expect(view.has_webhook).toBe(true)
    expect(view).not.toHaveProperty('webhook_url')
    const rot = await service.resolveEdit(env, t)
    const n = await service.advance(env, rot, 'Alex')
    expect(n).not.toBeNull()
    expect(n!.payload.current).toBe('Sam')
    expect(n!.payload.previous).toBe('Alex')
    expect(String(n!.payload.text)).toContain('Sam')
    expect(n!.payload.view_url).toBe(`https://robin.test/r/${rotation.view_token}`)
    expect((await kinds(t))[1]).toBe('webhook_set')
  })

  it('webhook rejects internal hosts', async () => {
    const t = rotation.edit_token
    for (const url of ['http://localhost/x', 'http://127.0.0.1/x', 'http://10.0.0.1/x', 'http://app.internal/x', 'ftp://a.b/x']) {
      expect((await call('PUT', `/api/r/${t}/webhook`, { url }, H)).status, url).toBe(422)
    }
  })

  it('webhook failure is audited', async () => {
    const t = rotation.edit_token
    const rot = await service.resolveEdit(env, t)
    await service.recordWebhookFailure(env, rot.id, 'HTTP 404')
    const e = (await call('GET', `/api/r/${t}/audit`)).json.entries[0]
    expect(e.kind).toBe('webhook_failed')
    expect(e.detail).toEqual({ reason: 'HTTP 404' })
  })

  it('a visit extends expiry and expired rotations are deleted', async () => {
    const t = rotation.edit_token
    const stale = new Date(Date.now() - 181 * 86_400_000).toISOString()
    await env.DB.prepare('UPDATE rotations SET last_visited_at = ?').bind(stale).run()
    // A visit rescues it.
    expect((await call('GET', `/api/r/${t}`)).status).toBe(200)
    expect(await service.deleteExpired(env, new Date())).toBe(0)
    // Without a visit it goes.
    await env.DB.prepare('UPDATE rotations SET last_visited_at = ?').bind(stale).run()
    expect(await service.deleteExpired(env, new Date())).toBe(1)
    expect((await call('GET', `/api/r/${t}`)).status).toBe(404)
  })

  it('paginates the audit log', async () => {
    const t = rotation.edit_token
    for (let i = 0; i < 5; i++) await call('POST', `/api/r/${t}/advance`, undefined, H)
    const page = (await call('GET', `/api/r/${t}/audit?limit=4`)).json
    expect(page.entries).toHaveLength(4)
    expect(page.has_more).toBe(true)
    const rest = (await call('GET', `/api/r/${t}/audit?limit=4&before=${page.entries.at(-1).id}`)).json
    expect(rest.entries).toHaveLength(2)
    expect(rest.has_more).toBe(false)
    expect(rest.entries.at(-1).kind).toBe('created')
  })

  it('health and websocket hello', async () => {
    expect((await call('GET', '/health')).json).toEqual({ status: 'ok' })
    const res = await SELF.fetch(`${base}/api/r/${rotation.view_token}/ws`, { headers: { Upgrade: 'websocket' } })
    expect(res.status).toBe(101)
    const ws = res.webSocket!
    ws.accept()
    const hello = await new Promise<string>((resolve) => ws.addEventListener('message', (e: MessageEvent) => resolve(String(e.data))))
    expect(JSON.parse(hello)).toEqual({ type: 'hello', version: 1 })
    ws.close()
  })
})
