import { useId, useState } from 'react'
import { CaretRight, CaretDown } from '@phosphor-icons/react'
import type { PhotoGroup } from '../../../shared/types'
import { Thumbnail } from './Thumbnail'

interface Props {
  group: PhotoGroup
  onRename: (name: string) => void
}

export function GroupCard({ group, onRename }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const renameInputId = useId()

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
      <div className="group-card-thumbs">
        {group.files.slice(0, 6).map((f) => (
          <Thumbnail key={f.path} path={f.path} mediaType={f.mediaType} />
        ))}
      </div>
      {expanded && (
        <ul>
          {group.files.map((f) => (
            <li key={f.path}>
              {f.fileName} {f.metadataError ? `(error: ${f.metadataError})` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
