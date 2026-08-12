interface Props {
  current: number
  total: number
}

export function ProgressBar({ current, total }: Props): React.JSX.Element {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="progress-bar-track">
      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      <span className="tabular-nums">
        {current}/{total}
      </span>
    </div>
  )
}
