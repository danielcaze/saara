// src/renderer/src/screens/HomeScreen.tsx
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  FolderOpen,
  FolderPlus,
  Gear,
  CheckCircle,
  WarningCircle,
  GoogleDriveLogo,
  FolderSimple,
  Trash,
  X
} from '@phosphor-icons/react'
import { DeleteConfirmModal } from '../components/DeleteConfirmModal'
import { Dropzone } from '../components/Dropzone'
import { GroupCard } from '../components/GroupCard'
import { MoveGroupModal } from '../components/MoveGroupModal'
import { Lightbox } from '../components/Lightbox'
import { ProgressBar } from '../components/ProgressBar'
import type { useImportWorkflow } from '../hooks/useImportWorkflow'
import saaraLogo from '../assets/saara-logo.png'

const PHASE_LABELS: Record<string, string> = {
  scanning: 'Scanning files',
  'reading-metadata': 'Analyzing files',
  clustering: 'Grouping'
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
    pickDestination,
    dropDestination,
    toggleDestinationType,
    connectDrive,
    renameGroup,
    renameFile,
    clearSelection,
    selectPaths,
    deleteFiles,
    moveFiles,
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
  const [dragging, setDragging] = useState<{ path: string; groupId: string } | null>(null)
  const homeContentRef = useRef<HTMLDivElement>(null)
  const dragPointerY = useRef<number | null>(null)

  const totalFiles = state.groups.reduce((sum, g) => sum + g.files.length, 0)
  const selectedPaths = Array.from(state.selectedPaths)
  const hasSelection = selectedPaths.length > 0
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
  const boxesDisabled = state.copying || !!state.analyzeProgress
  const isDrive = state.destinationType === 'drive'

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
  }, [subView, state.groups, selectPaths, focusedGroupId])

  useEffect(() => {
    if (!dragging) return

    let frameId = 0
    const edgeSize = 72
    const maxStep = 18

    function autoScroll(): void {
      const container = homeContentRef.current
      const pointerY = dragPointerY.current
      if (container && pointerY !== null) {
        const bounds = container.getBoundingClientRect()
        const topDistance = pointerY - bounds.top
        const bottomDistance = bounds.bottom - pointerY
        const topStep =
          topDistance >= 0 && topDistance < edgeSize ? -maxStep * (1 - topDistance / edgeSize) : 0
        const bottomStep =
          bottomDistance >= 0 && bottomDistance < edgeSize
            ? maxStep * (1 - bottomDistance / edgeSize)
            : 0
        container.scrollTop += topStep || bottomStep
      }
      frameId = requestAnimationFrame(autoScroll)
    }

    frameId = requestAnimationFrame(autoScroll)
    return () => cancelAnimationFrame(frameId)
  }, [dragging])

  function endDrag(): void {
    dragPointerY.current = null
    setDragging(null)
  }

  const destinationReady = isDrive ? state.driveStatus.connected : !!state.destinationPath

  const driveBody = isDrive ? (
    <>
      <FolderPlus size={28} aria-hidden="true" />
      <span className="dropzone-label">Destination</span>
      {state.driveStatus.connected ? (
        <span className="dropzone-path">{state.driveStatus.email}</span>
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
      {state.driveError && <span className="field-error">{state.driveError}</span>}
    </>
  ) : undefined

  return (
    <div className="home-screen">
      <div className="screen-header">
        <h1 className="wordmark" style={{ marginRight: 'auto' }}>
          <img src={saaraLogo} alt="Saara" className="wordmark-logo" />
        </h1>
        <button
          className="icon-button"
          onClick={onOpenSettings}
          disabled={boxesDisabled}
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
          disabled={boxesDisabled}
        />
        <Dropzone
          label="Destination"
          hint="Drop folder or click to browse"
          icon={<FolderPlus size={28} aria-hidden="true" />}
          path={state.destinationPath}
          onPick={pickDestination}
          onDropPath={dropDestination}
          disabled={boxesDisabled}
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

      <div
        ref={homeContentRef}
        className="home-content"
        onDragOver={(event) => {
          if (dragging) dragPointerY.current = event.clientY
        }}
      >
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
                  onRename={(name) => renameGroup(g.id, name)}
                  onRenameFile={renameFile}
                  onDelete={deleteFiles}
                  onToggleSelect={toggleSelect}
                  onOpenViewer={openViewer}
                  dragging={dragging}
                  onDragStart={(path, groupId) => setDragging({ path, groupId })}
                  onDragEnd={endDrag}
                  onMoveToGroup={(path, groupId) => {
                    moveFiles([path], groupId)
                    endDrag()
                  }}
                  onReorder={(groupId, path, targetIndex) => {
                    reorderFiles(groupId, path, targetIndex)
                    endDrag()
                  }}
                />
              ))}
              {dragging && (
                <motion.div
                  className="new-group-drop-tile"
                  initial={{ opacity: 0, scale: 0.98, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: 6 }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    event.currentTarget.classList.add('new-group-drop-tile-active')
                  }}
                  onDragLeave={(event) =>
                    event.currentTarget.classList.remove('new-group-drop-tile-active')
                  }
                  onDrop={(event) => {
                    event.preventDefault()
                    createGroupAndMoveFiles([dragging.path])
                    endDrag()
                  }}
                >
                  <FolderPlus size={22} aria-hidden="true" />
                  <span>New group</span>
                </motion.div>
              )}
            </motion.div>
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <h1>
                <CheckCircle size={22} aria-hidden="true" />{' '}
                {isDrive ? 'Upload complete' : 'Copy complete'}
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
                <button
                  className="primary"
                  disabled={!state.destinationPath}
                  onClick={() =>
                    state.destinationPath && window.saaraAPI.openPath(state.destinationPath)
                  }
                >
                  <FolderOpen size={18} aria-hidden="true" /> Open destination folder
                </button>
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
                  <button type="button" className="modal-secondary" onClick={clearSelection}>
                    <X size={16} aria-hidden="true" /> Clear selection
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
                <button className="primary" disabled={!destinationReady} onClick={startCopy}>
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
