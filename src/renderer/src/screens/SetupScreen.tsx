import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FolderOpen, MagnifyingGlass } from '@phosphor-icons/react'
import { validateThresholdHours } from '../../../shared/schemas'
import type { useImportWorkflow } from '../hooks/useImportWorkflow'

const PHASE_LABELS: Record<string, string> = {
  scanning: 'Escaneando arquivos',
  'reading-metadata': 'Lendo metadata',
  clustering: 'Agrupando'
}

interface Props {
  workflow: ReturnType<typeof useImportWorkflow>
}

export function SetupScreen({ workflow }: Props): React.JSX.Element {
  const { state, pickSource, pickDestination, setThresholdHours, analyze } = workflow
  const [thresholdError, setThresholdError] = useState<string | null>(null)

  function handleThresholdChange(value: number): void {
    const result = validateThresholdHours(value)
    setThresholdError(result.ok ? null : result.message)
    setThresholdHours(value)
  }

  const canAnalyze =
    !!state.sourcePath && !!state.destinationPath && !thresholdError && !state.analyzeProgress

  return (
    <div>
      <h1 className="wordmark">Saara</h1>

      <AnimatePresence mode="wait">
        {state.analyzeProgress ? (
          <motion.div
            key="progress"
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
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="field-row">
              <button className="field-button" onClick={pickSource}>
                <FolderOpen size={18} />
                Selecionar pasta de origem (cartão SD)
              </button>
              <span className="field-value">
                {state.sourcePath ?? 'Nenhuma origem selecionada'}
              </span>
            </div>

            <div className="field-row">
              <button className="field-button" onClick={pickDestination}>
                <FolderOpen size={18} />
                Selecionar pasta de destino
              </button>
              <span className="field-value">
                {state.destinationPath ?? 'Nenhum destino selecionado'}
              </span>
            </div>

            <div
              className="field-row"
              style={{ flexDirection: 'column', alignItems: 'flex-start' }}
            >
              <label htmlFor="threshold">Intervalo entre grupos (horas)</label>
              <input
                id="threshold"
                type="number"
                min={1}
                className="field"
                value={state.thresholdHours}
                onChange={(e) => handleThresholdChange(Number(e.target.value))}
              />
              {thresholdError && <p className="field-error">{thresholdError}</p>}
            </div>

            <button className="primary" disabled={!canAnalyze} onClick={analyze}>
              <MagnifyingGlass size={18} />
              Analisar
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
