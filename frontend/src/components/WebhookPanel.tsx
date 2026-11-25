import { useState, type FormEvent } from 'react'

type Props = {
  url: string | null | undefined
  hasWebhook: boolean
  canEdit: boolean
  onSave: (url: string) => Promise<boolean>
  onClear: () => void
}

export default function WebhookPanel({ url, hasWebhook, canEdit, onSave, onClear }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(url ?? '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (await onSave(draft.trim())) setEditing(false)
  }

  return (
    <div className="setting">
      <div className="setting-row">
        <div className="setting-text">
          <div className="setting-label">Notifications</div>
          {hasWebhook ? (
            <div>
              Posting to <code>{canEdit && url ? safeHost(url) : 'a webhook'}</code> whenever the turn changes.
            </div>
          ) : (
            <div className="muted">Off. Add a Slack or Discord webhook to get a post when the turn changes.</div>
          )}
        </div>
        {canEdit && !editing && (
          <div className="setting-actions">
            <button
              type="button"
              className="btn small"
              onClick={() => {
                setDraft(url ?? '')
                setEditing(true)
              }}
            >
              {hasWebhook ? 'Change' : 'Set up'}
            </button>
          </div>
        )}
      </div>
      {editing && (
        <form className="setting-form" onSubmit={submit}>
          <label>
            Webhook URL
            <input
              className="input"
              type="url"
              placeholder="https://hooks.slack.com/services/…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              required
              autoFocus
            />
          </label>
          <div className="row between">
            <div>
              {hasWebhook && (
                <button
                  type="button"
                  className="btn btn-ghost small danger-text"
                  onClick={() => {
                    setEditing(false)
                    onClear()
                  }}
                >
                  Remove webhook
                </button>
              )}
            </div>
            <div className="row">
              <button type="button" className="btn btn-ghost small" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary small">
                Save
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
