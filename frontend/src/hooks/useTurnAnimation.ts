/**
 * Animates the member list when the turn changes, in two quick beats: first the
 * highlight steps to the new lead (names swap size, nothing reorders), then the old
 * lead drops to the bottom and the list closes up. Undo of an Advance plays it in
 * reverse (the bottom name takes the highlight, then rises to the top); a Skip is a
 * single glide. Any other change (add, remove, drag reorder) snaps, so this never
 * fights dnd-kit's own transforms.
 *
 * While it runs, the rows' own backgrounds are suppressed and a separate band
 * (`.turn-band`, positioned by this hook) plays the highlight, because the rows'
 * content is what moves, not the rows.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react'

const STEP_MS = 110
const GAP_MS = 20
const DROP_MS = 180
const EASE = 'cubic-bezier(.2,.8,.2,1)'

type Change = 'forward' | 'backward' | 'swap' | null
type Snapshot = { spans: Map<string, DOMRect>; sizes: Map<string, string>; band: { top: number; height: number } }

function classify(prev: string[], next: string[]): Change {
  if (prev.length < 2 || prev.length !== next.length) return null
  const same = (a: string[], b: string[]) => a.every((v, i) => v === b[i])
  if (same(prev, next)) return null
  if (same([...prev.slice(1), prev[0]], next)) return 'forward'
  if (same([prev[prev.length - 1], ...prev.slice(0, -1)], next)) return 'backward'
  if (same([prev[1], prev[0], ...prev.slice(2)], next)) return 'swap'
  return null
}

const rowsOf = (list: HTMLElement) => [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement)
const nameOf = (row: HTMLElement) => row.dataset.member ?? ''

function measure(list: HTMLElement): Snapshot {
  const spans = new Map<string, DOMRect>()
  const sizes = new Map<string, string>()
  let band = { top: 0, height: 0 }
  for (const row of rowsOf(list)) {
    const name = nameOf(row)
    ;[...row.children].forEach((child, i) => spans.set(`${name}:${i}`, child.getBoundingClientRect()))
    const label = row.querySelector<HTMLElement>('.member-name')
    if (label) sizes.set(name, getComputedStyle(label).fontSize)
    if (row.classList.contains('current')) band = { top: row.offsetTop, height: row.offsetHeight }
  }
  return { spans, sizes, band }
}

export function useTurnAnimation(listRef: RefObject<HTMLElement | null>, members: string[]) {
  const prevMembers = useRef<string[]>(members)
  const prevSnap = useRef<Snapshot | null>(null)

  useLayoutEffect(() => {
    const list = listRef.current
    const wrap = list?.parentElement
    const band = wrap?.querySelector<HTMLElement>('.turn-band')
    if (!list || !wrap || !band) return

    // Settle anything still in flight so every measurement below is of resting layout.
    for (const a of [list, band].flatMap((el) => el.getAnimations({ subtree: true }))) a.cancel()
    wrap.classList.remove('turning')

    const after = measure(list)
    const before = prevSnap.current
    const change = classify(prevMembers.current, members)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (change && before && !reduced) {
      // Beat one shows the old order with the new highlight. React has already committed
      // the new order, so borrow that layout for a moment: reorder, measure, put it back.
      let between = after
      if (change !== 'swap') {
        const byName = new Map(rowsOf(list).map((row) => [nameOf(row), row]))
        for (const n of prevMembers.current) list.appendChild(byName.get(n)!)
        between = measure(list)
        for (const n of members) list.appendChild(byName.get(n)!)
      }

      const total = change === 'swap' ? DROP_MS : STEP_MS + GAP_MS + DROP_MS
      const t1 = STEP_MS / total
      const t2 = (STEP_MS + GAP_MS) / total
      const ty = (px: number) => (px ? `translateY(${px}px)` : 'none')
      const frames = <T extends Record<string, string>>(a: T, b: T, c: T): Keyframe[] =>
        change === 'swap'
          ? [{ ...a, easing: EASE }, c]
          : [{ ...a, offset: 0, easing: EASE }, { ...b, offset: t1, easing: 'linear' }, { ...b, offset: t2, easing: EASE }, { ...c, offset: 1 }]

      wrap.classList.add('turning')
      for (const row of rowsOf(list)) {
        const name = nameOf(row)
        ;[...row.children].forEach((child, i) => {
          const key = `${name}:${i}`
          const a = before.spans.get(key)
          const b = between.spans.get(key)
          const c = after.spans.get(key)
          if (!a || !b || !c) return
          const dyA = a.top - c.top
          const dyB = b.top - c.top
          const fontA = before.sizes.get(name)
          const fontC = after.sizes.get(name)
          const resize = child.classList.contains('member-name') && fontA && fontC && fontA !== fontC
          if (!dyA && !dyB && !resize) return
          const kf = frames(
            { transform: ty(dyA), ...(resize ? { fontSize: fontA } : {}) },
            { transform: ty(dyB), ...(resize ? { fontSize: fontC } : {}) },
            { transform: 'none', ...(resize ? { fontSize: fontC } : {}) },
          )
          child.animate(kf, { duration: total })
        })
      }
      const px = (n: number) => `${n}px`
      const bandAnim = band.animate(
        frames(
          { top: px(before.band.top), height: px(before.band.height) },
          { top: px(between.band.top), height: px(between.band.height) },
          { top: px(after.band.top), height: px(after.band.height) },
        ),
        { duration: total },
      )
      bandAnim.onfinish = () => wrap.classList.remove('turning')
    }

    prevMembers.current = members
    prevSnap.current = after
  }, [listRef, members])
}
