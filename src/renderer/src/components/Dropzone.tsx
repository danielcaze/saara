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
    if (!disabled) setIsDragOver(true)
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
    if (disabled) return
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
