/** D1 access. Rows in, typed Rotations out; statements for batching mutations. */
import type { Schedule } from './schedule'

export type Rotation = {
  id: string
  name: string
  editToken: string
  viewToken: string
  members: string[]
  randomPicked: string[]
  webhookUrl: string | null
  schedule: Schedule | null
  schedulePaused: boolean
  nextFireAt: Date | null
  version: number
  createdAt: Date
  lastVisitedAt: Date
}

export type AuditEntry = {
  id: number
  at: Date
  actor: string
  kind: string
  detail: Record<string, unknown>
}

type Row = {
  id: string
  name: string
  edit_token: string
  view_token: string
  members: string
  random_picked: string
  webhook_url: string | null
  schedule: string | null
  schedule_paused: number
  next_fire_at: string | null
  version: number
  created_at: string
  last_visited_at: string
}

type AuditRow = { id: number; created_at: string; actor: string; kind: string; detail: string }

const COLS =
  'id, name, edit_token, view_token, members, random_picked, webhook_url, schedule, schedule_paused, next_fire_at, version, created_at, last_visited_at'

function fromRow(r: Row): Rotation {
  return {
    id: r.id,
    name: r.name,
    editToken: r.edit_token,
    viewToken: r.view_token,
    members: JSON.parse(r.members),
    randomPicked: JSON.parse(r.random_picked),
    webhookUrl: r.webhook_url,
    schedule: r.schedule ? JSON.parse(r.schedule) : null,
    schedulePaused: r.schedule_paused === 1,
    nextFireAt: r.next_fire_at ? new Date(r.next_fire_at) : null,
    version: r.version,
    createdAt: new Date(r.created_at),
    lastVisitedAt: new Date(r.last_visited_at),
  }
}

export async function findByToken(db: D1Database, token: string): Promise<Rotation | null> {
  const row = await db
    .prepare(`SELECT ${COLS} FROM rotations WHERE edit_token = ?1 OR view_token = ?1`)
    .bind(token)
    .first<Row>()
  return row ? fromRow(row) : null
}

export async function getById(db: D1Database, id: string): Promise<Rotation | null> {
  const row = await db.prepare(`SELECT ${COLS} FROM rotations WHERE id = ?`).bind(id).first<Row>()
  return row ? fromRow(row) : null
}

export function insertRotation(db: D1Database, r: Rotation): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO rotations (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      r.id,
      r.name,
      r.editToken,
      r.viewToken,
      JSON.stringify(r.members),
      JSON.stringify(r.randomPicked),
      r.webhookUrl,
      r.schedule ? JSON.stringify(r.schedule) : null,
      r.schedulePaused ? 1 : 0,
      r.nextFireAt ? r.nextFireAt.toISOString() : null,
      r.version,
      r.createdAt.toISOString(),
      r.lastVisitedAt.toISOString(),
    )
}

/** Write every mutable column. Cheap, and it keeps the service free of per-field SQL. */
export function updateRotation(db: D1Database, r: Rotation): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE rotations SET name = ?, edit_token = ?, view_token = ?, members = ?, random_picked = ?, webhook_url = ?,
         schedule = ?, schedule_paused = ?, next_fire_at = ?, version = ?, last_visited_at = ? WHERE id = ?`,
    )
    .bind(
      r.name,
      r.editToken,
      r.viewToken,
      JSON.stringify(r.members),
      JSON.stringify(r.randomPicked),
      r.webhookUrl,
      r.schedule ? JSON.stringify(r.schedule) : null,
      r.schedulePaused ? 1 : 0,
      r.nextFireAt ? r.nextFireAt.toISOString() : null,
      r.version,
      r.lastVisitedAt.toISOString(),
      r.id,
    )
}

export function touchRotation(db: D1Database, id: string, at: Date): D1PreparedStatement {
  return db.prepare('UPDATE rotations SET last_visited_at = ? WHERE id = ?').bind(at.toISOString(), id)
}

export function insertAudit(
  db: D1Database,
  rotationId: string,
  kind: string,
  actor: string,
  detail: Record<string, unknown>,
  at: Date,
): D1PreparedStatement {
  return db
    .prepare('INSERT INTO audit_entries (rotation_id, created_at, actor, kind, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(rotationId, at.toISOString(), actor, kind, JSON.stringify(detail))
}

export function deleteRotation(db: D1Database, id: string): D1PreparedStatement[] {
  return [
    db.prepare('DELETE FROM audit_entries WHERE rotation_id = ?').bind(id),
    db.prepare('DELETE FROM rotations WHERE id = ?').bind(id),
  ]
}

export async function auditPage(
  db: D1Database,
  rotationId: string,
  before: number | null,
  limit: number,
): Promise<AuditEntry[]> {
  const stmt =
    before === null
      ? db
          .prepare('SELECT id, created_at, actor, kind, detail FROM audit_entries WHERE rotation_id = ? ORDER BY id DESC LIMIT ?')
          .bind(rotationId, limit)
      : db
          .prepare(
            'SELECT id, created_at, actor, kind, detail FROM audit_entries WHERE rotation_id = ? AND id < ? ORDER BY id DESC LIMIT ?',
          )
          .bind(rotationId, before, limit)
  const { results } = await stmt.all<AuditRow>()
  return results.map((e) => ({ id: e.id, at: new Date(e.created_at), actor: e.actor, kind: e.kind, detail: JSON.parse(e.detail) }))
}

export async function expiredIds(db: D1Database, cutoff: Date): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT id FROM rotations WHERE last_visited_at < ?')
    .bind(cutoff.toISOString())
    .all<{ id: string }>()
  return results.map((r) => r.id)
}

export async function creationsSince(db: D1Database, ipHash: string, since: Date): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM creations WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, since.toISOString())
    .first<{ n: number }>()
  return row?.n ?? 0
}

export function recordCreation(db: D1Database, ipHash: string, at: Date): D1PreparedStatement {
  return db.prepare('INSERT INTO creations (ip_hash, created_at) VALUES (?, ?)').bind(ipHash, at.toISOString())
}

export function pruneCreations(db: D1Database, before: Date): D1PreparedStatement {
  return db.prepare('DELETE FROM creations WHERE created_at < ?').bind(before.toISOString())
}

/** Kinds of the audit entries that changed the member order (or created the rotation), newest first. Drives Undo. */
export async function orderEvents(db: D1Database, rotationId: string, limit = 500): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT kind FROM audit_entries WHERE rotation_id = ?
         AND kind IN ('advanced', 'bumped', 'undone', 'member_added', 'member_removed', 'members_reordered', 'created')
       ORDER BY id DESC LIMIT ?`,
    )
    .bind(rotationId, limit)
    .all<{ kind: string }>()
  return results.map((r) => r.kind)
}
