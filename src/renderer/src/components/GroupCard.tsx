import { useId, useState } from 'react'
import { CaretRight, CaretDown, CheckSquare, PencilSimple, Square } from '@phosphor-icons/react'

import type { PhotoGroup } from '../../../shared/types'

import { Thumbnail } from './Thumbnail'

interface Props {
  group: PhotoGroup
  selectedPaths: Set<string>
  onRename: (name: string) => void
  onRenameFile: (path: string, fileName: string) => void
  onToggleSelect: (path: string) => void
  onOpenViewer: (path: string) => void
}

export function GroupCard({
  group,
  selectedPaths,
  onRename,
  onRenameFile,
  onToggleSelect,
  onOpenViewer
}: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputId = useId()
  const hasActiveSelection = selectedPaths.size > 0

  function selectButton(path: string, fileName: string): React.JSX.Element {
    const selected = selectedPaths.has(path)

    return (
      <button
        type="button"
        className="thumb-select"
        aria-pressed={selected}
        aria-label={selected ? `Deselect ${fileName}` : `Select ${fileName}`}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect(path)
        }}
      >
        {selected ? (
          <CheckSquare size={16} weight="fill" aria-hidden="true" />
        ) : (
          <Square size={16} aria-hidden="true" />
        )}
      </button>
    )
  }

  function startFileRename(path: string, fileName: string): void {
    setRenameValue(fileName)
    setRenamingPath(path)
  }

  function commitFileRename(path: string): void {
    const trimmed = renameValue.trim()
    if (trimmed) onRenameFile(path, trimmed)
    setRenamingPath(null)
  }

  return (
    <div className="group-card">
      <div className="group-card-header">
        <button
          className="icon-button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse group' : 'Expand group'}
        >
          {expanded ? (
            <CaretDown size={16} aria-hidden="true" />
          ) : (
            <CaretRight size={16} aria-hidden="true" />
          )}
        </button>
        <label htmlFor={renameInputId} className="visually-hidden">
          Group name
        </label>
        <input
          id={renameInputId}
          className="field"
          value={group.name}
          onChange={(e) => onRename(e.target.value)}
        />
        <span className="tabular-nums">{group.files.length} files</span>
        <span className="tabular-nums">
          {group.isNoDateGroup
            ? 'No date'
            : group.startDate?.slice(0, 10) === group.endDate?.slice(0, 10)
              ? group.startDate?.slice(0, 10)
              : `${group.startDate?.slice(0, 10)} – ${group.endDate?.slice(0, 10)}`}
        </span>
      </div>
      <div className={`group-card-thumbs${hasActiveSelection ? ' group-card-selecting' : ''}`}>
        {group.files.slice(0, 6).map((f) => (
          <div
            key={f.path}
            className={`thumb-wrap${selectedPaths.has(f.path) ? ' thumb-wrap-selected' : ''}`}
          >
            {selectButton(f.path, f.fileName)}
            <button
              type="button"
              className="thumb-open"
              onClick={() => onOpenViewer(f.path)}
              aria-label={`Open ${f.fileName}`}
            >
              <Thumbnail path={f.path} mediaType={f.mediaType} />
            </button>
          </div>
        ))}
      </div>
      {expanded && (
        <ul className="group-card-file-list">
          {group.files.map((f) => (
            <li key={f.path} className="group-card-file-row">
              {selectButton(f.path, f.fileName)}
              {renamingPath === f.path ? (
                <input
                  className="field group-card-file-rename"
                  autoFocus
                  aria-label={`Rename ${f.fileName}`}
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitFileRename(f.path)
                    if (event.key === 'Escape') setRenamingPath(null)
                  }}
                  onBlur={() => commitFileRename(f.path)}
                />
              ) : (
                <button
                  type="button"
                  className="group-card-file-name"
                  onClick={() => onOpenViewer(f.path)}
                >
                  {f.fileName} {f.metadataError ? `(error: ${f.metadataError})` : ''}
                </button>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label={`Rename ${f.fileName}`}
                onClick={() => startFileRename(f.path, f.fileName)}
              >
                <PencilSimple size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
