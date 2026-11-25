/**
 * Browser-local conveniences. Nothing here is authoritative: losing it loses
 * nothing on the server, and the server never sees it.
 */

export type SavedRotation = { token: string; name: string; canEdit: boolean; savedAt: string }

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const NAME_KEY = 'robin.displayName'
const LIST_KEY = 'robin.rotations'

function store(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function getDisplayName(s: StorageLike | null = store()): string | null {
  try {
    const v = s?.getItem(NAME_KEY)
    return v && v.trim() ? v : null
  } catch {
    return null
  }
}

export function setDisplayName(name: string, s: StorageLike | null = store()): void {
  try {
    s?.setItem(NAME_KEY, name.trim().slice(0, 40))
  } catch {
    /* storage unavailable */
  }
}

export function getSavedRotations(s: StorageLike | null = store()): SavedRotation[] {
  try {
    const raw = s?.getItem(LIST_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as SavedRotation[]) : []
  } catch {
    return []
  }
}

export function rememberRotation(
  r: { token: string; name: string; canEdit: boolean },
  s: StorageLike | null = store(),
): SavedRotation[] {
  const existing = getSavedRotations(s).filter((x) => x.token !== r.token)
  // An edit link supersedes a view link for the same rotation name only if
  // the token matches; we cannot link the two without the server, so keep both.
  const next: SavedRotation[] = [{ ...r, savedAt: new Date().toISOString() }, ...existing].slice(0, 50)
  try {
    s?.setItem(LIST_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
  return next
}

export function forgetRotation(token: string, s: StorageLike | null = store()): SavedRotation[] {
  const next = getSavedRotations(s).filter((x) => x.token !== token)
  try {
    s?.setItem(LIST_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
  return next
}
