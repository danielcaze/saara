import { exiftool } from './exiftoolClient'
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
  mediaType: MediaType,
): Promise<ExtractedMetadata> {
  try {
    const tags = await exiftool.read(filePath)

    const candidates: Array<['DateTimeOriginal' | 'CreateDate' | 'MediaCreateDate', unknown]> =
      mediaType === 'video'
        ? [
            ['DateTimeOriginal', tags.DateTimeOriginal],
            ['CreateDate', tags.CreateDate],
            ['MediaCreateDate', (tags as Record<string, unknown>).MediaCreateDate],
          ]
        : [
            ['DateTimeOriginal', tags.DateTimeOriginal],
            ['CreateDate', tags.CreateDate],
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
      ...(firstIssue ? { error: firstIssue } : {}),
    }
  } catch (err) {
    return {
      path: filePath,
      mediaType,
      timestamp: null,
      timestampSource: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function extractMetadataBatch(
  files: { path: string; mediaType: MediaType }[],
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractedMetadata[]> {
  const results: ExtractedMetadata[] = []
  for (let i = 0; i < files.length; i++) {
    const { path, mediaType } = files[i]
    results.push(await extractFileMetadata(path, mediaType))
    onProgress?.(i + 1, files.length)
  }
  return results
}
