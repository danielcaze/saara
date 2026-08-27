import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { CaretRight, CaretDown } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'

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
  const gridRef = useRef<HTMLDivElement>(null)
  const measureGridRef = useRef<() => void>(() => {})
  const [gridHeights, setGridHeights] = useState({ row: 0, full: 0 })
  // How many tiles sit in the first visual row — everything past this index
  // gets `inert` while collapsed, below (see PhotoTile), so Tab can't reach
  // a row that's only clipped out of view, not actually gone.
  const [firstRowCount, setFirstRowCount] = useState(Infinity)
  // Starts false so the very first real measurement (0 -> actual height,
  // right after mount) snaps in instantly instead of springing up from 0 —
  // without this every group loads with its first row visibly growing into
  // place, sometimes caught mid-animation with the filenames half-rendered.
  const [hasMeasuredOnce, setHasMeasuredOnce] = useState(false)
  const shouldReduceMotion = useReducedMotion() ?? false
  // A fixed duration made a 221-file group snap open just as fast as a
  // 2-row one — the distance covered (one row -> the full stack) varies by
  // orders of magnitude, so the response time has to scale with it too.
  // Closing is always one row -> the same fixed distance, so it stays fixed.
  const expandDistance = Math.max(0, gridHeights.full - gridHeights.row)
  const expandDuration = Math.min(0.85, 0.4 + expandDistance / 2200)

  useEffect(() => {
    setHasMeasuredOnce(true)
  }, [])
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

  // Drives the collapse/expand animation below — the grid itself is never
  // height-constrained, so scrollHeight always reports its true full height,
  // and the first tile's own rendered height gives the "one row" target,
  // both re-measured whenever the column count could change (file list edits
  // or the card resizing).
  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return

    function measure(): void {
      const children = Array.from(el?.children ?? []) as HTMLElement[]
      const firstTile = children[0]
      // Safety margin on top of the ceil rounding — 4px still clipped the
      // last row in devtools; 7px clears it without over-padding the row.
      const BUFFER = 7
      // Measured from the grid's own top (not the tile's own height) so the
      // grid's padding-top — reserved for row 1's focus-outline bleed room,
      // see theme.css — counts as part of the collapsed row height instead
      // of getting clipped off along with it.
      const gridTop = el?.getBoundingClientRect().top ?? 0
      const firstTileBottom = firstTile?.getBoundingClientRect().bottom ?? gridTop
      setGridHeights({
        row: Math.ceil(firstTileBottom - gridTop) + BUFFER,
        full: Math.ceil(el?.scrollHeight ?? 0) + BUFFER
      })
      const firstTop = firstTile?.getBoundingClientRect().top
      setFirstRowCount(
        firstTop === undefined
          ? Infinity
          : children.filter((c) => Math.abs(c.getBoundingClientRect().top - firstTop) < 1).length
      )
    }
    measureGridRef.current = measure

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [group.files.length])

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
          onClick={() => {
            setExpanded((v) => !v)
            // The ResizeObserver only re-measures when the grid's own box
            // changes — it won't catch a reflow that lands a frame or two
            // after this click (e.g. a sibling layout settling), so the
            // very first open could target a stale "full" height and clip
            // the last row. Double rAF re-measures once that settling is
            // done, after this render and the next paint.
            requestAnimationFrame(() => requestAnimationFrame(() => measureGridRef.current()))
          }}
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
      <div className="group-card-divider" />
      <motion.div
        className="group-card-photo-grid-clip"
        initial={false}
        // Both targets are measured the same way (scrollHeight/rect + the
        // same +4px buffer) and re-measured right on toggle (see the click
        // handler). Using Motion's 'auto' for expand read the *unbuffered*
        // true height, which didn't match the buffered collapsed height —
        // a single-row group visibly grew a few px on open even though
        // there was nothing new to reveal. Two numbers from the same
        // measurement basis stay consistent instead.
        animate={{ height: expanded ? gridHeights.full : gridHeights.row }}
        transition={
          !hasMeasuredOnce
            ? { duration: 0 }
            : shouldReduceMotion
              ? { duration: 0.1 }
              : // Collapsed height is exactly one row, so there's nothing peeking
                // out below it — a fade mask there only ate into row 1's own
                // filenames. Opening's duration scales with distance (see
                // expandDuration above); closing is always the same
                // distance (full -> one row), so it keeps a fixed response.
                { type: 'spring', bounce: 0, duration: expanded ? expandDuration : 0.4 }
        }
      >
        <div
          ref={gridRef}
          className={`group-card-photo-grid${hasActiveSelection ? ' group-card-selecting' : ''}`}
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
              inert={!expanded && index >= firstRowCount}
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
      </motion.div>
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
