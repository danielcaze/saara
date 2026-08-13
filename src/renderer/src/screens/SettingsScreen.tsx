// src/renderer/src/screens/SettingsScreen.tsx
import { useState } from 'react'
import { CaretLeft } from '@phosphor-icons/react'
import { validateThresholdHours } from '../../../shared/schemas'
import type { useImportWorkflow } from '../hooks/useImportWorkflow'

interface Props {
  workflow: ReturnType<typeof useImportWorkflow>
  onBack: () => void
}

export function SettingsScreen({ workflow, onBack }: Props): React.JSX.Element {
  const [thresholdHours, setThresholdHours] = useState(workflow.state.thresholdHours)
  const [error, setError] = useState<string | null>(null)

  function handleChange(value: number): void {
    setThresholdHours(value)
    const result = validateThresholdHours(value)
    setError(result.ok ? null : result.message)
  }

  async function handleSave(): Promise<void> {
    const result = validateThresholdHours(thresholdHours)
    if (!result.ok) {
      setError(result.message)
      return
    }
    await window.saaraAPI.setSettings({ thresholdHours })
    await workflow.recluster(thresholdHours)
    onBack()
  }

  return (
    <div>
      <div className="screen-header">
        <button className="icon-button" onClick={onBack}>
          <CaretLeft size={18} />
        </button>
        <h1 className="wordmark">Settings</h1>
      </div>

      <div className="field-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <label htmlFor="threshold-settings">Group gap threshold (hours)</label>
        <input
          id="threshold-settings"
          type="number"
          min={1}
          className="field"
          value={thresholdHours}
          onChange={(e) => handleChange(Number(e.target.value))}
        />
        {error && <p className="field-error">{error}</p>}
      </div>

      <button className="primary" disabled={!!error} onClick={handleSave}>
        Save
      </button>
    </div>
  )
}
