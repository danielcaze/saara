import type { PhotoGroupResult } from './clusterByGap'

function toDateStamp(d: Date): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

export function suggestGroupName(group: PhotoGroupResult): string {
  if (group.isNoDateGroup || !group.startDate || !group.endDate) {
    return 'No date'
  }
  const start = toDateStamp(group.startDate)
  const end = toDateStamp(group.endDate)
  return start === end ? start : `${start}_a_${end}`
}
