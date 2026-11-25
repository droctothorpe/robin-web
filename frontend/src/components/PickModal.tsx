import Modal from './Modal'

export default function PickModal({ member, onClose }: { member: string; onClose: () => void }) {
  return (
    <Modal title="Random pick" onClose={onClose}>
      <div className="pick-result">{member}</div>
      <div className="row end">
        <button type="button" className="btn btn-primary small" onClick={onClose} autoFocus>
          Done
        </button>
      </div>
    </Modal>
  )
}
