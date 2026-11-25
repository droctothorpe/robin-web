/** Pure operations on an ordered member list. Mirrors the glossary: Advance, Bump, Random pick, Round. */

export const MAX_MEMBERS = 200
export const MAX_NAME_LEN = 60

/** 128 bits of randomness, URL-safe base64 without padding (22 chars). */
export function newToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const squash = (s: string) => s.split(/\s+/).filter(Boolean).join(' ')
const fold = (s: string) => s.toLocaleLowerCase()

export function normalizeName(name: string): string {
  const cleaned = squash(name)
  if (!cleaned) throw new Error('member name is empty')
  if (cleaned.length > MAX_NAME_LEN) throw new Error(`member name longer than ${MAX_NAME_LEN} characters`)
  return cleaned
}

/** Normalize, drop blanks, and keep the first of any case-insensitive duplicates. */
export function dedupe(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names) {
    const cleaned = squash(raw)
    if (!cleaned) continue
    if (cleaned.length > MAX_NAME_LEN) throw new Error(`member name longer than ${MAX_NAME_LEN} characters`)
    const key = fold(cleaned)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }
  if (out.length > MAX_MEMBERS) throw new Error(`more than ${MAX_MEMBERS} members`)
  return out
}

export function find(members: string[], name: string): number {
  const key = fold(name)
  return members.findIndex((m) => fold(m) === key)
}

/** Current moves to the tail. */
export function advance(members: string[]): string[] {
  if (members.length < 2) return [...members]
  return [...members.slice(1), members[0]]
}

/** Current is skipped: they move to second place, the next member becomes Current. */
export function bump(members: string[]): string[] {
  if (members.length < 2) return [...members]
  return [members[1], members[0], ...members.slice(2)]
}

/**
 * Pick a member nobody has drawn this Round. When everyone has been picked
 * the Round resets and a new one begins with this pick.
 */
export function randomPick(members: string[], already: string[]): { picked: string; already: string[] } {
  if (members.length === 0) throw new Error('no members to pick from')
  const taken = new Set(already.map(fold))
  let pool = members.filter((m) => !taken.has(fold(m)))
  let kept = already
  if (pool.length === 0) {
    pool = [...members]
    kept = []
  }
  const idx = crypto.getRandomValues(new Uint32Array(1))[0] % pool.length
  const picked = pool[idx]
  // Drop names that have since left the rotation so the list cannot grow stale.
  const live = new Set(members.map(fold))
  const next = kept.filter((a) => live.has(fold(a)))
  return { picked, already: [...next, picked] }
}

/**
 * Which turn change Undo would revert, given the order-changing audit kinds newest first.
 * Each `undone` cancels the next older Advance or Bump; anything else that changed the
 * order (membership edits, creation) ends the run.
 */
export function nextUndo(kinds: string[]): 'advanced' | 'bumped' | null {
  let undone = 0
  for (const kind of kinds) {
    if (kind === 'undone') undone += 1
    else if (kind === 'advanced' || kind === 'bumped') {
      if (undone === 0) return kind
      undone -= 1
    } else return null
  }
  return null
}

export function sameSet(a: string[], b: string[]): boolean {
  const x = a.map(fold).sort()
  const y = b.map(fold).sort()
  return x.length === y.length && x.every((v, i) => v === y[i])
}
