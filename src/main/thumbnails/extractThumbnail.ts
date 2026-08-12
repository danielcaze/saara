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
