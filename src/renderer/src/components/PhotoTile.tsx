import { memo, type RefObject, useCallback, useState } from 'react'
import { CheckSquare, PencilSimple, Square, Trash } from '@phosphor-icons/react'
import { defaultCollisionDetection, type CollisionDetector } from '@dnd-kit/collision'
import { SortableKeyboardPlugin } from '@dnd-kit/dom/sortable'
import { useSortable } from '@dnd-kit/react/sortable'

import type { FileMeta } from '../../../shared/types'

import { Thumbnail } from './Thumbnail'

// dnd-kit's OptimisticSortingPlugin physically reorders DOM nodes while a
// pointer drag is active. React owns this grid, so that mutation corrupts its
// child bookkeeping when a cross-group drop later re-parents a tile.
const sortablePlugins = [SortableKeyboardPlugin]

interface Props {
  file: FileMeta
  groupId: string
  index: number
  selected: boolean
  isRenaming: boolean
  inert: boolean
  dropPreviewSide: 'before' | 'after' | null
  isCollapsed: boolean
  closedClipRef: RefObject<HTMLDivElement | null>
  onToggleSelect: (path: string) => void
  onOpenViewer: (path: string) => void
  onRequestDelete: (path: string) => void
  onStartRename: (path: string) => void
  onCommitRename: (path: string, value: string) => void
  onCancelRename: () => void
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
  isRenaming,
  inert,
  dropPreviewSide,
  isCollapsed,
  closedClipRef,
  onToggleSelect,
  onOpenViewer,
  onRequestDelete,
  onStartRename,
  onCommitRename,
  onCancelRename
}: Props): React.JSX.Element {
  const [renameValue, setRenameValue] = useState(file.fileName)
  const collisionDetector = useCallback<CollisionDetector>(
    (input) => {
      const clip = closedClipRef.current
      const tile = (input.droppable as { element?: Element }).element
      if (isCollapsed && clip && tile) {
        const clipBounds = clip.getBoundingClientRect()
        const tileBounds = tile.getBoundingClientRect()
        if (tileBounds.bottom <= clipBounds.top || tileBounds.top >= clipBounds.bottom) return null
      }
      return defaultCollisionDetection(input)
    },
    [closedClipRef, isCollapsed]
  )
  const sortable = useSortable({
    id: file.path,
    index,
    group: groupId,
    type: 'photo',
    accept: 'photo',
    plugins: sortablePlugins,
    data: { groupId, index, path: file.path },
    collisionDetector,
    transition: { duration: 220, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }
  })
  const { handleRef: setDragHandle, isDragging, ref: setSortableNode } = sortable

  function beginRename(): void {
    setRenameValue(file.fileName)
    onStartRename(file.path)
  }

  return (
    <div
      ref={setSortableNode}
      className={`group-card-photo-tile${selected ? ' group-card-photo-tile-selected' : ''}${isDragging ? ' group-card-photo-tile-dragging' : ''}${dropPreviewSide ? ` group-card-photo-tile-drop-preview-${dropPreviewSide}` : ''}`}
      data-path={file.path}
      // Collapsed rows past the first are still in the DOM (height-clipped,
      // not removed) so the collapse animation has real content to grow
      // from — inert pulls them out of tab order so Tab can't walk into a
      // row the user can't see.
      inert={inert || undefined}
    >
      <div className="group-card-photo-image">
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
          ref={setDragHandle}
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
