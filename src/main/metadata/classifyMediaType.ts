import path from 'node:path'
import type { MediaType } from '../../shared/types'

const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.tif', '.tiff'])
const RAW_EXT = new Set(['.cr2', '.cr3', '.nef', '.arw', '.dng', '.raf', '.orf', '.rw2'])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.avi', '.mts', '.m4v'])

export function classifyMediaType(filePath: string): MediaType {
  const ext = path.extname(filePath).toLowerCase()
  if (PHOTO_EXT.has(ext)) return 'photo'
  if (RAW_EXT.has(ext)) return 'raw'
  if (VIDEO_EXT.has(ext)) return 'video'
  return 'unsupported'
}
