import { readFile } from 'node:fs/promises'
import { exiftool } from '../metadata/exiftoolClient'
import type { MediaType } from '../../shared/types'

export async function extractThumbnail(filePath: string, mediaType: MediaType): Promise<string | null> {
  if (mediaType === 'video' || mediaType === 'unsupported') {
    return null
  }
  try {
    const buffer = await exiftool
      .extractBinaryTagToBuffer('ThumbnailImage', filePath)
      .catch(() => exiftool.extractBinaryTagToBuffer('PreviewImage', filePath))
    if (!buffer || buffer.length === 0) return null
    return `data:image/jpeg;base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

// The Lightbox needs a much larger image than the grid thumbnail. Cameras
// (especially RAW shooters) embed a full-size JPEG under PreviewImage —
// typically 1600-2000px on the long edge, vs. ThumbnailImage's ~160px — so
// try that first, opposite of extractThumbnail's priority. If neither EXIF
// tag exists, fall back to the original file bytes directly rather than
// pulling in an image-resize dependency for what should be a rare path
// (files with no embedded preview at all).
export async function extractLightboxPreview(
  filePath: string,
  mediaType: MediaType
): Promise<string | null> {
  if (mediaType === 'video' || mediaType === 'unsupported') {
    return null
  }
  try {
    const buffer = await exiftool
      .extractBinaryTagToBuffer('PreviewImage', filePath)
      .catch(() => exiftool.extractBinaryTagToBuffer('ThumbnailImage', filePath))
    if (buffer && buffer.length > 0) {
      return `data:image/jpeg;base64,${buffer.toString('base64')}`
    }
  } catch {
    // fall through to the raw-file fallback below
  }
  if (mediaType === 'raw') return null
  try {
    const original = await readFile(filePath)
    return `data:image/jpeg;base64,${original.toString('base64')}`
  } catch {
    return null
  }
}
