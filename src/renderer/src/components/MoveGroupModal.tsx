import { useState } from 'react'
import { FolderPlus, PencilSimple } from '@phosphor-icons/react'

import type { PhotoGroup } from '../../../shared/types'

import { SessionEditModal } from './SessionEditModal'

interface Props {
  groups: PhotoGroup[]
  paths: string[]
  onMove: (targetGroupId: string) => void
  onCreateGroupAndMove: (name: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onCancel: () => void
}

export function MoveGroupModal({
  groups,
  paths,
  onMove,
  onCreateGroupAndMove,
  onRenameGroup,
  onCancel
}: Props): React.JSX.Element {
  const itemDescription = paths.length === 1 ? '1 file' : `${paths.length} files`
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [newGroupName, setNewGroupName] = useState('New group')

  function startRename(group: PhotoGroup): void {
    setRenameValue(group.name)
    setRenamingGroupId(group.id)
  }

  function commitRename(groupId: string): void {
    const trimmed = renameValue.trim()
    if (trimmed) onRenameGroup(groupId, trimmed)
    setRenamingGroupId(null)
  }

  function startCreateNew(): void {
    setNewGroupName('New group')
    setCreatingNew(true)
  }

  function commitCreateNew(): void {
    onCreateGroupAndMove(newGroupName.trim() || 'New group')
    setCreatingNew(false)
  }

  return (
    <SessionEditModal labelledBy="move-group-title" onCancel={onCancel}>
      <h2 id="move-group-title">Move {itemDescription}</h2>
      <p className="modal-copy">Choose the group that should receive the selected files.</p>
      <div className="modal-group-list" role="list">
        {groups.map((group) =>
          renamingGroupId === group.id ? (
            <input
              key={group.id}
              className="field modal-group-rename"
              autoFocus
              aria-label={`Rename ${group.name}`}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(group.id)
                if (e.key === 'Escape') setRenamingGroupId(null)
              }}
              onBlur={() => commitRename(group.id)}
            />
          ) : (
            <div key={group.id} className="modal-group-row">
              <button type="button" className="modal-group-row-name" onClick={() => onMove(group.id)}>
                {group.name}
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Rename ${group.name}`}
                onClick={() => startRename(group)}
              >
                <PencilSimple size={16} aria-hidden="true" />
              </button>
            </div>
          )
        )}
        {creatingNew ? (
          <div className="modal-new-group-form">
            <input
              className="field"
              autoFocus
              aria-label="New group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCreateNew()
                if (e.key === 'Escape') setCreatingNew(false)
              }}
            />
            <button type="button" className="modal-secondary" onClick={commitCreateNew}>
              Create
            </button>
          </div>
        ) : (
          <button type="button" className="modal-group-row modal-new-group" onClick={startCreateNew}>
            <FolderPlus size={18} aria-hidden="true" /> New group
          </button>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="modal-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </SessionEditModal>
  )
}
