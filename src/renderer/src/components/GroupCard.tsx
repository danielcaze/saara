import { useId, useState } from 'react'
import {
  CaretRight,
  CaretDown,
  CheckSquare,
  DotsSixVertical,
  PencilSimple,
  Square
} from '@phosphor-icons/react'

import type { PhotoGroup } from '../../../shared/types'

import { Thumbnail } from './Thumbnail'

interface Props {
  group: PhotoGroup
  selectedPaths: Set<string>
  onRename: (name: string) => void
  onRenameFile: (path: string, fileName: string) => void
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
  const [renameValue, setRenameValue] = useState('')
  const renameInputId = useId()
  const hasActiveSelection = selectedPaths.size > 0
  const isDraggingFromThisGroup = dragging?.groupId === group.id
  const isDraggingFromAnotherGroup = dragging !== null && !isDraggingFromThisGroup
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null)
  const [isGroupDropTarget, setIsGroupDropTarget] = useState(false)

  function dragHandle(path: string, fileName: string): React.JSX.Element {
    return (
      <button
        type="button"
        className="drag-handle"
        draggable
        aria-label={`Drag ${fileName}`}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', path)
          onDragStart(path, group.id)
        }}
        onDragEnd={onDragEnd}
      >
        <DotsSixVertical size={16} aria-hidden="true" />
      </button>
    )
  }

  function dropIndexFor(index: number, event: React.DragEvent<HTMLElement>): number {
    const bounds = event.currentTarget.getBoundingClientRect()
    const after = event.clientX > bounds.left + bounds.width / 2
    const rawIndex = index + (after ? 1 : 0)
    const sourceIndex = group.files.findIndex((file) => file.path === dragging?.path)
    return sourceIndex !== -1 && sourceIndex < rawIndex ? rawIndex - 1 : rawIndex
  }

  function handleFileDragOver(index: number, event: React.DragEvent<HTMLElement>): void {
    if (!isDraggingFromThisGroup) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setInsertionIndex(dropIndexFor(index, event))
  }

  function handleFileDrop(index: number, event: React.DragEvent<HTMLElement>): void {
    if (!isDraggingFromThisGroup || !dragging) return
    event.preventDefault()
    event.stopPropagation()
    onReorder(group.id, dragging.path, dropIndexFor(index, event))
    setInsertionIndex(null)
  }

  function selectButton(path: string, fileName: string): React.JSX.Element {
    const selected = selectedPaths.has(path)

    return (
      <button
        type="button"
        className="thumb-select"
        aria-pressed={selected}
        aria-label={selected ? `Deselect ${fileName}` : `Select ${fileName}`}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect(path)
        }}
      >
        {selected ? (
          <CheckSquare size={16} weight="fill" aria-hidden="true" />
        ) : (
          <Square size={16} aria-hidden="true" />
        )}
      </button>
    )
  }

  function startFileRename(path: string, fileName: string): void {
    setRenameValue(fileName)
    setRenamingPath(path)
  }

  function commitFileRename(path: string): void {
    const trimmed = renameValue.trim()
    if (trimmed) onRenameFile(path, trimmed)
    setRenamingPath(null)
  }

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
          onChange={(e) => onRename(e.target.value)}
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
      <div className={`group-card-thumbs${hasActiveSelection ? ' group-card-selecting' : ''}`}>
        {group.files.slice(0, 6).map((f, index) => (
          <div
            key={f.path}
            className={`thumb-wrap${selectedPaths.has(f.path) ? ' thumb-wrap-selected' : ''}${dragging?.path === f.path ? ' thumb-wrap-dragging' : ''}${insertionIndex === index ? ' thumb-wrap-insert-before' : ''}${insertionIndex === group.files.length - 1 && index === group.files.length - 1 ? ' thumb-wrap-insert-after' : ''}`}
            onDragOver={(event) => handleFileDragOver(index, event)}
            onDrop={(event) => handleFileDrop(index, event)}
          >
            {dragHandle(f.path, f.fileName)}
            {selectButton(f.path, f.fileName)}
            <button
              type="button"
              className="thumb-open"
              onClick={() => onOpenViewer(f.path)}
              aria-label={`Open ${f.fileName}`}
            >
              <Thumbnail path={f.path} mediaType={f.mediaType} />
            </button>
          </div>
        ))}
      </div>
      {expanded && (
        <ul className="group-card-file-list">
          {group.files.map((f, index) => (
            <li
              key={f.path}
              className={`group-card-file-row${dragging?.path === f.path ? ' group-card-file-row-dragging' : ''}${insertionIndex === index ? ' group-card-file-row-insert-before' : ''}${insertionIndex === group.files.length - 1 && index === group.files.length - 1 ? ' group-card-file-row-insert-after' : ''}`}
              onDragOver={(event) => handleFileDragOver(index, event)}
              onDrop={(event) => handleFileDrop(index, event)}
            >
              {dragHandle(f.path, f.fileName)}
              {selectButton(f.path, f.fileName)}
              {renamingPath === f.path ? (
                <input
                  className="field group-card-file-rename"
                  autoFocus
                  aria-label={`Rename ${f.fileName}`}
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitFileRename(f.path)
                    if (event.key === 'Escape') setRenamingPath(null)
                  }}
                  onBlur={() => commitFileRename(f.path)}
                />
              ) : (
                <button
                  type="button"
                  className="group-card-file-name"
                  onClick={() => onOpenViewer(f.path)}
                >
                  {f.fileName} {f.metadataError ? `(error: ${f.metadataError})` : ''}
                </button>
              )}
              <button
                type="button"
                className="icon-button group-card-file-rename-btn"
                aria-label={`Rename ${f.fileName}`}
                onClick={() => startFileRename(f.path, f.fileName)}
              >
                <PencilSimple size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
