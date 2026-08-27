const ORDER_PREFIX = /^(\d{4,})_(.+)$/

/**
 * Returns the local export name for a file at its position in a group.
 * Existing Saara order prefixes are preserved when they already match, or
 * replaced when the file has moved, so repeated exports never stack prefixes.
 */
export function localOrderFileName(fileName: string, index: number, total: number): string {
  const order = index + 1
  const match = fileName.match(ORDER_PREFIX)
  if (match && Number(match[1]) === order) return fileName

  const originalName = match?.[2] ?? fileName
  const width = Math.max(4, String(total).length)
  return `${String(order).padStart(width, '0')}_${originalName}`
}
