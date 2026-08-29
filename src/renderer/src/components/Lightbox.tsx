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
import { prefetchLightboxPreview, useLightboxPreview } from '../hooks/useLightboxPreview'
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

// MediaError.code is a small int with no message of its own — this maps it
// to the actual reason, since "couldn't play" alone gives no way to tell a
// codec/container Chromium can't decode (expected, e.g. most .MOV files)
// apart from a real bug in the saara-media:// streaming protocol (e.g. a
// range-request or content-type mistake) that happens to also render as a
// playback failure.
const MEDIA_ERROR_MESSAGES: Record<number, string> = {
  1: 'Video loading was canceled.',
  2: 'Saara could not load this video.',
  3: 'This video is corrupted or uses an unsupported encoding.',
  4: 'Saara does not support that type of media yet.'
}

function VideoPlayer({ path, fileName }: { path: string; fileName: string }): React.JSX.Element {
  const [ready, setReady] = useState(false)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  if (errorDetail) {
    return (
      <div className="lightbox-video-placeholder">
        <span>Can&apos;t play {fileName}.</span>
        <span className="lightbox-video-error-detail">{errorDetail}</span>
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
        onError={(event) => {
          const error = event.currentTarget.error
          const detail = error
            ? (MEDIA_ERROR_MESSAGES[error.code] ?? `Unknown error (code ${error.code}).`)
            : 'Unknown error.'
          console.error(`[saara] video playback failed for ${path}:`, detail)
          setErrorDetail(detail)
        }}
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
      // A nested modal (delete confirm / move-to) is open on top of the
      // lightbox and owns its own capture-phase Escape handler — let that
      // fire instead, so Escape closes just the topmost layer instead of
      // both at once.
      if (showDeleteConfirm || showMoveModal) return

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

      if (e.key === 'Escape') {
        // Both this and HomeScreen's Escape listener are registered on
        // `window`, so plain stopPropagation is a no-op between them —
        // stopImmediatePropagation is required to stop HomeScreen's
        // listener from also clearing the selection in the same keypress.
        e.stopImmediatePropagation()
        onClose()
      } else if (e.key === 'ArrowLeft') onPrev()
      else if (e.key === 'ArrowRight') onNext()
    }

    // Capture phase: HomeScreen's Escape listener is registered on window
    // too and would otherwise already have fired (registration order puts
    // it first) by the time this bubble-phase handler ran, making its
    // stopImmediatePropagation too late to stop it.
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose, onPrev, onNext, showDeleteConfirm, showMoveModal])

  const { dataUrl, failed } = useLightboxPreview(
    current?.file.path ?? null,
    current?.file.mediaType ?? 'unsupported'
  )

  useEffect(() => {
    const neighbors = flattenGroupFiles(groups)
    const radius = 2
    for (let offset = 1; offset <= radius; offset++) {
      const next = neighbors[index + offset]
      const prev = neighbors[index - offset]
      if (next) prefetchLightboxPreview(next.file.path, next.file.mediaType)
      if (prev) prefetchLightboxPreview(prev.file.path, prev.file.mediaType)
    }
  }, [groups, index])

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
