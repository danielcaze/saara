import { useState } from 'react'
import type { ReactNode, DragEvent } from 'react'

interface Props {
  label: string
  hint: string
  icon: ReactNode
  path: string | null
  onPick: () => void
  onDropPath: (path: string) => void
  disabled?: boolean
}

export function Dropzone({
  label,
  hint,
  icon,
  path,
  onPick,
  onDropPath,
  disabled
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
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (!file) return
    const droppedPath = window.saaraAPI.getPathForFile(file)
    if (droppedPath) onDropPath(droppedPath)
  }

  return (
    <div
      className={`dropzone${isDragOver ? ' dropzone-active' : ''}`}
      data-disabled={disabled ? 'true' : 'false'}
      onClick={disabled ? undefined : onPick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {icon}
      <span className="dropzone-label">{label}</span>
      {path ? (
        <span className="dropzone-path">{path}</span>
      ) : (
        <span className="dropzone-hint">{hint}</span>
      )}
    </div>
  )
}
