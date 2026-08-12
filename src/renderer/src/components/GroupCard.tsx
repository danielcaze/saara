import { useState } from 'react'
import { CaretRight, CaretDown } from '@phosphor-icons/react'
import type { PhotoGroup } from '../../../shared/types'
import { Thumbnail } from './Thumbnail'

interface Props {
  group: PhotoGroup
  onRename: (name: string) => void
}

export function GroupCard({ group, onRename }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="group-card">
      <div className="group-card-header">
        <button className="icon-button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <CaretDown size={16} /> : <CaretRight size={16} />}
        </button>
        <input className="field" value={group.name} onChange={(e) => onRename(e.target.value)} />
        <span className="tabular-nums">{group.files.length} arquivos</span>
        <span className="tabular-nums">
          {group.isNoDateGroup
            ? 'Sem data'
            : group.startDate === group.endDate
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
              {f.fileName} {f.metadataError ? `(erro: ${f.metadataError})` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
