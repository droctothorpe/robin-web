import { useState } from 'react'
import CopyButton from './CopyButton'
import Modal from './Modal'

type Props = {
  editToken?: string
  viewToken: string
  canEdit: boolean
  onClose: () => void
  onRegenerate: (which: 'edit' | 'view') => void
}

export default function ShareModal({ editToken, viewToken, canEdit, onClose, onRegenerate }: Props) {
  const origin = window.location.origin
  return (
    <Modal title="Share" onClose={onClose}>
      <div className="stack">
        {editToken && (
          <LinkBlock
            label="Edit link"
            hint="Full access. Anyone with it can change or delete this rotation."
            url={`${origin}/r/${editToken}`}
            canEdit={canEdit}
            onRegenerate={() => onRegenerate('edit')}
          />
        )}
        <LinkBlock
          label="View link"
          hint="Read-only. Safe for wikis, dashboards, and the wider team."
          url={`${origin}/r/${viewToken}`}
          canEdit={canEdit}
          onRegenerate={() => onRegenerate('view')}
        />
      </div>
    </Modal>
  )
}

function LinkBlock({
  label,
  hint,
  url,
  canEdit,
  onRegenerate,
}: {
  label: string
  hint: string
  url: string
  canEdit: boolean
  onRegenerate: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="link-block">
      <div className="link-head">
        <strong>{label}</strong>
        <span className="muted small">{hint}</span>
      </div>
      <div className="link-field">
        <code className="link-url" title={url}>
          {url}
        </code>
        <CopyButton text={url} className="btn btn-primary small" />
      </div>
      {canEdit && !confirming && (
        <button type="button" className="link-action" onClick={() => setConfirming(true)}>
          Regenerate link
        </button>
      )}
      {canEdit && confirming && (
        <div className="row small">
          <span className="muted">The old link stops working immediately.</span>
          <button
            type="button"
            className="btn btn-danger small"
            onClick={() => {
              setConfirming(false)
              onRegenerate()
            }}
          >
            Regenerate
          </button>
          <button type="button" className="btn btn-ghost small" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      )}
    </div>
  )
}
