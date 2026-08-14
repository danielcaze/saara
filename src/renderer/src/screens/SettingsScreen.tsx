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
  // Kept as the raw string the user is typing (not a number) so a controlled
  // <input type="number"> doesn't fight the browser over leading zeros/empty
  // values while mid-edit (e.g. deleting down to "" then typing "1" would
  // otherwise round-trip through 0 and render "01").
  const [rawValue, setRawValue] = useState(String(workflow.state.thresholdHours))
  const [error, setError] = useState<string | null>(null)

  function handleChange(rawInput: string): void {
    // `maxLength` isn't enforced by Chromium on type="number" inputs, so cap
    // it here (max valid value is 720, i.e. 3 digits).
    const value = rawInput.slice(0, 3)
    setRawValue(value)
    const parsed = Number(value)
    if (value.trim() === '' || Number.isNaN(parsed)) {
      setError('Enter a number.')
      return
    }
    const result = validateThresholdHours(parsed)
    setError(result.ok ? null : result.message)
  }

  async function handleSave(): Promise<void> {
    const parsed = Number(rawValue)
    const result =
      rawValue.trim() === '' || Number.isNaN(parsed)
        ? { ok: false as const, message: 'Enter a number.' }
        : validateThresholdHours(parsed)
    if (!result.ok) {
      setError(result.message)
      return
    }
    await window.saaraAPI.setSettings({ thresholdHours: parsed })
    await workflow.recluster(parsed)
    onBack()
  }

  return (
    <div>
      <div className="screen-header">
        <button className="icon-button" onClick={onBack} aria-label="Back">
          <CaretLeft size={18} aria-hidden="true" />
        </button>
        <h1 className="wordmark">Settings</h1>
      </div>

      <div className="field-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <label htmlFor="threshold-settings">Group gap threshold (hours)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <input
            id="threshold-settings"
            type="number"
            min={1}
            className="field"
            style={{
              width: `calc(${Math.min(Math.max(rawValue.length, 2), 3)}ch + var(--space-4))`
            }}
            value={rawValue}
            onChange={(e) => handleChange(e.target.value)}
          />
          <span className="field-value" aria-hidden="true">
            h
          </span>
        </div>
        {error && <p className="field-error">{error}</p>}
      </div>

      <button className="primary" disabled={!!error} onClick={handleSave}>
        Save
      </button>
    </div>
  )
}
