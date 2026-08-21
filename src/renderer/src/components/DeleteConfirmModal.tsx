import { SessionEditModal } from './SessionEditModal'

interface Props {
  paths: string[]
  onConfirm: () => void
  onCancel: () => void
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function DeleteConfirmModal({ paths, onConfirm, onCancel }: Props): React.JSX.Element {
  const itemDescription = paths.length === 1 ? fileNameFromPath(paths[0]) : `${paths.length} files`

  return (
    <SessionEditModal labelledBy="delete-confirm-title" onCancel={onCancel}>
      <h2 id="delete-confirm-title">Remove {itemDescription} from this session?</h2>
      <p className="modal-copy">
        This only removes it from the current session. Original files on disk are never touched.
      </p>
      <div className="modal-actions">
        <button type="button" className="modal-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" onClick={onConfirm}>
          Remove from session
        </button>
      </div>
    </SessionEditModal>
  )
}
