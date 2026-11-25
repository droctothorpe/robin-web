import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../api'
import { forgetRotation } from '../lib/storage'
import Modal from './Modal'

export default function DeleteModal({ token, name, onClose }: { token: string; name: string; onClose: () => void }) {
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function del(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.delete(token, confirm)
      forgetRotation(token)
      window.location.assign('/')
    } catch (err) {
      setBusy(false)
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.')
    }
  }

  return (
    <Modal title="Delete rotation" onClose={onClose}>
      <form className="stack" onSubmit={del}>
        <p className="muted small">
          This removes the rotation and its history for everyone, immediately, with no undo. Type{' '}
          <strong>{name}</strong> to confirm.
        </p>
        <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={name} autoFocus />
        {error && <p className="error">{error}</p>}
        <div className="row end">
          <button type="button" className="btn btn-ghost small" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-danger small"
            disabled={busy || confirm.trim().toLowerCase() !== name.toLowerCase()}
          >
            Delete forever
          </button>
        </div>
      </form>
    </Modal>
  )
}
