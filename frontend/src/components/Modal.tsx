import { useEffect, type ReactNode } from 'react'
import { CloseIcon } from './Icons'

export default function Modal({
  title,
  onClose,
  children,
  closable = true,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  closable?: boolean
}) {
  useEffect(() => {
    if (!closable) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, closable])

  return (
    <div className="modal-backdrop" onClick={closable ? onClose : undefined}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          {closable && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
