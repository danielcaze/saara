import { useEffect, useRef, useState } from 'react'
import {
  X,
  CaretLeft,
  CaretRight,
  Trash,
  PencilSimple,
  FolderSimple,
  CheckSquare,
  Square
} from '@phosphor-icons/react'

import type { PhotoGroup } from '../../../shared/types'

import { flattenGroupFiles } from '../hooks/importWorkflowReducer'
import { useThumbnailDataUrl } from '../hooks/useThumbnailDataUrl'

const NEW_GROUP_VALUE = '__new__'

interface Props {
  groups: PhotoGroup[]
  index: number
  selectedPaths: Set<string>
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onToggleSelect: (path: string) => void
  onDelete: (paths: string[]) => void
  onMove: (paths: string[], targetGroupId: string) => void
  onCreateGroupAndMove: (paths: string[]) => void
  onRename: (path: string, fileName: string) => void
}

export function Lightbox({
  groups,
  index,
  selectedPaths,
  onClose,
  onPrev,
  onNext,
  onToggleSelect,
  onDelete,
  onMove,
  onCreateGroupAndMove,
  onRename
}: Props): React.JSX.Element | null {
  const flat = flattenGroupFiles(groups)
  const current = flat[index]
  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const [renamingForPath, setRenamingForPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [movePickerForPath, setMovePickerForPath] = useState<string | null>(null)
  const renaming = renamingForPath === current?.file.path
  const showMovePicker = movePickerForPath === current?.file.path

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    containerRef.current?.focus()

    return () => {
      previouslyFocused.current?.focus?.()
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Tab') {
        const container = containerRef.current
        if (!container) return

        const focusable = Array.from(
          container.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled'))

        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }

        return
      }

      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA'
      ) {
        return
      }

      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onPrev()
      else if (e.key === 'ArrowRight') onNext()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onPrev, onNext])

  const { dataUrl, failed } = useThumbnailDataUrl(
    current?.file.path ?? null,
    current?.file.mediaType ?? 'unsupported'
  )

  if (!current) return null

  const isSelected = selectedPaths.has(current.file.path)
  const targetPaths = selectedPaths.size > 0 ? Array.from(selectedPaths) : [current.file.path]

  function startRename(): void {
    setRenameValue(current.file.fileName)
    setRenamingForPath(current.file.path)
  }

  function commitRename(): void {
    const trimmed = renameValue.trim()
    if (trimmed) onRename(current.file.path, trimmed)
    setRenamingForPath(null)
  }

  return (
    <div
      className="lightbox-overlay"
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`${current.file.fileName}, photo ${index + 1} of ${flat.length}`}
    >
      <div className="lightbox-toolbar">
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <X size={18} aria-hidden="true" />
        </button>
        <span className="tabular-nums field-value">
          {index + 1} / {flat.length}
        </span>
        <div className="lightbox-toolbar-actions">
          <button
            className="icon-button"
            aria-pressed={isSelected}
            aria-label={isSelected ? 'Deselect this photo' : 'Select this photo'}
            onClick={() => onToggleSelect(current.file.path)}
          >
            {isSelected ? (
              <CheckSquare size={18} weight="fill" aria-hidden="true" />
            ) : (
              <Square size={18} aria-hidden="true" />
            )}
            Select
          </button>
          <button className="icon-button" aria-label="Delete" onClick={() => onDelete(targetPaths)}>
            <Trash size={18} aria-hidden="true" /> Delete
          </button>
          <button
            className="icon-button"
            aria-label="Move"
            aria-expanded={showMovePicker}
            onClick={() =>
              setMovePickerForPath((path) =>
                path === current.file.path ? null : current.file.path
              )
            }
          >
            <FolderSimple size={18} aria-hidden="true" /> Move
          </button>
          {showMovePicker && (
            <select
              className="field"
              aria-label="Move to group"
              defaultValue=""
              onChange={(e) => {
                const value = e.target.value
                setMovePickerForPath(null)
                if (!value) return
                if (value === NEW_GROUP_VALUE) onCreateGroupAndMove(targetPaths)
                else onMove(targetPaths, value)
              }}
            >
              <option value="" disabled>
                Choose a group…
              </option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value={NEW_GROUP_VALUE}>+ New group</option>
            </select>
          )}
          {renaming ? (
            <input
              className="field"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenamingForPath(null)
              }}
              onBlur={commitRename}
            />
          ) : (
            <button className="icon-button" aria-label="Rename" onClick={startRename}>
              <PencilSimple size={18} aria-hidden="true" /> Rename
            </button>
          )}
        </div>
      </div>
      <div className="lightbox-stage">
        <button
          className="lightbox-nav lightbox-nav-prev"
          onClick={onPrev}
          disabled={index === 0}
          aria-label="Previous photo"
        >
          <CaretLeft size={24} aria-hidden="true" />
        </button>
        {current.file.mediaType === 'video' ? (
          <div className="lightbox-video-placeholder">
            <span>{current.file.fileName}</span>
          </div>
        ) : failed ? (
          <div className="lightbox-video-placeholder">
            <span>Couldn&apos;t load a preview for {current.file.fileName}</span>
          </div>
        ) : dataUrl ? (
          <img className="lightbox-image" src={dataUrl} alt={current.file.fileName} />
        ) : (
          <div className="lightbox-image-loading" />
        )}
        <button
          className="lightbox-nav lightbox-nav-next"
          onClick={onNext}
          disabled={index === flat.length - 1}
          aria-label="Next photo"
        >
          <CaretRight size={24} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
