/**
 * Animates the member list when the turn changes: on an Advance the lead rolls off the
 * top and comes back in from below, like a drum turning; on an Undo of an Advance it
 * rolls the other way; on a Skip (or its undo) the top two rows glide past each other.
 * Any other change to the list (add, remove, drag reorder) just snaps, so this never
 * fights dnd-kit's own transforms.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react'

const EASE = 'cubic-bezier(.2,.8,.2,1)'
const GLIDE_MS = 420
const WHEEL_MS = 560

type Change = 'forward' | 'backward' | 'swap' | null

function classify(prev: string[], next: string[]): Change {
  if (prev.length < 2 || prev.length !== next.length) return null
  const same = (a: string[], b: string[]) => a.every((v, i) => v === b[i])
  if (same(prev, next)) return null
  if (same([...prev.slice(1), prev[0]], next)) return 'forward'
  if (same([prev[prev.length - 1], ...prev.slice(0, -1)], next)) return 'backward'
  if (same([prev[1], prev[0], ...prev.slice(2)], next)) return 'swap'
  return null
}

export function useTurnAnimation(listRef: RefObject<HTMLElement | null>, members: string[]) {
  const prevMembers = useRef<string[]>(members)
  const prevRects = useRef<Map<string, DOMRect>>(new Map())

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const rows = [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement)
    const measure = () => new Map(rows.map((el) => [el.dataset.member ?? '', el.getBoundingClientRect()]))

    const change = classify(prevMembers.current, members)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (change && !reduced && prevRects.current.size) {
      const before = prevRects.current
      const wrapping = change === 'forward' ? members[members.length - 1] : change === 'backward' ? members[0] : null
      for (const el of rows) {
        const name = el.dataset.member ?? ''
        const a = before.get(name)
        if (!a) continue
        const b = el.getBoundingClientRect()
        const dy = a.top - b.top
        if (name === wrapping) {
          // Roll out one edge, back in the other.
          const out = change === 'forward' ? -a.height * 0.6 : a.height * 0.6
          const back = change === 'forward' ? b.height * 0.6 : -b.height * 0.6
          el.animate(
            [
              { transform: `translateY(${dy}px)`, opacity: 1, offset: 0 },
              { transform: `translateY(${dy + out}px)`, opacity: 0, offset: 0.4 },
              { transform: `translateY(${back}px)`, opacity: 0, offset: 0.41 },
              { transform: 'none', opacity: 1, offset: 1 },
            ],
            { duration: WHEEL_MS, easing: 'ease-in-out' },
          )
        } else if (dy) {
          el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: GLIDE_MS, easing: EASE })
        }
      }
    }

    prevMembers.current = members
    prevRects.current = measure()
  }, [listRef, members])
}
