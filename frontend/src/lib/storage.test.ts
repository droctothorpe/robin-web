import { describe, expect, it } from 'vitest'
import { forgetRotation, getDisplayName, getSavedRotations, rememberRotation, setDisplayName } from './storage'

function fakeStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

describe('display name', () => {
  it('round-trips and trims', () => {
    const s = fakeStorage()
    expect(getDisplayName(s)).toBeNull()
    setDisplayName('  Alex ', s)
    expect(getDisplayName(s)).toBe('Alex')
  })
})

describe('saved rotations', () => {
  it('remembers newest first and dedupes by token', () => {
    const s = fakeStorage()
    rememberRotation({ token: 'a', name: 'A', canEdit: true }, s)
    rememberRotation({ token: 'b', name: 'B', canEdit: false }, s)
    rememberRotation({ token: 'a', name: 'A renamed', canEdit: true }, s)
    expect(getSavedRotations(s).map((r) => r.token)).toEqual(['a', 'b'])
    expect(getSavedRotations(s)[0].name).toBe('A renamed')
    forgetRotation('a', s)
    expect(getSavedRotations(s).map((r) => r.token)).toEqual(['b'])
  })

  it('survives a null store', () => {
    expect(getSavedRotations(null)).toEqual([])
    expect(rememberRotation({ token: 'x', name: 'X', canEdit: true }, null)).toHaveLength(1)
  })
})
