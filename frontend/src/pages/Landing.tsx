import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import { parseMembers, relativeTime } from '../lib/format'
import { useIdentity } from '../identity'
import { forgetRotation, getSavedRotations, rememberRotation, setDisplayName } from '../lib/storage'

export default function Landing() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [membersText, setMembersText] = useState('')
  const identity = useIdentity()
  const [who, setWho] = useState(() => identity.who ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(getSavedRotations)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (who.trim()) setDisplayName(who)
      const r = await api.create(name, parseMembers(membersText), who.trim() || null)
      rememberRotation({ token: r.edit_token!, name: r.name, canEdit: true })
      navigate(`/r/${r.edit_token}?new=1`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="stack landing">
      <section className="hero">
        <h1>Distribute work equitably and transparently</h1>
        <p className="muted">
          Create a rotation. Share it. The link is the password. Round robin or select randomly. Advance
          manually or on a schedule. Webhook support for notifications.
        </p>
      </section>

      <form className="card stack" onSubmit={submit}>
        <h2>New rotation</h2>
        <label>
          Name
          <input
            className="input"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label>
          Members, one per line, in turn order
          <textarea
            className="input"
            rows={5}
            value={membersText}
            onChange={(e) => setMembersText(e.target.value)}
          />
        </label>
        <label>
          Your name, for the history (optional, stays in this browser)
          <input className="input" maxLength={40} value={who} onChange={(e) => setWho(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row end">
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create rotation'}
          </button>
        </div>
      </form>

      {saved.length > 0 && (
        <section className="card">
          <h2>Your rotations</h2>
          <p className="muted small">Remembered by this browser only. Keep the links somewhere safe too.</p>
          <ul className="saved">
            {saved.map((r) => (
              <li key={r.token}>
                <Link to={`/r/${r.token}`}>{r.name}</Link>
                <span className="muted small">
                  {r.canEdit ? 'edit link' : 'view link'} · opened {relativeTime(r.savedAt)}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost small"
                  onClick={() => setSaved(forgetRotation(r.token))}
                  aria-label={`Forget ${r.name}`}
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="muted small how">
        <h3>How it works</h3>
        <ul>
          <li>The edit link is the only key. Anyone who has it can change the rotation. Share the view link more freely.</li>
          <li>Every change is recorded with the name the person gave themselves, so the history is a memory aid, not a security log.</li>
          <li>Rotations nobody opens for 180 days are deleted.</li>
        </ul>
      </section>
    </main>
  )
}
