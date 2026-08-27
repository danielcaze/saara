import { useCallback, useId, useState } from 'react'
import { CaretRight, CaretDown } from '@phosphor-icons/react'

import type { PhotoGroup } from '../../../shared/types'

import { PhotoTile } from './PhotoTile'
import { DeleteConfirmModal } from './DeleteConfirmModal'

interface Props {
  group: PhotoGroup
  selectedPaths: Set<string>
  onRename: (groupId: string, name: string) => void
  onRenameFile: (path: string, fileName: string) => void
  onDelete: (paths: string[]) => void
  onToggleSelect: (path: string) => void
  onOpenViewer: (path: string) => void
  dragging: { path: string; groupId: string } | null
  onDragStart: (path: string, groupId: string) => void
  onDragEnd: () => void
  onMoveToGroup: (path: string, groupId: string) => void
  onReorder: (groupId: string, path: string, targetIndex: number) => void
}

export function GroupCard({
  group,
  selectedPaths,
  onRename,
  onRenameFile,
  onDelete,
  onToggleSelect,
  onOpenViewer,
  dragging,
  onDragStart,
  onDragEnd,
  onMoveToGroup,
  onReorder
}: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const renameInputId = useId()
  const hasActiveSelection = selectedPaths.size > 0
  const isDraggingFromThisGroup = dragging?.groupId === group.id
  const isDraggingFromAnotherGroup = dragging !== null && !isDraggingFromThisGroup
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null)
  const [isGroupDropTarget, setIsGroupDropTarget] = useState(false)
  const [deletePath, setDeletePath] = useState<string | null>(null)

  const dropIndexFor = useCallback(
    (index: number, event: React.DragEvent<HTMLElement>): number => {
      const bounds = event.currentTarget.getBoundingClientRect()
      const after = event.clientX > bounds.left + bounds.width / 2
      const rawIndex = index + (after ? 1 : 0)
      const sourceIndex = group.files.findIndex((file) => file.path === dragging?.path)
      return sourceIndex !== -1 && sourceIndex < rawIndex ? rawIndex - 1 : rawIndex
    },
    [group.files, dragging]
  )

  // Stable (only changes when the drag gesture itself starts/ends or this
  // group's own files change) so PhotoTile's memoization holds across
  // unrelated re-renders — see PhotoTile.tsx.
  const handleFileDragOver = useCallback(
    (index: number, event: React.DragEvent<HTMLElement>): void => {
      if (!isDraggingFromThisGroup) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setInsertionIndex(dropIndexFor(index, event))
    },
    [isDraggingFromThisGroup, dropIndexFor]
  )

  const handleFileDrop = useCallback(
    (index: number, event: React.DragEvent<HTMLElement>): void => {
      if (!isDraggingFromThisGroup || !dragging) return
      event.preventDefault()
      event.stopPropagation()
      onReorder(group.id, dragging.path, dropIndexFor(index, event))
      setInsertionIndex(null)
    },
    [isDraggingFromThisGroup, dragging, dropIndexFor, group.id, onReorder]
  )

  const handleCommitRename = useCallback(
    (path: string, value: string): void => {
      const trimmed = value.trim()
      if (trimmed) onRenameFile(path, trimmed)
      setRenamingPath(null)
    },
    [onRenameFile]
  )

  const handleCancelRename = useCallback((): void => {
    setRenamingPath(null)
  }, [])

  return (
    <div
      className={`group-card${isGroupDropTarget ? ' group-card-drop-target' : ''}`}
      data-group-id={group.id}
      onDragOver={(event) => {
        if (!isDraggingFromAnotherGroup) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setIsGroupDropTarget(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsGroupDropTarget(false)
      }}
      onDrop={(event) => {
        if (!isDraggingFromAnotherGroup || !dragging) return
        event.preventDefault()
        onMoveToGroup(dragging.path, group.id)
        setIsGroupDropTarget(false)
      }}
    >
      <div className="group-card-header">
        <button
          className="icon-button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse group' : 'Expand group'}
        >
          {expanded ? (
            <CaretDown size={16} aria-hidden="true" />
          ) : (
            <CaretRight size={16} aria-hidden="true" />
          )}
        </button>
        <label htmlFor={renameInputId} className="visually-hidden">
          Group name
        </label>
        <input
          id={renameInputId}
          className="field"
          value={group.name}
          onChange={(e) => onRename(group.id, e.target.value)}
        />
        <span className="tabular-nums">{group.files.length} files</span>
        <span className="tabular-nums">
          {group.isNoDateGroup
            ? 'No date'
            : group.startDate?.slice(0, 10) === group.endDate?.slice(0, 10)
              ? group.startDate?.slice(0, 10)
              : `${group.startDate?.slice(0, 10)} – ${group.endDate?.slice(0, 10)}`}
        </span>
      </div>
      <div
        className={`group-card-photo-grid${expanded ? ' group-card-photo-grid-expanded' : ' group-card-photo-grid-collapsed'}${hasActiveSelection ? ' group-card-selecting' : ''}`}
      >
        {group.files.map((f, index) => (
          <PhotoTile
            key={f.path}
            file={f}
            groupId={group.id}
            index={index}
            selected={selectedPaths.has(f.path)}
            isDragging={dragging?.path === f.path}
            insertBefore={insertionIndex === index}
            insertAfter={
              insertionIndex === group.files.length - 1 && index === group.files.length - 1
            }
            isRenaming={renamingPath === f.path}
            onToggleSelect={onToggleSelect}
            onOpenViewer={onOpenViewer}
            onRequestDelete={setDeletePath}
            onStartRename={setRenamingPath}
            onCommitRename={handleCommitRename}
            onCancelRename={handleCancelRename}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onFileDragOver={handleFileDragOver}
            onFileDrop={handleFileDrop}
          />
        ))}
      </div>
      {deletePath && (
        <DeleteConfirmModal
          paths={[deletePath]}
          onConfirm={() => {
            onDelete([deletePath])
            setDeletePath(null)
          }}
          onCancel={() => setDeletePath(null)}
        />
      )}
    </div>
  )
}
