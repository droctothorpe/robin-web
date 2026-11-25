import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState, type FormEvent } from 'react'
import { CloseIcon, GripIcon } from './Icons'

type Props = {
  members: string[]
  canEdit: boolean
  onReorder: (members: string[]) => void
  onRemove: (name: string) => void
  onAdd: (name: string) => Promise<boolean>
}

export default function MemberList({ members, canEdit, onReorder, onRemove, onAdd }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [draft, setDraft] = useState('')

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = members.indexOf(String(active.id))
    const to = members.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    onReorder(arrayMove(members, from, to))
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    if (await onAdd(name)) setDraft('')
  }

  return (
    <div className="members">
      {members.length === 0 && <p className="muted center">No one on this rotation yet.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={members} strategy={verticalListSortingStrategy}>
          <ol className="member-list">
            {members.map((m, i) => (
              <MemberRow key={m} name={m} index={i} canEdit={canEdit} onRemove={() => onRemove(m)} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {canEdit && (
        <form className="add-row" onSubmit={add}>
          <input
            className="input"
            placeholder="Add someone"
            maxLength={60}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn small" disabled={!draft.trim()}>
            Add
          </button>
        </form>
      )}
    </div>
  )
}

function MemberRow({
  name,
  index,
  canEdit,
  onRemove,
}: {
  name: string
  index: number
  canEdit: boolean
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: name,
    disabled: !canEdit,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const isCurrent = index === 0
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`member${isDragging ? ' dragging' : ''}${isCurrent ? ' current' : ''}`}
    >
      {canEdit ? (
        <button type="button" className="handle" aria-label={`Drag ${name}`} {...attributes} {...listeners}>
          <GripIcon />
        </button>
      ) : (
        <span className="handle" />
      )}
      <span className="position">{isCurrent ? 'Now' : index === 1 ? 'Next' : index + 1}</span>
      <span className="member-name">{name}</span>
      {canEdit && (
        <button type="button" className="icon-btn remove" onClick={onRemove} aria-label={`Remove ${name}`}>
          <CloseIcon size={14} />
        </button>
      )}
    </li>
  )
}
