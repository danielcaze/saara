import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FolderOpen, CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { validateThresholdHours } from '../../../shared/schemas'
import { GroupCard } from '../components/GroupCard'
import { ProgressBar } from '../components/ProgressBar'
import type { useImportWorkflow } from '../hooks/useImportWorkflow'

interface Props {
  workflow: ReturnType<typeof useImportWorkflow>
}

export function ReviewScreen({ workflow }: Props): React.JSX.Element {
  const { state, recluster, renameGroup, startCopy } = workflow
  const [thresholdError, setThresholdError] = useState<string | null>(null)

  function handleThresholdChange(value: number): void {
    const result = validateThresholdHours(value)
    setThresholdError(result.ok ? null : result.message)
    if (result.ok) recluster(value)
  }

  const totalFiles = state.groups.reduce((sum, g) => sum + g.files.length, 0)
  const subView = state.copySummary ? 'done' : state.copying ? 'copying' : 'reviewing'

  return (
    <div>
      <AnimatePresence mode="wait">
        {subView === 'reviewing' && (
          <motion.div
            key="reviewing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <h1>Revisar grupos</h1>
            <p className="tabular-nums">
              {state.groups.length} grupos, {totalFiles} arquivos no total
            </p>
            <div
              className="field-row"
              style={{ flexDirection: 'column', alignItems: 'flex-start' }}
            >
              <label htmlFor="threshold-review">Intervalo entre grupos (horas)</label>
              <input
                id="threshold-review"
                type="number"
                min={1}
                className="field"
                value={state.thresholdHours}
                onChange={(e) => handleThresholdChange(Number(e.target.value))}
              />
              {thresholdError && <p className="field-error">{thresholdError}</p>}
            </div>
            <hr className="hairline-divider" />
            {state.groups.map((g) => (
              <GroupCard key={g.id} group={g} onRename={(name) => renameGroup(g.id, name)} />
            ))}
            <button className="primary" onClick={startCopy} style={{ marginTop: 'var(--space-4)' }}>
              Confirmar e copiar
            </button>
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
            <h1>Copiando arquivos…</h1>
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
              <CheckCircle size={22} /> Cópia concluída
            </h1>
            <p className="tabular-nums">
              {state.copySummary.copiedFiles}/{state.copySummary.totalFiles} arquivos copiados
            </p>
            {state.copySummary.conflicts.length > 0 && (
              <p>
                <WarningCircle size={16} /> {state.copySummary.conflicts.length} conflitos de nome
                resolvidos (renomeados, nada sobrescrito)
              </p>
            )}
            {state.copySummary.errors.length > 0 && (
              <p>
                <WarningCircle size={16} /> {state.copySummary.errors.length} arquivos falharam ao
                copiar
              </p>
            )}
            <button
              className="primary"
              disabled={!state.destinationPath}
              onClick={() =>
                state.destinationPath && window.saaraAPI.openPath(state.destinationPath)
              }
            >
              <FolderOpen size={18} /> Abrir pasta de destino
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
