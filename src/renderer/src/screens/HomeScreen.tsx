// src/renderer/src/screens/HomeScreen.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DragDropProvider,
  DragOverlay,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  useDroppable
} from '@dnd-kit/react'
import { isSortable } from '@dnd-kit/react/sortable'
import { PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom'
import { AnimatePresence, motion } from 'motion/react'
import { flushSync } from 'react-dom'
import {
  FolderOpen,
  FolderPlus,
  Gear,
  CheckCircle,
  WarningCircle,
  GoogleDriveLogo,
  FolderSimple,
  Trash,
  X,
  CaretLeft
} from '@phosphor-icons/react'
import { DeleteConfirmModal } from '../components/DeleteConfirmModal'
import { Dropzone } from '../components/Dropzone'
import { GroupCard } from '../components/GroupCard'
import { MoveGroupModal } from '../components/MoveGroupModal'
import { Lightbox } from '../components/Lightbox'
import { ProgressBar } from '../components/ProgressBar'
import { Thumbnail } from '../components/Thumbnail'
import type { useImportWorkflow } from '../hooks/useImportWorkflow'
import saaraLogo from '../assets/saara-logo.png'

const PHASE_LABELS: Record<string, string> = {
  scanning: 'Scanning files',
  'reading-metadata': 'Analyzing files',
  clustering: 'Grouping'
}

interface DraggingPhoto {
  path: string
  paths: string[]
  groupId: string
  targetGroupId: string | null
  targetIndex: number | null
  previewPath: string | null
  previewSide: 'before' | 'after' | null
  motionVersion: number
}

interface GridTile {
  element: HTMLElement
  rect: DOMRect
}

interface GridInsertion {
  index: number
  previewPath: string | null
  previewSide: 'before' | 'after' | null
}

interface SelectionBox {
  startX: number
  startY: number
  endX: number
  endY: number
}

/**
 * Converts the pointer position into an insertion index for the responsive
 * CSS grid. Group-level droppables intentionally cover the grid's gaps, so
 * their generic "append" data is not precise enough on its own.
 */
function insertionIndexAtPointer(
  groupId: string,
  point: { x: number; y: number },
  excludedPaths: Set<string>
): GridInsertion | null {
  const card = Array.from(document.querySelectorAll<HTMLElement>('[data-group-id]')).find(
    (element) => element.dataset.groupId === groupId
  )
  const grid = card?.querySelector<HTMLElement>('.group-card-photo-grid')
  const clip = card?.querySelector<HTMLElement>('.group-card-photo-grid-clip')
  if (!grid || !clip) return null

  const clipBounds = clip.getBoundingClientRect()
  const tiles: GridTile[] = Array.from(
    grid.querySelectorAll<HTMLElement>(':scope > .group-card-photo-tile')
  )
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    // Collapsed cards keep later rows mounted for their expand animation. They
    // are not valid destinations until the card has opened.
    .filter(({ rect }) => rect.bottom > clipBounds.top && rect.top < clipBounds.bottom)
    .filter(({ element }) => !excludedPaths.has(element.dataset.path ?? ''))

  if (tiles.length === 0) return { index: 0, previewPath: null, previewSide: null }

  const rows: GridTile[][] = []
  for (const tile of tiles) {
    const row = rows.at(-1)
    if (row && Math.abs(row[0].rect.top - tile.rect.top) < 1) row.push(tile)
    else rows.push([tile])
  }

  const row =
    rows.find((candidate, index) => {
      const next = rows[index + 1]
      return !next || point.y < (candidate[0].rect.bottom + next[0].rect.top) / 2
    }) ?? rows.at(-1)!
  const before = row.find((tile) => point.x < tile.rect.left + tile.rect.width / 2)
  if (before) {
    return {
      index: tiles.indexOf(before),
      previewPath: before.element.dataset.path ?? null,
      previewSide: 'before'
    }
  }
  const last = row.at(-1)!
  return {
    index: tiles.indexOf(last) + 1,
    previewPath: last.element.dataset.path ?? null,
    previewSide: 'after'
  }
}

interface Props {
  workflow: ReturnType<typeof useImportWorkflow>
  onOpenSettings: () => void
}

export function HomeScreen({ workflow, onOpenSettings }: Props): React.JSX.Element {
  const {
    state,
    pickSource,
    dropSource,
    removeSource,
    pickDestination,
    dropDestination,
    toggleDestinationType,
    connectDrive,
    renameGroup,
    renameFile,
    clearSelection,
    setSelectionPaths,
    selectPaths,
    deleteFiles,
    moveFiles,
    moveFileToIndex,
    moveFilesToIndex,
    reorderFiles,
    createGroupAndMoveFiles,
    startCopy,
    openViewer,
    closeViewer,
    viewerNext,
    viewerPrev,
    toggleSelect
  } = workflow
  const [activeSessionModal, setActiveSessionModal] = useState<'delete' | 'move' | null>(null)
  const [copiedGroupFolderId, setCopiedGroupFolderId] = useState<string | null>(null)
  const [focusedGroupId, setFocusedGroupId] = useState<string | null>(null)
  const [dragging, setDragging] = useState<DraggingPhoto | null>(null)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [selectionHoveringGroupId, setSelectionHoveringGroupId] = useState<string | null>(null)
  const [selectionExpandGroupId, setSelectionExpandGroupId] = useState<string | null>(null)
  const [isShiftHeld, setIsShiftHeld] = useState(false)
  const lastDragPositionRef = useRef<{ x: number; y: number } | null>(null)
  const selectionBoxRef = useRef<SelectionBox | null>(null)
  const selectionPointerRef = useRef<{ x: number; y: number } | null>(null)
  const selectionStartPathsRef = useRef<Set<string> | null>(null)
  const homeContentRef = useRef<HTMLDivElement>(null)

  const totalFiles = state.groups.reduce((sum, g) => sum + g.files.length, 0)
  const selectedPaths = Array.from(state.selectedPaths)
  const hasSelection = selectedPaths.length > 0
  const draggingFile = dragging
    ? state.groups.flatMap((group) => group.files).find((file) => file.path === dragging.path)
    : null
  const draggingPath = dragging?.path
  const subView = state.copySummary
    ? 'done'
    : state.copying
      ? 'copying'
      : state.analyzeError
        ? 'error'
        : state.analyzeProgress
          ? 'analyzing'
          : state.groups.length > 0
            ? 'reviewing'
            : 'empty'
  // Source locks once picked (removable only via its X badge, which also
  // cancels an in-flight analyze) — re-selecting mid-analyze would leave the
  // worker analyzing a folder no longer reflected on screen. Destination has
  // no such hazard: picking it doesn't touch the source's analyze, and
  // nothing consumes it until a copy actually starts, so it only locks once
  // a copy is running.
  const sourceDisabled = state.copying
  const sourceLocked = !state.copying && !!state.sourcePath
  const destinationDisabled = state.copying
  const isDrive = state.destinationType === 'drive'

  useEffect(() => {
    if (!draggingPath) return
    let frame: number | null = null
    const markMotion = (): void => {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        setDragging((current) =>
          current ? { ...current, motionVersion: current.motionVersion + 1 } : current
        )
      })
    }
    // Capture catches scrolling containers as well as the page itself. A
    // closed group must only open after the pointer and its surroundings have
    // both been still for the full hover delay.
    window.addEventListener('scroll', markMotion, true)
    return () => {
      window.removeEventListener('scroll', markMotion, true)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [draggingPath])

  useEffect(() => {
    if (!copiedGroupFolderId) return
    const timeout = window.setTimeout(() => setCopiedGroupFolderId(null), 2000)
    return () => window.clearTimeout(timeout)
  }, [copiedGroupFolderId])

  async function copyDriveGroupLink(folderId: string): Promise<void> {
    const link = await window.saaraAPI.shareDriveGroup(folderId)
    await navigator.clipboard.writeText(link)
    setCopiedGroupFolderId(folderId)
  }

  useEffect(() => {
    if (subView !== 'reviewing') return

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && state.selectedPaths.size > 0) {
        e.preventDefault()
        clearSelection()
        return
      }
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      e.preventDefault()
      // Ctrl/Cmd+A selects everything visible in the last-clicked group when
      // one is active, and every file across every group otherwise — so it
      // does what you'd expect whether you're scoped into a folder or
      // looking at the whole session.
      const focusedGroup = focusedGroupId ? state.groups.find((g) => g.id === focusedGroupId) : null
      const paths = focusedGroup
        ? focusedGroup.files.map((f) => f.path)
        : state.groups.flatMap((g) => g.files.map((f) => f.path))
      selectPaths(paths)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [subView, state.groups, state.selectedPaths.size, selectPaths, clearSelection, focusedGroupId])

  useEffect(() => {
    const setShiftFromKeyboard = (event: KeyboardEvent): void => {
      if (event.key === 'Shift') setIsShiftHeld(event.type === 'keydown')
    }
    const clearShift = (): void => setIsShiftHeld(false)
    window.addEventListener('keydown', setShiftFromKeyboard)
    window.addEventListener('keyup', setShiftFromKeyboard)
    window.addEventListener('blur', clearShift)
    return () => {
      window.removeEventListener('keydown', setShiftFromKeyboard)
      window.removeEventListener('keyup', setShiftFromKeyboard)
      window.removeEventListener('blur', clearShift)
    }
  }, [])

  const handleDragStart = useCallback(
    ({ operation }: DragStartEvent): void => {
      const source = operation.source
      if (!isSortable(source)) return
      const path = String(source.id)
      const modifier = operation.activatorEvent as { ctrlKey?: boolean; metaKey?: boolean } | null
      const isBatch = Boolean(
        (modifier?.ctrlKey || modifier?.metaKey) && state.selectedPaths.has(path)
      )
      const paths = isBatch
        ? state.groups
            .flatMap((group) => group.files.map((file) => file.path))
            .filter((candidate) => state.selectedPaths.has(candidate))
        : [path]
      lastDragPositionRef.current = null
      // dnd-kit starts collision collection immediately after this callback.
      // Commit the visual/droppable state in the same turn so the new-group
      // target and insertion indicators exist throughout the drag, not only
      // once cleanup lets React flush deferred work.
      flushSync(() => {
        setDragging({
          path,
          paths,
          groupId: String(source.initialGroup),
          targetGroupId: String(source.initialGroup),
          targetIndex: null,
          previewPath: null,
          previewSide: null,
          motionVersion: 0
        })
      })
    },
    [state.groups, state.selectedPaths]
  )

  const updateDragPreview = useCallback(
    (operation: DragOverEvent['operation']): void => {
      const position = operation.position.current
      const previousPosition = lastDragPositionRef.current
      const pointerMoved =
        previousPosition === null ||
        previousPosition.x !== position.x ||
        previousPosition.y !== position.y
      lastDragPositionRef.current = { x: position.x, y: position.y }
      const target = operation.target
      const targetGroupId =
        target && typeof target === 'object' && 'data' in target
          ? ((target.data as { groupId?: string }).groupId ?? null)
          : null
      const targetData =
        target && typeof target === 'object' && 'data' in target
          ? (target.data as { dropMode?: string })
          : null
      const source = operation.source
      const sourceGroupId = source && isSortable(source) ? String(source.initialGroup) : null
      const insertion =
        targetData?.dropMode !== 'append' && targetGroupId && sourceGroupId && source
          ? insertionIndexAtPointer(
              targetGroupId,
              operation.position.current,
              new Set(dragging?.paths ?? [String(source.id)])
            )
          : null
      setDragging((current) => {
        if (!current) return current
        if (
          current.targetGroupId === targetGroupId &&
          current.targetIndex === insertion?.index &&
          current.previewPath === insertion?.previewPath &&
          current.previewSide === insertion?.previewSide &&
          !pointerMoved
        )
          return current
        return {
          ...current,
          targetGroupId,
          targetIndex: insertion?.index ?? null,
          previewPath: insertion?.previewPath ?? null,
          previewSide: insertion?.previewSide ?? null,
          motionVersion: pointerMoved ? current.motionVersion + 1 : current.motionVersion
        }
      })
    },
    [dragging?.paths]
  )

  const handleDragOver = useCallback(
    ({ operation }: DragOverEvent): void => updateDragPreview(operation),
    [updateDragPreview]
  )

  // Drag-over only fires when dnd-kit changes the hovered entity. Recompute on
  // every move as well, so crossing a tile's midpoint immediately flips the
  // insertion bar from its left side to its right side.
  const handleDragMove = useCallback(
    ({ operation }: DragMoveEvent): void => updateDragPreview(operation),
    [updateDragPreview]
  )

  const handleDragEnd = useCallback(
    ({ canceled, operation }: DragEndEvent, manager): void => {
      const source = operation.source
      const target = operation.target
      lastDragPositionRef.current = null

      const runAfterDragCleanup = (callback: () => void): void => {
        const waitForIdle = (): void => {
          if (!manager.dragOperation.status.idle) {
            requestAnimationFrame(waitForIdle)
            return
          }
          callback()
        }
        requestAnimationFrame(waitForIdle)
      }

      if (
        canceled ||
        !isSortable(source) ||
        !target ||
        typeof target !== 'object' ||
        !('data' in target)
      ) {
        runAfterDragCleanup(() => setDragging(null))
        return
      }

      const targetData = target.data as { groupId?: string; dropMode?: string; index?: number }
      const sourceGroupId = String(source.initialGroup)
      const paths = dragging?.paths ?? [String(source.id)]
      const targetGroupId = targetData.groupId
      if (targetData.dropMode === 'new') {
        runAfterDragCleanup(() => {
          setDragging(null)
          createGroupAndMoveFiles(paths)
        })
        return
      }
      if (!targetGroupId) {
        runAfterDragCleanup(() => setDragging(null))
        return
      }

      const insertion =
        targetData.dropMode === 'append'
          ? null
          : insertionIndexAtPointer(targetGroupId, operation.position.current, new Set(paths))
      const targetIndex =
        insertion?.index ??
        (targetData.dropMode === 'append'
          ? Math.max(
              0,
              (state.groups.find((group) => group.id === targetGroupId)?.files.length ?? 0) -
                (state.groups
                  .find((group) => group.id === targetGroupId)
                  ?.files.filter((file) => paths.includes(file.path)).length ?? 0)
            )
          : (targetData.index ?? 0))

      const applyDrop = (): void => {
        if (paths.length === 1 && sourceGroupId === targetGroupId) {
          reorderFiles(sourceGroupId, String(source.id), targetIndex)
        } else if (paths.length > 1) {
          moveFilesToIndex(paths, targetGroupId, targetIndex)
        } else {
          moveFileToIndex(String(source.id), targetGroupId, targetIndex)
        }
      }

      runAfterDragCleanup(() => {
        setDragging(null)
        // `useDeepSignal` schedules its final React update in a microtask
        // after the manager reports idle. Cross-group movement unmounts the
        // source sortable, so give that final library render one paint before
        // React re-parents the tile.
        requestAnimationFrame(applyDrop)
      })
    },
    [
      createGroupAndMoveFiles,
      dragging?.paths,
      moveFileToIndex,
      moveFilesToIndex,
      reorderFiles,
      state.groups
    ]
  )

  const selectIntersectingTiles = useCallback(
    (box: SelectionBox): void => {
      const left = Math.min(box.startX, box.endX)
      const right = Math.max(box.startX, box.endX)
      const top = Math.min(box.startY, box.endY)
      const bottom = Math.max(box.startY, box.endY)
      const paths = Array.from(document.querySelectorAll<HTMLElement>('.group-card-photo-tile'))
        .filter((tile) => {
          const rect = tile.getBoundingClientRect()
          const clip = tile
            .closest<HTMLElement>('.group-card-photo-grid-clip')
            ?.getBoundingClientRect()
          return (
            !!clip &&
            rect.bottom > clip.top &&
            rect.top < clip.bottom &&
            rect.right >= left &&
            rect.left <= right &&
            rect.bottom >= top &&
            rect.top <= bottom
          )
        })
        .map((tile) => tile.dataset.path)
        .filter((path): path is string => Boolean(path))
      const preserved = selectionStartPathsRef.current ?? new Set<string>()
      setSelectionPaths([...new Set([...preserved, ...paths])])
    },
    [setSelectionPaths]
  )

  const handleSelectionPointerDown = useCallback(
    (event: PointerEvent): void => {
      if (subView !== 'reviewing' || !event.shiftKey || event.button !== 0) return
      const scrollable = (event.target as HTMLElement).closest<HTMLElement>('.home-content')
      if (
        scrollable &&
        event.clientX >=
          scrollable.getBoundingClientRect().right -
            (scrollable.offsetWidth - scrollable.clientWidth)
      ) {
        return
      }
      event.stopPropagation()
      document.getElementById('root')?.classList.add('root-shift-selecting')
      const box = {
        startX: event.clientX,
        startY: event.clientY,
        endX: event.clientX,
        endY: event.clientY
      }
      selectionBoxRef.current = box
      selectionPointerRef.current = { x: event.clientX, y: event.clientY }
      selectionStartPathsRef.current = new Set(state.selectedPaths)

      const onMove = (move: PointerEvent): void => {
        const current = selectionBoxRef.current
        if (!current) return
        if (Math.hypot(move.clientX - current.startX, move.clientY - current.startY) < 6) {
          return
        }
        // This is now a marquee, not the browser's text/drag selection.
        move.preventDefault()
        const next = { ...current, endX: move.clientX, endY: move.clientY }
        selectionBoxRef.current = next
        selectionPointerRef.current = { x: move.clientX, y: move.clientY }
        setSelectionBox(next)
        selectIntersectingTiles(next)
        const card = document
          .elementFromPoint(move.clientX, move.clientY)
          ?.closest<HTMLElement>('[data-group-id]')
        setSelectionHoveringGroupId(card?.dataset.groupId ?? null)
      }
      const onUp = (): void => {
        document.getElementById('root')?.classList.remove('root-shift-selecting')
        selectionBoxRef.current = null
        selectionPointerRef.current = null
        selectionStartPathsRef.current = null
        setSelectionBox(null)
        setSelectionHoveringGroupId(null)
        setSelectionExpandGroupId(null)
        window.removeEventListener('pointermove', onMove)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp, { once: true })
    },
    [selectIntersectingTiles, state.selectedPaths, subView]
  )

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    root.addEventListener('pointerdown', handleSelectionPointerDown, true)
    return () => root.removeEventListener('pointerdown', handleSelectionPointerDown, true)
  }, [handleSelectionPointerDown])

  useEffect(() => {
    if (subView !== 'reviewing') return
    const root = document.getElementById('root')
    if (!root) return
    const redirectWheel = (event: WheelEvent): void => {
      const scroller = homeContentRef.current
      const target = event.target as HTMLElement
      if (!scroller || target.closest('.home-content, input, textarea, select')) return
      event.preventDefault()
      scroller.scrollBy({ top: event.deltaY, left: event.deltaX })
    }
    root.addEventListener('wheel', redirectWheel, { capture: true, passive: false })
    return () => root.removeEventListener('wheel', redirectWheel, true)
  }, [subView])

  useEffect(() => {
    if (!selectionHoveringGroupId || !selectionBox) return
    const timeout = window.setTimeout(() => {
      setSelectionExpandGroupId(selectionHoveringGroupId)
      window.setTimeout(() => {
        const current = selectionBoxRef.current
        if (current) selectIntersectingTiles(current)
      }, 450)
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [selectionBox, selectionHoveringGroupId, selectIntersectingTiles])

  useEffect(() => {
    if (!selectionBox) return
    let frame = 0
    const tick = (): void => {
      const point = selectionPointerRef.current
      if (!point) return
      const scroller = homeContentRef.current
      if (!scroller) return
      const bounds =
        document.getElementById('root')?.getBoundingClientRect() ?? scroller.getBoundingClientRect()
      const edge = 52
      const distance =
        point.y < bounds.top + edge
          ? point.y - (bounds.top + edge)
          : point.y > bounds.bottom - edge
            ? point.y - (bounds.bottom - edge)
            : 0
      if (distance) {
        const scrollTop = scroller.scrollTop
        scroller.scrollBy({
          top: Math.sign(distance) * Math.ceil((Math.abs(distance) / edge) * 18)
        })
        const current = selectionBoxRef.current
        if (current) {
          // The anchor belongs to the scrolling content, not the viewport.
          // Keep it glued to its original photo while auto-scroll moves that
          // photo under the pointer.
          const next = { ...current, startY: current.startY - (scroller.scrollTop - scrollTop) }
          selectionBoxRef.current = next
          setSelectionBox(next)
          selectIntersectingTiles(next)
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [selectionBox, selectIntersectingTiles])

  const handleRenameGroup = useCallback(
    (groupId: string, name: string): void => {
      renameGroup(groupId, name)
    },
    [renameGroup]
  )

  const destinationReady = isDrive ? state.driveStatus.connected : !!state.destinationPath

  const driveBody = isDrive ? (
    <>
      <FolderPlus size={28} aria-hidden="true" />
      <span className="dropzone-label">Destination</span>
      <div className="drive-destination-status">
        {state.driveStatus.connected ? (
          <span className="dropzone-path">{state.driveStatus.email}</span>
        ) : state.driveError ? (
          <span className="field-error">{state.driveError}</span>
        ) : (
          <button
            type="button"
            className="field-button"
            disabled={state.driveConnecting}
            onClick={(e) => {
              e.stopPropagation()
              void connectDrive()
            }}
          >
            {state.driveConnecting ? 'Connecting…' : 'Connect Google Drive'}
          </button>
        )}
      </div>
    </>
  ) : undefined

  return (
    <div
      className={`home-screen${isShiftHeld && subView === 'reviewing' ? ' home-screen-selection-mode' : ''}`}
    >
      <div className="screen-header">
        <h1 className="wordmark" style={{ marginRight: 'auto' }}>
          <img src={saaraLogo} alt="Saara" className="wordmark-logo" />
        </h1>
        <button
          className="icon-button"
          onClick={onOpenSettings}
          disabled={state.copying}
          aria-label="Settings"
        >
          <Gear size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="dropzone-row">
        <Dropzone
          label="Source"
          hint="Drop folder or click to browse"
          icon={<FolderOpen size={28} aria-hidden="true" />}
          path={state.sourcePath}
          onPick={pickSource}
          onDropPath={dropSource}
          disabled={sourceDisabled}
          locked={sourceLocked}
          cornerButton={
            state.sourcePath && !state.copying
              ? {
                  icon: <X size={16} aria-hidden="true" />,
                  label: 'Remove source folder',
                  onClick: removeSource
                }
              : undefined
          }
        />
        <Dropzone
          label="Destination"
          hint="Drop folder or click to browse"
          icon={<FolderPlus size={28} aria-hidden="true" />}
          path={state.destinationPath}
          onPick={pickDestination}
          onDropPath={dropDestination}
          disabled={destinationDisabled}
          overrideBody={driveBody}
          cornerButton={{
            icon: isDrive ? (
              <FolderOpen size={16} aria-hidden="true" />
            ) : (
              <GoogleDriveLogo size={16} aria-hidden="true" />
            ),
            label: isDrive ? 'Switch to a local folder' : 'Switch to Google Drive',
            onClick: toggleDestinationType
          }}
        />
      </div>

      <div ref={homeContentRef} className="home-content">
        <AnimatePresence mode="wait">
          {subView === 'empty' && (
            <motion.p
              key="empty"
              className="field-value"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              Drop or select a source folder to get started.
            </motion.p>
          )}

          {subView === 'analyzing' && state.analyzeProgress && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <p>{PHASE_LABELS[state.analyzeProgress.phase] ?? state.analyzeProgress.phase}</p>
              <p className="tabular-nums">
                {state.analyzeProgress.current}/{state.analyzeProgress.total}
              </p>
            </motion.div>
          )}

          {subView === 'error' && (
            <motion.p
              key="error"
              className="field-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {state.analyzeError}
            </motion.p>
          )}

          {subView === 'reviewing' && (
            <DragDropProvider
              sensors={(defaults) => [
                ...defaults.filter((sensor) => sensor !== PointerSensor),
                PointerSensor.configure({
                  activationConstraints: [new PointerActivationConstraints.Distance({ value: 6 })]
                })
              ]}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
            >
              <motion.div
                key="reviewing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => {
                  const card = (e.target as HTMLElement).closest<HTMLElement>('[data-group-id]')
                  setFocusedGroupId(card?.dataset.groupId ?? null)
                }}
              >
                {state.groups.map((g) => (
                  <GroupCard
                    key={g.id}
                    group={g}
                    selectedPaths={state.selectedPaths}
                    onRename={handleRenameGroup}
                    onRenameFile={renameFile}
                    onDelete={deleteFiles}
                    onToggleSelect={toggleSelect}
                    onOpenViewer={(path, event) => {
                      if (event.ctrlKey || event.metaKey) toggleSelect(path)
                      else openViewer(path)
                    }}
                    selectionExpand={selectionExpandGroupId === g.id}
                    showLocalOrder={
                      state.destinationType === 'local' && state.prefixCopiedFileNames
                    }
                    dragging={dragging}
                  />
                ))}
                <NewGroupDropTile visible={Boolean(dragging)} />
                <DragOverlay className="group-card-drag-overlay" dropAnimation={null}>
                  {() =>
                    draggingFile && (
                      <div className="group-card-drag-overlay-preview">
                        {(dragging?.paths ?? []).slice(0, 3).map((path, index) => {
                          const file = state.groups
                            .flatMap((group) => group.files)
                            .find((entry) => entry.path === path)
                          return file ? (
                            <div
                              className="group-card-drag-overlay-stack"
                              style={{ '--stack-index': index } as React.CSSProperties}
                              key={path}
                            >
                              <Thumbnail path={file.path} mediaType={file.mediaType} />
                            </div>
                          ) : null
                        })}
                      </div>
                    )
                  }
                </DragOverlay>
                {selectionBox && (
                  <div
                    className="photo-selection-rectangle"
                    style={{
                      left: Math.min(selectionBox.startX, selectionBox.endX),
                      top: Math.min(selectionBox.startY, selectionBox.endY),
                      width: Math.abs(selectionBox.endX - selectionBox.startX),
                      height: Math.abs(selectionBox.endY - selectionBox.startY)
                    }}
                  />
                )}
              </motion.div>
            </DragDropProvider>
          )}

          {subView === 'copying' && (
            <motion.div
              key="copying"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <h1>{isDrive ? 'Uploading to Drive…' : 'Copying files…'}</h1>
              {state.copyProgress && (
                <>
                  {state.copyProgress.status === 'paused' ? (
                    <p className="field-error">
                      <WarningCircle size={16} aria-hidden="true" /> Paused — waiting for
                      connection…
                    </p>
                  ) : (
                    <p>
                      {state.copyProgress.groupName}: {state.copyProgress.fileName}
                    </p>
                  )}
                  <ProgressBar
                    current={state.copyProgress.filesCopiedSoFar}
                    total={state.copyProgress.totalFiles}
                  />
                </>
              )}
            </motion.div>
          )}

          {subView === 'done' && state.copySummary && (
            <motion.div
              key="done"
              className="copy-done-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <h1 className="copy-done-heading">
                <button
                  type="button"
                  className="icon-button"
                  onClick={removeSource}
                  aria-label="Back to home"
                >
                  <CaretLeft size={18} aria-hidden="true" />
                </button>
                <span>{isDrive ? 'Upload complete' : 'Copy complete'}</span>
                <CheckCircle size={22} aria-hidden="true" />
              </h1>
              <p className="tabular-nums">
                {state.copySummary.copiedFiles}/{state.copySummary.totalFiles} files{' '}
                {isDrive ? 'uploaded' : 'copied'}
                {state.copySummary.skippedFiles > 0 &&
                  ` (${state.copySummary.skippedFiles} already there, skipped)`}
              </p>
              {state.copySummary.conflicts.length > 0 && (
                <p>
                  <WarningCircle size={16} aria-hidden="true" />{' '}
                  {state.copySummary.conflicts.length} name conflicts resolved (renamed, nothing
                  overwritten)
                </p>
              )}
              {state.copySummary.errors.length > 0 && (
                <p>
                  <WarningCircle size={16} aria-hidden="true" /> {state.copySummary.errors.length}{' '}
                  files failed to {isDrive ? 'upload' : 'copy'}
                </p>
              )}
              {isDrive ? (
                <div className="drive-complete-actions">
                  <button className="primary" onClick={() => window.saaraAPI.openDriveRoot()}>
                    <GoogleDriveLogo size={18} aria-hidden="true" /> View in Drive
                  </button>
                  {(state.copySummary.driveGroups?.length ?? 0) > 0 && (
                    <div className="drive-group-links">
                      {state.copySummary.driveGroups?.map((group) => (
                        <div className="drive-group-link-row" key={group.groupId}>
                          <span>{group.groupName}</span>
                          <button
                            type="button"
                            className="modal-secondary"
                            onClick={() => copyDriveGroupLink(group.folderId)}
                          >
                            {copiedGroupFolderId === group.folderId ? 'Copied!' : 'Copy link'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="copy-done-action">
                  <button
                    className="primary"
                    disabled={!state.destinationPath}
                    onClick={() =>
                      state.destinationPath && window.saaraAPI.openPath(state.destinationPath)
                    }
                  >
                    <FolderOpen size={18} aria-hidden="true" /> Open destination folder
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {subView === 'reviewing' && (
        <div className="sticky-footer">
          <AnimatePresence mode="wait" initial={false}>
            {hasSelection ? (
              <motion.div
                key="selection-actions"
                className="sticky-footer-content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
              >
                <span className="tabular-nums field-value">{selectedPaths.length} selected</span>
                <div className="selection-actions">
                  <button type="button" className="modal-secondary" onClick={clearSelection}>
                    <X size={16} aria-hidden="true" /> Clear selection
                  </button>
                  <button
                    type="button"
                    className="modal-secondary"
                    onClick={() => setActiveSessionModal('delete')}
                  >
                    <Trash size={16} aria-hidden="true" /> Delete
                  </button>
                  <button
                    type="button"
                    className="modal-secondary"
                    onClick={() => setActiveSessionModal('move')}
                  >
                    <FolderSimple size={16} aria-hidden="true" /> Move
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={!destinationReady}
                    onClick={() => startCopy(selectedPaths)}
                  >
                    {isDrive ? 'Upload selected photos' : 'Copy selected photos'}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="copy-actions"
                className="sticky-footer-content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
              >
                <span className="tabular-nums field-value">
                  {state.groups.length} groups, {totalFiles} files
                </span>
                {!destinationReady && (
                  <span className="field-error">
                    {isDrive
                      ? 'Connect Google Drive to continue'
                      : 'Select a destination folder to continue'}
                  </span>
                )}
                {state.copyError && <span className="field-error">{state.copyError}</span>}
                <button
                  className="primary"
                  disabled={!destinationReady}
                  onClick={() => void startCopy()}
                >
                  {isDrive ? 'Confirm & Upload' : 'Confirm & Copy'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {state.viewerIndex !== null && (
        <Lightbox
          groups={state.groups}
          index={state.viewerIndex}
          selectedPaths={state.selectedPaths}
          onClose={closeViewer}
          onPrev={viewerPrev}
          onNext={viewerNext}
          onToggleSelect={toggleSelect}
          onDelete={deleteFiles}
          onMove={moveFiles}
          onCreateGroupAndMove={createGroupAndMoveFiles}
          onRenameGroup={renameGroup}
          onRename={renameFile}
        />
      )}

      {activeSessionModal === 'delete' && (
        <DeleteConfirmModal
          paths={selectedPaths}
          onConfirm={() => {
            deleteFiles(selectedPaths)
            setActiveSessionModal(null)
          }}
          onCancel={() => setActiveSessionModal(null)}
        />
      )}

      {activeSessionModal === 'move' && (
        <MoveGroupModal
          groups={state.groups}
          paths={selectedPaths}
          onMove={(targetGroupId) => {
            moveFiles(selectedPaths, targetGroupId)
            setActiveSessionModal(null)
          }}
          onCreateGroupAndMove={(name) => {
            createGroupAndMoveFiles(selectedPaths, name)
            setActiveSessionModal(null)
          }}
          onRenameGroup={renameGroup}
          onCancel={() => setActiveSessionModal(null)}
        />
      )}
    </div>
  )
}

function NewGroupDropTile({ visible }: { visible: boolean }): React.JSX.Element {
  const dropZone = useDroppable({
    id: 'new-group',
    type: 'new-group',
    accept: 'photo',
    data: { dropMode: 'new' }
  })
  const { isDropTarget, ref: setDropZoneNode } = dropZone

  return (
    <div
      ref={setDropZoneNode}
      className={`new-group-drop-tile${visible ? ' new-group-drop-tile-visible' : ''}${isDropTarget ? ' new-group-drop-tile-active' : ''}`}
    >
      <FolderPlus size={22} aria-hidden="true" />
      <span>New group</span>
    </div>
  )
}
