import { describe, expect, it } from 'vitest'
import { advance, bump, dedupe, newToken, randomPick, sameSet } from '../src/ops'

describe('ops', () => {
  it('tokens are 22 url-safe characters and unique', () => {
    const a = newToken()
    const b = newToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(a).not.toBe(b)
  })

  it('dedupe trims, collapses whitespace, drops blanks and case-insensitive repeats', () => {
    expect(dedupe(['  Alex  Smith ', 'alex smith', '', 'Sam'])).toEqual(['Alex Smith', 'Sam'])
  })

  it('advance moves current to the tail; bump swaps the first two', () => {
    expect(advance(['a', 'b', 'c'])).toEqual(['b', 'c', 'a'])
    expect(bump(['a', 'b', 'c'])).toEqual(['b', 'a', 'c'])
    expect(advance(['a'])).toEqual(['a'])
  })

  it('random pick never repeats within a round', () => {
    const members = ['a', 'b', 'c', 'd']
    let already: string[] = []
    const picks: string[] = []
    for (let i = 0; i < 4; i++) {
      const r = randomPick(members, already)
      picks.push(r.picked)
      already = r.already
    }
    expect(picks.sort()).toEqual(members)
    const next = randomPick(members, already)
    expect(next.already).toEqual([next.picked])
  })

  it('random pick forgets departed members', () => {
    const r = randomPick(['a', 'b'], ['zed', 'a'])
    expect(r.picked).toBe('b')
    expect(r.already).toEqual(['a', 'b'])
  })

  it('sameSet ignores order and case', () => {
    expect(sameSet(['A', 'b'], ['b', 'a'])).toBe(true)
    expect(sameSet(['a'], ['a', 'b'])).toBe(false)
  })
})
