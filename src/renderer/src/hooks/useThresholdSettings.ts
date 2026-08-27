import { useState } from 'react'

import { validateThresholdHours } from '../../../shared/schemas'
import type { useImportWorkflow } from './useImportWorkflow'

function validateThresholdInput(rawValue: string): { ok: true } | { ok: false; message: string } {
  const parsed = Number(rawValue)
  if (rawValue.trim() === '' || Number.isNaN(parsed)) {
    return { ok: false, message: 'Enter a number.' }
  }
  return validateThresholdHours(parsed)
}

export function useThresholdSettings(
  workflow: ReturnType<typeof useImportWorkflow>,
  onSaved: () => void
): {
  rawValue: string
  error: string | null
  prefixCopiedFileNames: boolean
  handleChange: (rawInput: string) => void
  handlePrefixCopiedFileNamesChange: (enabled: boolean) => void
  handleSave: () => Promise<void>
} {
  const [rawValue, setRawValue] = useState(String(workflow.state.thresholdHours))
  const [error, setError] = useState<string | null>(null)
  const [prefixCopiedFileNames, setPrefixCopiedFileNames] = useState(
    workflow.state.prefixCopiedFileNames
  )

  function handleChange(rawInput: string): void {
    const value = rawInput.slice(0, 3)
    setRawValue(value)
    const result = validateThresholdInput(value)
    setError(result.ok ? null : result.message)
  }

  function handlePrefixCopiedFileNamesChange(enabled: boolean): void {
    setPrefixCopiedFileNames(enabled)
  }

  async function handleSave(): Promise<void> {
    const result = validateThresholdInput(rawValue)
    if (!result.ok) {
      setError(result.message)
      return
    }
    const thresholdHours = Number(rawValue)
    await window.saaraAPI.setSettings({ thresholdHours, prefixCopiedFileNames })
    workflow.setPrefixCopiedFileNames(prefixCopiedFileNames)
    await workflow.recluster(thresholdHours)
    onSaved()
  }

  return {
    rawValue,
    error,
    prefixCopiedFileNames,
    handleChange,
    handlePrefixCopiedFileNamesChange,
    handleSave
  }
}
