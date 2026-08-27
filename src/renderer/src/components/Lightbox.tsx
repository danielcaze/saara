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
import { useLightboxPreview } from '../hooks/useLightboxPreview'
import { DeleteConfirmModal } from './DeleteConfirmModal'
import { MoveGroupModal } from './MoveGroupModal'

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
  onCreateGroupAndMove: (paths: string[], name?: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onRename: (path: string, fileName: string) => void
}

function mediaUrl(filePath: string): string {
  return `saara-media://media/?path=${encodeURIComponent(filePath)}`
}

function VideoPlayer({ path, fileName }: { path: string; fileName: string }): React.JSX.Element {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="lightbox-video-placeholder">
        <span>Couldn&apos;t play {fileName} in this app.</span>
      </div>
    )
  }

  return (
    <div className="lightbox-video-container">
      <video
        className="lightbox-video"
        controls
        playsInline
        aria-label={`Play ${fileName}`}
        src={mediaUrl(path)}
        onLoadedData={() => setReady(true)}
        onError={() => setFailed(true)}
      />
      {!ready && <span className="lightbox-video-loading">Loading video…</span>}
    </div>
  )
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
  onRenameGroup,
  onRename
}: Props): React.JSX.Element | null {
  const flat = flattenGroupFiles(groups)
  const current = flat[index]
  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const [renamingForPath, setRenamingForPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const renaming = renamingForPath === current?.file.path

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

  const { dataUrl, failed } = useLightboxPreview(
    current?.file.path ?? null,
    current?.file.mediaType ?? 'unsupported'
  )

  if (!current) return null

  const isSelected = selectedPaths.has(current.file.path)
  // Lightbox actions always target the single open photo, never the active
  // selection — bulk actions live outside the lightbox instead (the
  // sticky-footer bulk-action bar), so there's one mental model per
  // surface rather than Delete meaning different things in different places.
  const currentPath = current.file.path

  function startRename(): void {
    setRenameValue(current.file.fileName)
    setRenamingForPath(current.file.path)
  }

  function commitRename(): void {
    const trimmed = renameValue.trim()
    if (trimmed) onRename(current.file.path, trimmed)
    setRenamingForPath(null)
  }

  function closeIfBackdrop(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="lightbox-overlay"
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`${current.file.fileName}, photo ${index + 1} of ${flat.length}`}
      onClick={closeIfBackdrop}
    >
      <div className="lightbox-toolbar">
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <X size={18} aria-hidden="true" />
        </button>
        <span className="lightbox-filename">{current.file.fileName}</span>
        <span className="tabular-nums field-value">
          {index + 1} / {flat.length}
        </span>
        <div className="lightbox-toolbar-actions">
          <button
            className="icon-button"
            aria-pressed={isSelected}
            aria-label={isSelected ? 'Deselect this photo' : 'Select this photo'}
            onClick={() => onToggleSelect(currentPath)}
          >
            {isSelected ? (
              <CheckSquare size={18} weight="fill" aria-hidden="true" />
            ) : (
              <Square size={18} aria-hidden="true" />
            )}
            Select
          </button>
          <button
            className="icon-button"
            aria-label="Delete"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash size={18} aria-hidden="true" /> Delete
          </button>
          <button
            className="icon-button"
            aria-label="Move"
            aria-expanded={showMoveModal}
            onClick={() => setShowMoveModal(true)}
          >
            <FolderSimple size={18} aria-hidden="true" /> Move
          </button>
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
      <div className="lightbox-stage" onClick={closeIfBackdrop}>
        <button
          className="lightbox-nav lightbox-nav-prev"
          onClick={onPrev}
          disabled={index === 0}
          aria-label="Previous photo"
        >
          <CaretLeft size={24} aria-hidden="true" />
        </button>
        {current.file.mediaType === 'video' ? (
          <VideoPlayer key={currentPath} path={currentPath} fileName={current.file.fileName} />
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

      {showDeleteConfirm && (
        <DeleteConfirmModal
          paths={[currentPath]}
          onConfirm={() => {
            setShowDeleteConfirm(false)
            onDelete([currentPath])
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showMoveModal && (
        <MoveGroupModal
          groups={groups}
          paths={[currentPath]}
          onMove={(targetGroupId) => {
            setShowMoveModal(false)
            onMove([currentPath], targetGroupId)
          }}
          onCreateGroupAndMove={(name) => {
            setShowMoveModal(false)
            onCreateGroupAndMove([currentPath], name)
          }}
          onRenameGroup={onRenameGroup}
          onCancel={() => setShowMoveModal(false)}
        />
      )}
    </div>
  )
}
