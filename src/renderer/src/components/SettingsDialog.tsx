import { useEffect, useRef, useState } from 'react'
import { ArrowSquareOut, GoogleDriveLogo, X } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'

import type { useImportWorkflow } from '../hooks/useImportWorkflow'
import { useThresholdSettings } from '../hooks/useThresholdSettings'

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

function closeOnEscape(event: KeyboardEvent, onClose: () => void): void {
  if (event.key === 'Escape') onClose()
}

function moveFocusToEnd(event: KeyboardEvent, first: HTMLElement, last: HTMLElement): boolean {
  if (!event.shiftKey || document.activeElement !== first) return false
  event.preventDefault()
  last.focus()
  return true
}

function moveFocusToStart(event: KeyboardEvent, last: HTMLElement, first: HTMLElement): void {
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function focusAtBoundary(event: KeyboardEvent, focusable: HTMLElement[]): void {
  const first = focusable[0]
  if (!first) return
  const last = focusable[focusable.length - 1] ?? first
  if (!moveFocusToEnd(event, first, last)) moveFocusToStart(event, last, first)
}

function keepFocusInDialog(event: KeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== 'Tab') return
  if (!container) return
  focusAtBoundary(event, focusableElements(container))
}

const reducedDialogAnimation = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.1 }
}

const standardDialogAnimation = {
  initial: { opacity: 0, scale: 0.98, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 8 },
  transition: { type: 'spring' as const, bounce: 0, duration: 0.35 }
}

function dialogAnimation(
  reduceMotion: boolean
): typeof reducedDialogAnimation | typeof standardDialogAnimation {
  return reduceMotion ? reducedDialogAnimation : standardDialogAnimation
}

function scrimTransition(reduceMotion: boolean): { duration: number } {
  return { duration: reduceMotion ? 0.1 : 0.15 }
}

export function SettingsDialog({ workflow, onClose }: Props): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const reduceMotion = useReducedMotion()
  const shouldReduceMotion = reduceMotion ?? false
  const {
    rawValue,
    error,
    prefixCopiedFileNames,
    handleChange,
    handlePrefixCopiedFileNamesChange,
    handleSave
  } = useThresholdSettings(workflow, onClose)
  const animation = dialogAnimation(shouldReduceMotion)
  const [disconnecting, setDisconnecting] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const { driveStatus } = workflow.state

  useEffect(() => {
    window.saaraAPI.getAppVersion().then(setAppVersion)
  }, [])

  async function handleDisconnectDrive(): Promise<void> {
    setDisconnecting(true)
    try {
      await workflow.disconnectDrive()
    } finally {
      setDisconnecting(false)
    }
  }

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    inputRef.current?.focus()

    const handleEscape = (event: KeyboardEvent): void => closeOnEscape(event, onClose)
    const handleFocusTrap = (event: KeyboardEvent): void =>
      keepFocusInDialog(event, dialogRef.current)

    window.addEventListener('keydown', handleEscape)
    window.addEventListener('keydown', handleFocusTrap)
    return () => {
      window.removeEventListener('keydown', handleEscape)
      window.removeEventListener('keydown', handleFocusTrap)
      previouslyFocused.current?.focus?.()
    }
  }, [onClose])

  return (
    <motion.div
      className="settings-dialog-scrim"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={scrimTransition(shouldReduceMotion)}
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        initial={animation.initial}
        animate={animation.animate}
        exit={animation.exit}
        transition={animation.transition}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-dialog-header">
          <div>
            <h2 id="settings-dialog-title">Settings</h2>
            <p>Set how Saara groups photos and saves local copies.</p>
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

        <div className="settings-dialog-field">
          <label htmlFor="prefix-copied-file-names">Local file order</label>
          <label className="settings-dialog-checkbox" htmlFor="prefix-copied-file-names">
            <input
              id="prefix-copied-file-names"
              type="checkbox"
              checked={prefixCopiedFileNames}
              onChange={(event) => handlePrefixCopiedFileNamesChange(event.target.checked)}
            />
            Prefix copied filenames with their order in Saara
          </label>
          <p className="field-value">
            Example: 0001_IMG_0001.JPG. Google Drive filenames stay unchanged.
          </p>
        </div>

        {driveStatus.connected && (
          <div className="settings-dialog-field">
            <label>Google Drive</label>
            <div className="settings-dialog-input-row">
              <span className="field-value">
                <GoogleDriveLogo size={16} aria-hidden="true" /> {driveStatus.email}
              </span>
              <button
                type="button"
                className="modal-secondary"
                disabled={disconnecting}
                onClick={() => void handleDisconnectDrive()}
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          </div>
        )}

        <div className="settings-dialog-footer">
          <a
            className="settings-dialog-contact"
            href="https://github.com/danielcaze/saara/issues/new"
            target="_blank"
            rel="noreferrer"
          >
            Found a bug? Report it on GitHub <ArrowSquareOut size={16} aria-hidden="true" />
          </a>

          {appVersion && <span className="settings-dialog-version">Saara v{appVersion}</span>}
        </div>

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
