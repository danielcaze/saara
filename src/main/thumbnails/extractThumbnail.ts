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

// The Lightbox needs full quality, not a thumbnail. For ordinary
// photos/JPEGs the original file bytes ARE the full-quality image, so read
// those directly — using EXIF ThumbnailImage/PreviewImage here (as an
// earlier version did) silently showed the camera's small embedded preview
// instead of the real photo, which is why the Lightbox looked visibly worse
// than the same file viewed anywhere else (e.g. after uploading to Drive).
// RAW files are the one case where the original bytes aren't a
// browser-renderable image at all, so for those we still need the
// camera-embedded PreviewImage (full-size JPEG, ~1600-2000px) or, failing
// that, the smaller ThumbnailImage.
export async function extractLightboxPreview(
  filePath: string,
  mediaType: MediaType
): Promise<string | null> {
  if (mediaType === 'video' || mediaType === 'unsupported') {
    return null
  }
  if (mediaType !== 'raw') {
    try {
      const original = await readFile(filePath)
      return `data:image/jpeg;base64,${original.toString('base64')}`
    } catch {
      return null
    }
  }
  try {
    const buffer = await exiftool
      .extractBinaryTagToBuffer('PreviewImage', filePath)
      .catch(() => exiftool.extractBinaryTagToBuffer('ThumbnailImage', filePath))
    if (buffer && buffer.length > 0) {
      return `data:image/jpeg;base64,${buffer.toString('base64')}`
    }
  } catch {
    // no embedded preview available at all
  }
  return null
}
