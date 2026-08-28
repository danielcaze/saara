import { exiftool, EXIFTOOL_MAX_PROCS } from './exiftoolClient'
import type { MediaType } from '../../shared/types'

export interface ExtractedMetadata {
  path: string
  mediaType: MediaType
  timestamp: Date | null
  timestampSource: 'DateTimeOriginal' | 'CreateDate' | 'MediaCreateDate' | null
  mtime: Date | null
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
    // -fast2 skips scanning to the end of the file (maker notes, trailers,
    // composite tags) — for photos we only need a handful of header-level
    // date tags, so that scan work (the expensive part on a slow
    // SD-card-via-USB adapter) is pure waste. Videos can't use -fast2: a
    // camera-recorded (non-faststart) MP4/MOV often stores its moov atom
    // after mdat, and -fast2 makes exiftool stop before reaching it, which
    // silently drops CreateDate/MediaCreateDate/FileModifyDate. -fast still
    // skips make/model trailer scanning but does seek to find moov.
    // Naming the exact tags we want also cuts the JSON payload exiftool has
    // to serialize and pipe back per file.
    const tags = await exiftool.read(filePath, {
      readArgs: [
        mediaType === 'video' ? '-fast' : '-fast2',
        '-DateTimeOriginal',
        '-CreateDate',
        '-MediaCreateDate',
        '-FileModifyDate'
      ]
    })
    // exiftool already reads this off the file it just opened for EXIF, so
    // grabbing it here saves the copy step a redundant fs.stat later.
    const mtime = isValidExifDate(tags.FileModifyDate) ? tags.FileModifyDate.toDate() : null

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
          return { path: filePath, mediaType, timestamp: date, timestampSource: source, mtime }
        }
      }
    }

    const firstIssue = tags.errors?.[0] ?? tags.warnings?.[0]
    return {
      path: filePath,
      mediaType,
      timestamp: null,
      timestampSource: null,
      mtime,
      ...(firstIssue ? { error: firstIssue } : {})
    }
  } catch (err) {
    return {
      path: filePath,
      mediaType,
      timestamp: null,
      timestampSource: null,
      mtime: null,
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
