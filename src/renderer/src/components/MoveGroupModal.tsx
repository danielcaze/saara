import { FolderPlus } from '@phosphor-icons/react'

import type { PhotoGroup } from '../../../shared/types'

import { SessionEditModal } from './SessionEditModal'

interface Props {
  groups: PhotoGroup[]
  paths: string[]
  onMove: (targetGroupId: string) => void
  onCreateGroupAndMove: () => void
  onCancel: () => void
}

export function MoveGroupModal({
  groups,
  paths,
  onMove,
  onCreateGroupAndMove,
  onCancel
}: Props): React.JSX.Element {
  const itemDescription = paths.length === 1 ? '1 file' : `${paths.length} files`

  return (
    <SessionEditModal labelledBy="move-group-title" onCancel={onCancel}>
      <h2 id="move-group-title">Move {itemDescription}</h2>
      <p className="modal-copy">Choose the group that should receive the selected files.</p>
      <div className="modal-group-list" role="list">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className="modal-group-row"
            onClick={() => onMove(group.id)}
          >
            {group.name}
          </button>
        ))}
        <button
          type="button"
          className="modal-group-row modal-new-group"
          onClick={onCreateGroupAndMove}
        >
          <FolderPlus size={18} aria-hidden="true" /> New group
        </button>
      </div>
      <div className="modal-actions">
        <button type="button" className="modal-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </SessionEditModal>
  )
}
