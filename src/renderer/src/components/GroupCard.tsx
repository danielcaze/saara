import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { CaretDown, CaretRight } from '@phosphor-icons/react'
import { useDroppable } from '@dnd-kit/react'
import { motion, useReducedMotion } from 'motion/react'

import type { PhotoGroup } from '../../../shared/types'

import { DeleteConfirmModal } from './DeleteConfirmModal'
import { PhotoTile } from './PhotoTile'

interface Props {
  group: PhotoGroup
  selectedPaths: Set<string>
  onRename: (groupId: string, name: string) => void
  onRenameFile: (path: string, fileName: string) => void
  onDelete: (paths: string[]) => void
  onToggleSelect: (path: string) => void
  onOpenViewer: (path: string) => void
  dragging: {
    path: string
    groupId: string
    targetGroupId: string | null
    targetIndex: number | null
    previewPath: string | null
    previewSide: 'before' | 'after' | null
    motionVersion: number
  } | null
}

export function GroupCard({
  group,
  selectedPaths,
  onRename,
  onRenameFile,
  onDelete,
  onToggleSelect,
  onOpenViewer,
  dragging
}: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [deletePath, setDeletePath] = useState<string | null>(null)
  const [gridHeights, setGridHeights] = useState({ row: 0, full: 0 })
  const [firstRowCount, setFirstRowCount] = useState(Infinity)
  const [hasMeasuredOnce] = useState(true)
  const renameInputId = useId()
  const gridRef = useRef<HTMLDivElement>(null)
  const gridClipRef = useRef<HTMLDivElement>(null)
  const measureGridRef = useRef<() => void>(() => {})
  const shouldReduceMotion = useReducedMotion() ?? false
  const gridDrop = useDroppable({
    id: `group:${group.id}`,
    type: 'photo-group',
    accept: 'photo',
    data: { groupId: group.id, dropMode: 'append' }
  })
  const { isDropTarget: isGridDropTarget, ref: setGridDropNode } = gridDrop
  const hasActiveSelection = selectedPaths.size > 0
  const expandDistance = Math.max(0, gridHeights.full - gridHeights.row)
  const expandDuration = Math.min(0.85, 0.4 + expandDistance / 2200)
  const isHoveringClosedGroup = !expanded && dragging?.targetGroupId === group.id

  useEffect(() => {
    if (!isHoveringClosedGroup) return
    const timeout = window.setTimeout(() => {
      setExpanded(true)
      requestAnimationFrame(() => requestAnimationFrame(() => measureGridRef.current()))
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [isHoveringClosedGroup, dragging?.motionVersion])

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

  useLayoutEffect(() => {
    const element = gridRef.current
    if (!element) return
    const gridElement = element

    function measure(): void {
      const children = Array.from(gridElement.children) as HTMLElement[]
      const firstTile = children[0]
      const buffer = 7
      const gridTop = gridElement.getBoundingClientRect().top
      const firstTileBottom = firstTile?.getBoundingClientRect().bottom ?? gridTop
      setGridHeights({
        row: Math.ceil(firstTileBottom - gridTop) + buffer,
        full: Math.ceil(gridElement.scrollHeight) + buffer
      })
      const firstTop = firstTile?.getBoundingClientRect().top
      setFirstRowCount(
        firstTop === undefined
          ? Infinity
          : children.filter((child) => Math.abs(child.getBoundingClientRect().top - firstTop) < 1)
              .length
      )
    }

    measureGridRef.current = measure
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(gridElement)
    return () => observer.disconnect()
  }, [group.files.length])

  function toggleExpanded(): void {
    setExpanded((value) => !value)
    requestAnimationFrame(() => requestAnimationFrame(() => measureGridRef.current()))
  }

  return (
    <div
      className={`group-card${isGridDropTarget ? ' group-card-drop-target' : ''}`}
      data-group-id={group.id}
    >
      <div className="group-card-header">
        <button
          className="icon-button"
          onClick={toggleExpanded}
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
          onChange={(event) => onRename(group.id, event.target.value)}
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
      <div className="group-card-divider" />
      <motion.div
        ref={gridClipRef}
        className="group-card-photo-grid-clip"
        initial={false}
        animate={{ height: expanded ? gridHeights.full : gridHeights.row }}
        transition={
          !hasMeasuredOnce
            ? { duration: 0 }
            : shouldReduceMotion
              ? { duration: 0.1 }
              : { type: 'spring', bounce: 0, duration: expanded ? expandDuration : 0.4 }
        }
      >
        <div ref={setGridDropNode} className="group-card-photo-grid-drop-surface" />
        <div
          ref={(element) => {
            gridRef.current = element
          }}
          className={`group-card-photo-grid${hasActiveSelection ? ' group-card-selecting' : ''}`}
        >
          {group.files.map((file, index) => (
            <PhotoTile
              key={file.path}
              file={file}
              groupId={group.id}
              index={index}
              selected={selectedPaths.has(file.path)}
              isRenaming={renamingPath === file.path}
              inert={!expanded && index >= firstRowCount}
              dropPreviewSide={
                dragging?.targetGroupId === group.id && dragging.previewPath === file.path
                  ? dragging.previewSide
                  : null
              }
              isCollapsed={!expanded}
              closedClipRef={gridClipRef}
              onToggleSelect={onToggleSelect}
              onOpenViewer={onOpenViewer}
              onRequestDelete={setDeletePath}
              onStartRename={setRenamingPath}
              onCommitRename={handleCommitRename}
              onCancelRename={handleCancelRename}
            />
          ))}
        </div>
      </motion.div>
      <AppendDropZone
        groupId={group.id}
        visible={
          !expanded &&
          dragging?.targetGroupId === group.id &&
          dragging.groupId !== group.id &&
          group.files.length > firstRowCount
        }
      />
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

function AppendDropZone({
  groupId,
  visible
}: {
  groupId: string
  visible: boolean
}): React.JSX.Element {
  const dropZone = useDroppable({
    id: `group:${groupId}:append`,
    type: 'photo-group',
    accept: 'photo',
    data: { groupId, dropMode: 'append' }
  })
  const { isDropTarget, ref: setDropZoneNode } = dropZone

  return (
    <div
      ref={setDropZoneNode}
      className={`group-card-append-drop-zone${visible ? ' group-card-append-drop-zone-visible' : ''}${isDropTarget ? ' group-card-append-drop-zone-active' : ''}`}
    >
      Drop at end
    </div>
  )
}
