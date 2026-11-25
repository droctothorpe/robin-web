import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError, type RotationState, type Schedule } from '../api'
import AuditLog from '../components/AuditLog'
import CopyButton from '../components/CopyButton'
import LinksPanel from '../components/LinksPanel'
import MemberList from '../components/MemberList'
import NamePrompt from '../components/NamePrompt'
import SchedulePanel from '../components/SchedulePanel'
import WebhookPanel from '../components/WebhookPanel'
import { useRotation } from '../hooks/useRotation'
import { daysUntil } from '../lib/format'
import { forgetRotation, getDisplayName, rememberRotation, setDisplayName } from '../lib/storage'

const EXPIRY_WARNING_DAYS = 30

export default function RotationPage() {
  const { token = '' } = useParams()
  const { status, apply } = useRotation(token)

  if (status.kind === 'loading') return <p className="card muted">Loading…</p>
  if (status.kind === 'missing')
    return (
      <div className="card stack">
        <h1>No rotation at this link</h1>
        <p className="muted">
          It may have been deleted, expired after inactivity, or the link was regenerated. Check with whoever shared it.
        </p>
        <Link to="/">Make a new one</Link>
      </div>
    )
  if (status.kind === 'deleted')
    return (
      <div className="card stack">
        <h1>This rotation was deleted</h1>
        <Link to="/">Back to start</Link>
      </div>
    )
  if (status.kind === 'error')
    return (
      <div className="card stack">
        <h1>Something went wrong</h1>
        <p className="error">{status.message}</p>
      </div>
    )
  return <Rotation token={token} state={status.state} apply={apply} />
}

type Pending = ((who: string) => Promise<void>) | null

