// src/renderer/src/screens/HomeScreen.tsx
import { AnimatePresence, motion } from 'motion/react'
import { FolderOpen, FolderPlus, Gear, CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { Dropzone } from '../components/Dropzone'
import { GroupCard } from '../components/GroupCard'
import { ProgressBar } from '../components/ProgressBar'
import type { useImportWorkflow } from '../hooks/useImportWorkflow'

const PHASE_LABELS: Record<string, string> = {
  scanning: 'Scanning files',
  'reading-metadata': 'Reading metadata',
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
    renameGroup,
    startCopy
  } = workflow

  const totalFiles = state.groups.reduce((sum, g) => sum + g.files.length, 0)
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
  const boxesDisabled = state.copying

  return (
    <div className="home-screen">
      <div className="screen-header">
        <h1 className="wordmark" style={{ marginRight: 'auto' }}>
          Saara
        </h1>
        <button className="icon-button" onClick={onOpenSettings}>
          <Gear size={18} />
        </button>
      </div>

      <div className="dropzone-row">
        <Dropzone
          label="Source"
          hint="Drop folder or click to browse"
          icon={<FolderOpen size={28} />}
          path={state.sourcePath}
          onPick={pickSource}
          onDropPath={dropSource}
          disabled={boxesDisabled}
        />
        <Dropzone
          label="Destination"
          hint="Drop folder or click to browse"
          icon={<FolderPlus size={28} />}
          path={state.destinationPath}
          onPick={pickDestination}
          onDropPath={dropDestination}
          disabled={boxesDisabled}
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
                <GroupCard key={g.id} group={g} onRename={(name) => renameGroup(g.id, name)} />
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
              <h1>Copying files…</h1>
              {state.copyProgress && (
                <>
                  <p>
                    {state.copyProgress.groupName}: {state.copyProgress.fileName}
                  </p>
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
                <CheckCircle size={22} /> Copy complete
              </h1>
              <p className="tabular-nums">
                {state.copySummary.copiedFiles}/{state.copySummary.totalFiles} files copied
              </p>
              {state.copySummary.conflicts.length > 0 && (
                <p>
                  <WarningCircle size={16} /> {state.copySummary.conflicts.length} name conflicts
                  resolved (renamed, nothing overwritten)
                </p>
              )}
              {state.copySummary.errors.length > 0 && (
                <p>
                  <WarningCircle size={16} /> {state.copySummary.errors.length} files failed to copy
                </p>
              )}
              <button
                className="primary"
                disabled={!state.destinationPath}
                onClick={() =>
                  state.destinationPath && window.saaraAPI.openPath(state.destinationPath)
                }
              >
                <FolderOpen size={18} /> Open destination folder
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {subView === 'reviewing' && (
        <div className="sticky-footer">
          <span className="tabular-nums field-value">
            {state.groups.length} groups, {totalFiles} files
          </span>
          <button className="primary" disabled={!state.destinationPath} onClick={startCopy}>
            Confirm &amp; Copy
          </button>
        </div>
      )}
    </div>
  )
}
