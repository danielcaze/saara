export interface TimestampedFile {
  path: string
  timestamp: Date | null
}

export interface PhotoGroupResult {
  id: string
  files: TimestampedFile[]
  startDate: Date | null
  endDate: Date | null
  isNoDateGroup: boolean
}

function hasValidTimestamp(f: TimestampedFile): boolean {
  return f.timestamp !== null && !Number.isNaN(f.timestamp.getTime())
}

export function clusterByGap(files: TimestampedFile[], thresholdMs: number): PhotoGroupResult[] {
  const dated = files.filter(hasValidTimestamp)
  const undated = files.filter((f) => !hasValidTimestamp(f))

  dated.sort((a, b) => {
    const diff = a.timestamp!.getTime() - b.timestamp!.getTime()
    if (diff !== 0) return diff
    return a.path.localeCompare(b.path)
  })

  const groups: PhotoGroupResult[] = []
  let current: TimestampedFile[] = []

  for (const file of dated) {
    if (current.length === 0) {
      current.push(file)
      continue
    }
    const prev = current[current.length - 1]
    const gap = file.timestamp!.getTime() - prev.timestamp!.getTime()
    if (gap > thresholdMs) {
      groups.push(buildGroup(current, groups.length, false))
      current = [file]
    } else {
      current.push(file)
    }
  }
  if (current.length > 0) {
    groups.push(buildGroup(current, groups.length, false))
  }

  if (undated.length > 0) {
    const sortedUndated = [...undated].sort((a, b) => a.path.localeCompare(b.path))
    groups.push({
      id: 'group-nodate',
      files: sortedUndated,
      startDate: null,
      endDate: null,
      isNoDateGroup: true,
    })
  }

  return groups
}

function buildGroup(files: TimestampedFile[], index: number, isNoDateGroup: boolean): PhotoGroupResult {
  return {
    id: `group-${index}`,
    files,
    startDate: files[0].timestamp,
    endDate: files[files.length - 1].timestamp,
    isNoDateGroup,
  }
}
