import { useState, type FormEvent } from 'react'
import Modal from './Modal'

export default function NamePrompt({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial)
  function submit(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) onSubmit(name.trim())
  }
  return (
    <Modal title="What should we call you?" onClose={onCancel}>
      <form className="stack" onSubmit={submit}>
        <p className="muted">
          Your name is stamped on the history so teammates can see who changed what. It stays in this browser and
          is not verified.
        </p>
        <input
          className="input"
          autoFocus
          maxLength={40}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="row end">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            Continue
          </button>
        </div>
      </form>
    </Modal>
  )
}
