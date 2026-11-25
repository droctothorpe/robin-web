import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError, type RotationState, type Schedule } from '../api'
import AuditLog from '../components/AuditLog'
import CopyButton from '../components/CopyButton'
import { ShareIcon } from '../components/Icons'
import MemberList from '../components/MemberList'
import NamePrompt from '../components/NamePrompt'
import SchedulePanel from '../components/SchedulePanel'
import ShareModal from '../components/ShareModal'
import WebhookPanel from '../components/WebhookPanel'
import { useRotation } from '../hooks/useRotation'
import { daysUntil } from '../lib/format'
import { forgetRotation, getDisplayName, rememberRotation, setDisplayName } from '../lib/storage'

const EXPIRY_WARNING_DAYS = 30

export default function RotationPage() {
  const { token = '' } = useParams()
  const { status, apply } = useRotation(token)

  if (status.kind === 'loading') return <p className="muted center">Loading…</p>
  if (status.kind === 'missing')
    return (
      <div className="empty">
        <h1>No rotation at this link</h1>
        <p className="muted">
          It may have been deleted, expired after inactivity, or the link was regenerated. Check with whoever
          shared it.
        </p>
        <Link to="/">Make a new one</Link>
      </div>
    )
  if (status.kind === 'deleted')
    return (
      <div className="empty">
        <h1>This rotation was deleted</h1>
        <Link to="/">Back to start</Link>
      </div>
    )
  if (status.kind === 'error')
    return (
      <div className="empty">
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
  const [sharing, setSharing] = useState(false)
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
  const editUrl = state.edit_token ? `${window.location.origin}/r/${state.edit_token}` : null

  return (
    <main className="rotation">
      {pending && <NamePrompt initial="" onSubmit={onName} onCancel={() => setPending(null)} />}
      {sharing && (
        <ShareModal
          editToken={state.edit_token}
          viewToken={state.view_token}
          canEdit={canEdit}
          onClose={() => setSharing(false)}
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
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {isNew && editUrl && (
        <div className="banner">
          <div>
            <strong>Save this link.</strong> It is the only way back in. Share it with your team.
          </div>
          <div className="row">
            <CopyButton text={editUrl} label="Copy edit link" className="btn btn-primary small" />
            <button type="button" className="btn btn-ghost small" onClick={() => setParams({})}>
              Got it
            </button>
          </div>
        </div>
      )}

      {days <= EXPIRY_WARNING_DAYS && (
        <div className="banner warn">
          Nobody had opened this rotation in a while. It is deleted after {state.ttl_days} days without a visit.
          Your visit just reset the clock.
        </div>
      )}

      <Header
        state={state}
        canEdit={canEdit}
        who={who}
        onRename={(n) => act((w) => api.rename(token, n, w))}
        onChangeName={() => setPending(() => async () => undefined)}
        onShare={() => setSharing(true)}
      />

      <section className="board">
        <MemberList
          members={state.members}
          canEdit={canEdit}
          onReorder={(m) => void act((w) => api.reorder(token, m, w))}
          onRemove={(n) => void act((w) => api.removeMember(token, n, w))}
          onAdd={(n) => act((w) => api.addMember(token, n, w))}
        />
        {canEdit && (
          <div className="actions">
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
              title="Skip whoever is up now; they go next instead"
              onClick={() => act((w) => api.bump(token, w))}
            >
              Skip
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
              Random
            </button>
          </div>
        )}
        {picked && (
          <p className="picked">
            Random pick: <strong>{picked}</strong>
            <button type="button" className="btn btn-ghost small" onClick={() => setPicked(null)}>
              Dismiss
            </button>
          </p>
        )}
      </section>

      <section className="settings">
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
      </section>

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
  onShare,
}: {
  state: RotationState
  canEdit: boolean
  who: string | null
  onRename: (name: string) => Promise<boolean>
  onChangeName: () => void
  onShare: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(state.name)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (draft.trim() && draft.trim() !== state.name) await onRename(draft.trim())
    setEditing(false)
  }

  return (
    <header className="rotation-head">
      <div className="title-wrap">
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
          <h1
            className={canEdit ? 'editable' : ''}
            title={canEdit ? 'Click to rename' : undefined}
            onClick={
              canEdit
                ? () => {
                    setDraft(state.name)
                    setEditing(true)
                  }
                : undefined
            }
          >
            {state.name}
          </h1>
        )}
        <div className="muted small">
          {canEdit ? (
            <button type="button" className="link-action" onClick={onChangeName}>
              {who ? `You are ${who}` : 'Set your name'}
            </button>
          ) : (
            'View only'
          )}
        </div>
      </div>
      <button type="button" className="icon-btn share" onClick={onShare} aria-label="Share">
        <ShareIcon />
      </button>
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
    <section className="danger-zone">
      {!open ? (
        <button type="button" className="link-action danger-text" onClick={() => setOpen(true)}>
          Delete this rotation
        </button>
      ) : (
        <form className="setting-form" onSubmit={del}>
          <p className="muted small">
            This removes the rotation and its history for everyone, immediately, with no undo. Type{' '}
            <strong>{name}</strong> to confirm.
          </p>
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={name} autoFocus />
          {error && <p className="error">{error}</p>}
          <div className="row end">
            <button type="button" className="btn btn-ghost small" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-danger small"
              disabled={confirm.trim().toLowerCase() !== name.toLowerCase()}
            >
              Delete forever
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
