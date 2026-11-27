import { useState } from 'react'
import { DiceIcon } from './Icons'
import Modal from './Modal'

export default function PickModal({
  member,
  onReroll,
  onClose,
}: {
  member: string
  onReroll: () => Promise<unknown>
  onClose: () => void
}) {
  const [rolling, setRolling] = useState(false)
  async function reroll() {
    setRolling(true)
    try {
      await onReroll()
    } finally {
      setRolling(false)
    }
  }
  return (
    <Modal title="Random pick" onClose={onClose}>
      {/* Keyed on the name so a new pick re-runs the entrance animation. */}
      <div className="pick-result" key={member}>
        {member}
      </div>
      <div className="row end">
        <button
          type="button"
          className="btn small reroll"
          onClick={reroll}
          disabled={rolling}
          aria-label="Pick again"
          title="Pick again"
        >
          <DiceIcon size={16} />
        </button>
        <button type="button" className="btn btn-primary small" onClick={onClose} autoFocus>
          Done
        </button>
      </div>
    </Modal>
  )
}
