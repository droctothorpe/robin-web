import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError, type RotationState, type Schedule } from '../api'
import { useApi } from '../apiContext'
import AuditLog from '../components/AuditLog'
import CopyButton from '../components/CopyButton'
import DeleteModal from '../components/DeleteModal'
import Disclosure from '../components/Disclosure'
import { ShareIcon, TrashIcon } from '../components/Icons'
import MemberList from '../components/MemberList'
import PickModal from '../components/PickModal'
import SchedulePanel from '../components/SchedulePanel'
import ShareModal from '../components/ShareModal'
import WebhookPanel from '../components/WebhookPanel'
import { useRotation } from '../hooks/useRotation'
import { daysUntil } from '../lib/format'
import { useIdentity } from '../identity'
import { forgetRotation, rememberRotation } from '../lib/storage'

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

export function Rotation({
  token,
  state,
  apply,
  demo = false,
}: {
  token: string
  state: RotationState
  apply: (s: RotationState) => void
  /** The sample on /demo: nothing is remembered, and no name is asked for. */
  demo?: boolean
}) {
  const api = useApi()
  const [params, setParams] = useSearchParams()
  const isNew = params.get('new') === '1'
  const [toast, setToast] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { who, requireName } = useIdentity()
  const canEdit = state.can_edit

  useEffect(() => {
    if (!demo) rememberRotation({ token, name: state.name, canEdit })
  }, [token, state.name, canEdit, demo])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [toast])

  /** Run a mutation with the display name, prompting for one first if needed. */
  const act = useCallback(
    async (fn: (who: string) => Promise<RotationState | void>): Promise<boolean> => {
      const name = demo ? (who ?? 'You') : await requireName()
      if (!name) return false
      try {
        const result = await fn(name)
        if (result) apply(result)
        return true
      } catch (e) {
        setToast(e instanceof ApiError ? e.message : 'Could not reach the server.')
        return false
      }
    },
    [requireName, apply, demo, who],
  )

  const days = daysUntil(state.expires_at)
  const editUrl = state.edit_token ? `${window.location.origin}/r/${state.edit_token}` : null

  return (
    <main className="rotation">
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
      {deleting && canEdit && <DeleteModal token={token} name={state.name} onClose={() => setDeleting(false)} />}
      {picked && <PickModal member={picked} onClose={() => setPicked(null)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {demo && (
        <div className="banner">
          <div>
            <strong>This is a sample rotation.</strong> Try anything. Changes stay in this tab and vanish on reload.
          </div>
          <Link to="/new" className="btn btn-primary small">
            Make your own
          </Link>
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
        onRename={(n) => act((w) => api.rename(token, n, w))}
        onShare={() => setSharing(true)}
        onDelete={() => setDeleting(true)}
      />

      <section className="board">
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
            <div className="actions-side">
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
                disabled={!state.can_undo}
                title="Put back whoever was up before the last Advance or Skip"
                onClick={() => act((w) => api.undo(token, w))}
              >
                Undo
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
          </div>
        )}
        <MemberList
          members={state.members}
          canEdit={canEdit}
          onReorder={(m) => void act((w) => api.reorder(token, m, w))}
          onRemove={(n) => void act((w) => api.removeMember(token, n, w))}
          onAdd={(n) => act((w) => api.addMember(token, n, w))}
        />
      </section>

      <Disclosure title="Advanced">
        <div className="settings">
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
      </Disclosure>

      <AuditLog token={token} version={state.version} />

    </main>
  )
}

function Header({
  state,
  canEdit,
  onRename,
  onShare,
  onDelete,
}: {
  state: RotationState
  canEdit: boolean
  onRename: (name: string) => Promise<boolean>
  onShare: () => void
  onDelete: () => void
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
        {!canEdit && <div className="muted small">View only</div>}
      </div>
      <div className="head-actions">
        {canEdit && (
          <button type="button" className="icon-btn share trash" onClick={onDelete} aria-label="Delete rotation" title="Delete rotation">
            <TrashIcon />
          </button>
        )}
        <button type="button" className="icon-btn share" onClick={onShare} aria-label="Share" title="Share">
          <ShareIcon />
        </button>
      </div>
    </header>
  )
}
