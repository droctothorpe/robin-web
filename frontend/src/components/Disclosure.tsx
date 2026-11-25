import { useState, type ReactNode } from 'react'
import { ChevronIcon } from './Icons'

/** A collapsed-by-default section with a chevron toggle. */
export default function Disclosure({
  title,
  children,
  onOpenChange,
}: {
  title: string
  children: ReactNode
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  function toggle() {
    const next = !open
    setOpen(next)
    onOpenChange?.(next)
  }
  return (
    <section className={`disclosure${open ? ' open' : ''}`}>
      <button type="button" className="disclosure-toggle" onClick={toggle} aria-expanded={open}>
        <ChevronIcon className="chev" />
        {title}
      </button>
      {open && <div className="disclosure-body">{children}</div>}
    </section>
  )
}
