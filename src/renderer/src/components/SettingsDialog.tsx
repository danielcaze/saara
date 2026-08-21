import { useEffect, useRef, useState } from 'react'
import { ArrowSquareOut, X } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'

import { validateThresholdHours } from '../../../shared/schemas'
import type { useImportWorkflow } from '../hooks/useImportWorkflow'

interface Props {
  workflow: ReturnType<typeof useImportWorkflow>
  onClose: () => void
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  )
}

export function SettingsDialog({ workflow, onClose }: Props): React.JSX.Element {
  const [rawValue, setRawValue] = useState(String(workflow.state.thresholdHours))
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    inputRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = focusableElements(dialogRef.current)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused.current?.focus?.()
    }
  }, [onClose])

  function handleChange(rawInput: string): void {
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
    onClose()
  }

  return (
    <motion.div
      className="settings-dialog-scrim"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.1 : 0.15 }}
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }}
        transition={
          reduceMotion ? { duration: 0.1 } : { type: 'spring', bounce: 0, duration: 0.35 }
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-dialog-header">
          <div>
            <h2 id="settings-dialog-title">Settings</h2>
            <p>Choose how far apart photos can be before Saara makes a new group.</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="settings-dialog-field">
          <label htmlFor="threshold-settings">Group gap threshold</label>
          <div className="settings-dialog-input-row">
            <input
              ref={inputRef}
              id="threshold-settings"
              type="number"
              min={1}
              className="field"
              value={rawValue}
              onChange={(event) => handleChange(event.target.value)}
            />
            <span className="field-value">hours</span>
          </div>
          {error && <p className="field-error">{error}</p>}
        </div>

        <a
          className="settings-dialog-contact"
          href="https://github.com/danielcaze/saara/issues/new"
          target="_blank"
          rel="noreferrer"
        >
          Found a bug? Report it on GitHub <ArrowSquareOut size={16} aria-hidden="true" />
        </a>

        <div className="modal-actions">
          <button type="button" className="modal-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!!error}
            onClick={() => void handleSave()}
          >
            Save changes
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
