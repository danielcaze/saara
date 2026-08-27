import { exiftool, EXIFTOOL_MAX_PROCS } from './exiftoolClient'
import type { MediaType } from '../../shared/types'

export interface ExtractedMetadata {
  path: string
  mediaType: MediaType
  timestamp: Date | null
  timestampSource: 'DateTimeOriginal' | 'CreateDate' | 'MediaCreateDate' | null
  error?: string
}

function isValidExifDate(value: unknown): value is { toDate: () => Date } {
  return !!value && typeof (value as { toDate?: unknown }).toDate === 'function'
}

export async function extractFileMetadata(
  filePath: string,
  mediaType: MediaType
): Promise<ExtractedMetadata> {
  try {
    const tags = await exiftool.read(filePath)

    const candidates: Array<['DateTimeOriginal' | 'CreateDate' | 'MediaCreateDate', unknown]> =
      mediaType === 'video'
        ? [
            ['DateTimeOriginal', tags.DateTimeOriginal],
            ['CreateDate', tags.CreateDate],
            ['MediaCreateDate', (tags as Record<string, unknown>).MediaCreateDate]
          ]
        : [
            ['DateTimeOriginal', tags.DateTimeOriginal],
            ['CreateDate', tags.CreateDate]
          ]

    for (const [source, value] of candidates) {
      if (isValidExifDate(value)) {
        const date = value.toDate()
        if (!Number.isNaN(date.getTime()) && date.getTime() !== 0) {
          return { path: filePath, mediaType, timestamp: date, timestampSource: source }
        }
      }
    }

    const firstIssue = tags.errors?.[0] ?? tags.warnings?.[0]
    return {
      path: filePath,
      mediaType,
      timestamp: null,
      timestampSource: null,
      ...(firstIssue ? { error: firstIssue } : {})
    }
  } catch (err) {
    return {
      path: filePath,
      mediaType,
      timestamp: null,
      timestampSource: null,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

// Dispatches up to EXIFTOOL_MAX_PROCS reads concurrently instead of one at a
// time — exiftool-vendored already runs that many child processes in
// parallel internally, so a sequential await/loop here was leaving them
// mostly idle. Results are written into their original index, and progress
// counts completions (which land out of order), so this reads identically
// to the old sequential version — just faster.
export async function extractMetadataBatch(
  files: { path: string; mediaType: MediaType }[],
  onProgress?: (done: number, total: number) => void
): Promise<ExtractedMetadata[]> {
  const results: ExtractedMetadata[] = new Array(files.length)
  let nextIndex = 0
  let completed = 0

  async function worker(): Promise<void> {
    while (nextIndex < files.length) {
      const i = nextIndex++
      const { path, mediaType } = files[i]
      results[i] = await extractFileMetadata(path, mediaType)
      completed++
      onProgress?.(completed, files.length)
    }
  }

  const workerCount = Math.min(EXIFTOOL_MAX_PROCS, files.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}