function Rotation({ token, state, apply }: { token: string; state: RotationState; apply: (s: RotationState) => void }) {
  const [params, setParams] = useSearchParams()
  const isNew = params.get('new') === '1'
  const [toast, setToast] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [who, setWho] = useState<string | null>(getDisplayName)
  const canEdit = state.can_edit

  useEffect(() => {
    rememberRotation({ token, name: state.name, canEdit })
  }, [token, state.name, canEdit])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [toast])

  /** Run a mutation with the display name, prompting for one first if needed. */
  const act = useCallback(
    (fn: (who: string) => Promise<RotationState | void>): Promise<boolean> =>
      new Promise((resolve) => {
        const go = async (name: string) => {
          try {
            const result = await fn(name)
            if (result) apply(result)
            resolve(true)
          } catch (e) {
            setToast(e instanceof ApiError ? e.message : 'Could not reach the server.')
            resolve(false)
          }
        }
        if (who) void go(who)
        else
          setPending(() => async (name: string) => {
            await go(name)
          })
      }),
    [who, apply],
  )

  function onName(name: string) {
    setDisplayName(name)
    setWho(name)
    const p = pending
    setPending(null)
    if (p) void p(name)
  }

  const days = daysUntil(state.expires_at)

  return (
    <main className="stack">
      {pending && <NamePrompt initial="" onSubmit={onName} onCancel={() => setPending(null)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {isNew && state.edit_token && (
        <div className="banner">
          <strong>Save this link.</strong> It is the only way back in, and anyone who has it can edit. Share it
          with your team.
          <div className="row">
            <code className="link-url">{`${window.location.origin}/r/${state.edit_token}`}</code>
            <CopyButton text={`${window.location.origin}/r/${state.edit_token}`} label="Copy edit link" />
            <button type="button" className="btn btn-ghost small" onClick={() => setParams({})}>
              Got it
            </button>
          </div>
        </div>
      )}

      {days <= EXPIRY_WARNING_DAYS && (
        <div className="banner warn">
          Nobody has opened this rotation in a while. It is deleted after {state.ttl_days} days without a visit;{' '}
          {days <= 0 ? 'that is due any moment' : `${days} day${days === 1 ? '' : 's'} left`}. Opening it, as you just
          did, resets the clock.
        </div>
      )}

      <Header state={state} canEdit={canEdit} who={who} onRename={(n) => act((w) => api.rename(token, n, w))} onChangeName={() => setPending(() => async () => undefined)} />

      <section className="card current-card">
        <div className="eyebrow">Current</div>
        <div className="current-name">{state.current ?? '—'}</div>
        {state.members.length > 1 && (
          <div className="muted">
            Next: {state.members[1]}
          </div>
        )}
        {canEdit && (
          <div className="row actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={state.members.length < 2}
              onClick={() => act((w) => api.advance(token, w))}
            >
              Advance
            </button>
            <button
              type="button"
              className="btn"
              disabled={state.members.length < 2}
              title="Skip the current member; they go second"
              onClick={() => act((w) => api.bump(token, w))}
            >
              Bump
            </button>
            <button
              type="button"
              className="btn"
              disabled={state.members.length === 0}
              onClick={() =>
                act(async (w) => {
                  const r = await api.random(token, w)
                  setPicked(r.member)
                  return r
                })
              }
            >
              Random pick
            </button>
          </div>
        )}
        {picked && (
          <p className="picked">
            Random pick: <strong>{picked}</strong>{' '}
            <button type="button" className="btn btn-ghost small" onClick={() => setPicked(null)}>
              Dismiss
            </button>
          </p>
        )}
      </section>

      <div className="grid">
        <MemberList
          members={state.members}
          canEdit={canEdit}
          onReorder={(m) => void act((w) => api.reorder(token, m, w))}
          onRemove={(n) => void act((w) => api.removeMember(token, n, w))}
          onAdd={(n) => act((w) => api.addMember(token, n, w))}
        />
        <div className="stack">
          <SchedulePanel
            schedule={state.schedule}
            paused={state.schedule_paused}
            nextFireAt={state.next_fire_at}
            canEdit={canEdit}
            onSave={(s: Schedule) => act((w) => api.setSchedule(token, s, w))}
            onClear={() => void act((w) => api.clearSchedule(token, w))}
            onPause={(p) => void act((w) => api.setPaused(token, p, w))}
          />
          <WebhookPanel
            url={state.webhook_url}
            hasWebhook={state.has_webhook}
            canEdit={canEdit}
            onSave={(u) => act((w) => api.setWebhook(token, u, w))}
            onClear={() => void act((w) => api.clearWebhook(token, w))}
          />
        </div>
      </div>

      <LinksPanel
        editToken={state.edit_token}
        viewToken={state.view_token}
        canEdit={canEdit}
        onRegenerate={(which) =>
          void act(async (w) => {
            const r = await api.regenerate(token, which, w)
            if (which === 'edit' && r.edit_token) {
              forgetRotation(token)
              window.location.replace(`/r/${r.edit_token}`)
              return
            }
            return r
          })
        }
      />

      <AuditLog token={token} version={state.version} />

      {canEdit && <DangerZone token={token} name={state.name} />}
    </main>
  )
}

function Header({
  state,
  canEdit,
  who,
  onRename,
  onChangeName,
}: {
  state: RotationState
  canEdit: boolean
  who: string | null
  onRename: (name: string) => Promise<boolean>
  onChangeName: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(state.name)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (draft.trim() && draft.trim() !== state.name) await onRename(draft.trim())
    setEditing(false)
  }

  return (
    <header className="row between wrap">
      {editing ? (
        <form className="row" onSubmit={submit}>
          <input className="input" autoFocus maxLength={80} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="btn small">
            Save
          </button>
          <button type="button" className="btn btn-ghost small" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <h1 className="row">
          {state.name}
          {canEdit && (
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => {
                setDraft(state.name)
                setEditing(true)
              }}
            >
              Rename
            </button>
          )}
          {!canEdit && <span className="badge">View only</span>}
        </h1>
      )}
      {canEdit && (
        <button type="button" className="btn btn-ghost small" onClick={onChangeName}>
          {who ? `You are ${who}` : 'Set your name'}
        </button>
      )}
    </header>
  )
}

function DangerZone({ token, name }: { token: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function del(e: FormEvent) {
    e.preventDefault()
    try {
      await api.delete(token, confirm)
      forgetRotation(token)
      window.location.assign('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.')
    }
  }

  return (
    <section className="card danger">
      <div className="row between">
        <h2>Delete rotation</h2>
        {!open && (
          <button type="button" className="btn btn-ghost small" onClick={() => setOpen(true)}>
            Delete…
          </button>
        )}
      </div>
      {open && (
        <form className="stack" onSubmit={del}>
          <p className="muted small">
            This removes the rotation and its history for everyone, immediately, with no undo. Type{' '}
            <strong>{name}</strong> to confirm.
          </p>
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={name} />
          {error && <p className="error">{error}</p>}
          <div className="row end">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-danger" disabled={confirm.trim().toLowerCase() !== name.toLowerCase()}>
              Delete forever
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
