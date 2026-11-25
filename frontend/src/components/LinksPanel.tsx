import { useState } from 'react'
import CopyButton from './CopyButton'

type Props = {
  editToken?: string
  viewToken: string
  canEdit: boolean
  onRegenerate: (which: 'edit' | 'view') => void
}

export default function LinksPanel({ editToken, viewToken, canEdit, onRegenerate }: Props) {
  const origin = window.location.origin
  const viewUrl = `${origin}/r/${viewToken}`
  const editUrl = editToken ? `${origin}/r/${editToken}` : null
  return (
    <section className="card">
      <h2>Links</h2>
      <p className="muted small">
        The link is the key. Anyone with the edit link can change or delete this rotation. The view link is
        read-only.
      </p>
      {editUrl && (
        <LinkRow label="Edit link" url={editUrl} canEdit={canEdit} onRegenerate={() => onRegenerate('edit')} />
      )}
      <LinkRow label="View link" url={viewUrl} canEdit={canEdit} onRegenerate={() => onRegenerate('view')} />
    </section>
  )
}

function LinkRow({
  label,
  url,
  canEdit,
  onRegenerate,
}: {
  label: string
  url: string
  canEdit: boolean
  onRegenerate: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="link-row">
      <div className="link-label">{label}</div>
      <code className="link-url" title={url}>
        {url}
      </code>
      <div className="row">
        <CopyButton text={url} />
        {canEdit && !confirming && (
          <button type="button" className="btn btn-ghost small" onClick={() => setConfirming(true)}>
            Regenerate
          </button>
        )}
        {canEdit && confirming && (
          <>
            <span className="muted small">Old link stops working.</span>
            <button
              type="button"
              className="btn btn-danger small"
              onClick={() => {
                setConfirming(false)
                onRegenerate()
              }}
            >
              Yes, regenerate
            </button>
            <button type="button" className="btn btn-ghost small" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        )}
      </div>
    </div>
  )
}
