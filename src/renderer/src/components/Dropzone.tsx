// src/renderer/src/components/Dropzone.tsx
import { useState } from 'react'
import type { ReactNode, DragEvent, KeyboardEvent } from 'react'

interface CornerButtonProps {
  icon: ReactNode
  label: string
  onClick: () => void
}

interface Props {
  label: string
  hint: string
  icon: ReactNode
  path: string | null
  onPick: () => void
  onDropPath: (path: string) => void
  disabled?: boolean
  cornerButton?: CornerButtonProps
  overrideBody?: ReactNode
}

export function Dropzone({
  label,
  hint,
  icon,
  path,
  onPick,
  onDropPath,
  disabled,
  cornerButton,
  overrideBody
}: Props): React.JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    if (!disabled && !overrideBody) setIsDragOver(true)
  }

  function handleDragLeave(): void {
    setIsDragOver(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragOver(false)
    if (disabled || overrideBody) return
    const file = e.dataTransfer.files[0]
    if (!file) return
    const droppedPath = window.saaraAPI.getPathForFile(file)
    if (droppedPath) onDropPath(droppedPath)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    // The `overrideBody` check mirrors onClick/handleDrop's guard above.
    // The target check ignores keydowns bubbling up from a focused
    // descendant (the corner button below) — without it, Enter/Space on
    // the corner button would *also* trigger this div's onPick, since
    // native keydown bubbling isn't affected by the corner button's own
    // click-level stopPropagation().
    if (disabled || overrideBody || e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick()
    }
  }

  const accessibleLabel = `${label}: ${path ? path : hint}`

  return (
    <div
      className={`dropzone${isDragOver ? ' dropzone-active' : ''}`}
      data-disabled={disabled ? 'true' : 'false'}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled ? 'true' : undefined}
      aria-label={accessibleLabel}
      onClick={disabled || overrideBody ? undefined : onPick}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {cornerButton && (
        <button
          type="button"
          className="dropzone-corner-button"
          aria-label={cornerButton.label}
          onClick={(e) => {
            e.stopPropagation()
            cornerButton.onClick()
          }}
        >
          {cornerButton.icon}
        </button>
      )}
      {overrideBody ?? (
        <>
          {icon}
          <span className="dropzone-label">{label}</span>
          {path ? (
            <span className="dropzone-path">{path}</span>
          ) : (
            <span className="dropzone-hint">{hint}</span>
          )}
        </>
      )}
    </div>
  )
}
