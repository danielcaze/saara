import { memo, useState } from 'react'
import { CheckSquare, DotsSixVertical, PencilSimple, Square, Trash } from '@phosphor-icons/react'

import type { FileMeta } from '../../../shared/types'

import { Thumbnail } from './Thumbnail'

interface Props {
  file: FileMeta
  groupId: string
  index: number
  selected: boolean
  isDragging: boolean
  insertBefore: boolean
  insertAfter: boolean
  isRenaming: boolean
  onToggleSelect: (path: string) => void
  onOpenViewer: (path: string) => void
  onRequestDelete: (path: string) => void
  onStartRename: (path: string) => void
  onCommitRename: (path: string, value: string) => void
  onCancelRename: () => void
  onDragStart: (path: string, groupId: string) => void
  onDragEnd: () => void
  onFileDragOver: (index: number, event: React.DragEvent<HTMLElement>) => void
  onFileDrop: (index: number, event: React.DragEvent<HTMLElement>) => void
}

// Memoized so a click that only changes selection/rename state for ONE tile
// (or a totally unrelated tile in another group) doesn't re-render every
// other tile's Thumbnail — with hundreds of files on screen, re-rendering
// the whole grid on every click was the source of the click-to-effect delay.
// This only pays off because every prop below is either a primitive or a
// reference that's stable across renders (see GroupCard/HomeScreen) — a
// fresh arrow function in any of these would defeat the memoization.
function PhotoTileImpl({
  file,
  groupId,
  index,
  selected,
  isDragging,
  insertBefore,
  insertAfter,
  isRenaming,
  onToggleSelect,
  onOpenViewer,
  onRequestDelete,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDragStart,
  onDragEnd,
  onFileDragOver,
  onFileDrop
}: Props): React.JSX.Element {
  const [renameValue, setRenameValue] = useState(file.fileName)

  function beginRename(): void {
    setRenameValue(file.fileName)
    onStartRename(file.path)
  }

  return (
    <div
      className={`group-card-photo-tile${selected ? ' group-card-photo-tile-selected' : ''}${isDragging ? ' group-card-photo-tile-dragging' : ''}${insertBefore ? ' group-card-photo-tile-insert-before' : ''}${insertAfter ? ' group-card-photo-tile-insert-after' : ''}`}
      onDragOver={(event) => onFileDragOver(index, event)}
      onDrop={(event) => onFileDrop(index, event)}
    >
      <div className="group-card-photo-image">
        <button
          type="button"
          className="drag-handle"
          draggable
          aria-label={`Drag ${file.fileName}`}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', file.path)
            onDragStart(file.path, groupId)
          }}
          onDragEnd={onDragEnd}
        >
          <DotsSixVertical size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="thumb-select"
          aria-pressed={selected}
          aria-label={selected ? `Deselect ${file.fileName}` : `Select ${file.fileName}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect(file.path)
          }}
        >
          {selected ? (
            <CheckSquare size={16} weight="fill" aria-hidden="true" />
          ) : (
            <Square size={16} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="icon-button group-card-photo-delete"
          aria-label={`Delete ${file.fileName}`}
          onClick={(event) => {
            event.stopPropagation()
            onRequestDelete(file.path)
          }}
        >
          <Trash size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="thumb-open"
          onClick={() => onOpenViewer(file.path)}
          aria-label={`Open ${file.fileName}`}
        >
          <Thumbnail path={file.path} mediaType={file.mediaType} />
        </button>
      </div>
      {isRenaming ? (
        <input
          className="field group-card-photo-rename"
          autoFocus
          aria-label={`Rename ${file.fileName}`}
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onCommitRename(file.path, renameValue)
            if (event.key === 'Escape') onCancelRename()
          }}
          onBlur={() => onCommitRename(file.path, renameValue)}
        />
      ) : (
        <button type="button" className="group-card-photo-name" onClick={beginRename}>
          <PencilSimple size={12} className="group-card-photo-name-icon" aria-hidden="true" />
          <span className="group-card-photo-name-text">
            {file.fileName} {file.metadataError ? `(error: ${file.metadataError})` : ''}
          </span>
        </button>
      )}
    </div>
  )
}

export const PhotoTile = memo(PhotoTileImpl)
