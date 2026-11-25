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
    <section className="card">
      <div className="row between">
        <h2>Notifications</h2>
        {canEdit && !editing && (
          <button type="button" className="btn btn-ghost small" onClick={() => { setDraft(url ?? ''); setEditing(true) }}>
            {hasWebhook ? 'Change' : 'Set up'}
          </button>
        )}
      </div>
      {!editing && !hasWebhook && (
        <p className="muted">
          Paste a Slack or Discord incoming webhook URL and Robin posts whenever Current changes.
        </p>
      )}
      {!editing && hasWebhook && (
        <>
          <p>
            Posting to <code>{canEdit && url ? safeHost(url) : 'a webhook'}</code> whenever Current changes.
          </p>
          {canEdit && (
            <button type="button" className="btn btn-ghost small" onClick={onClear}>
              Remove webhook
            </button>
          )}
        </>
      )}
      {editing && (
        <form className="stack" onSubmit={submit}>
          <input
            className="input"
            type="url"
            placeholder="https://hooks.slack.com/services/…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            required
          />
          <div className="row end">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save webhook
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
