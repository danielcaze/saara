// src/renderer/src/screens/HomeScreen.tsx
import { useState } from 'react'
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
    deleteFiles,
    moveFiles,
    createGroupAndMoveFiles,
    startCopy,
    openViewer,
    closeViewer,
    viewerNext,
    viewerPrev,
    toggleSelect
  } = workflow
  const [activeSessionModal, setActiveSessionModal] = useState<'delete' | 'move' | null>(null)

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
          S<span className="wordmark-accent">a</span>ara
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

      <div className="home-content">
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
            >
              {state.groups.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  selectedPaths={state.selectedPaths}
                  onRename={(name) => renameGroup(g.id, name)}
                  onRenameFile={renameFile}
                  onToggleSelect={toggleSelect}
                  onOpenViewer={openViewer}
                />
              ))}
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
                <button className="primary" onClick={() => window.saaraAPI.openDriveRoot()}>
                  <GoogleDriveLogo size={18} aria-hidden="true" /> View in Drive
                </button>
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
          onCreateGroupAndMove={() => {
            createGroupAndMoveFiles(selectedPaths)
            setActiveSessionModal(null)
          }}
          onCancel={() => setActiveSessionModal(null)}
        />
      )}
    </div>
  )
}
