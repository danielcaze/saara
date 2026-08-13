import fs from 'node:fs/promises'
import path from 'node:path'
import { classifyMediaType } from '../metadata/classifyMediaType'
import type { MediaType } from '../../shared/types'

export interface ScannedFile {
  path: string
  mediaType: MediaType
}

export async function scanFiles(rootDir: string): Promise<ScannedFile[]> {
  const rootStat = await fs.stat(rootDir).catch(() => null)
  if (!rootStat || !rootStat.isDirectory()) {
    throw new Error(`"${path.basename(rootDir)}" is not a folder. Please choose or drop a folder.`)
  }

  const results: ScannedFile[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        const mediaType = classifyMediaType(fullPath)
        if (mediaType !== 'unsupported') {
          results.push({ path: fullPath, mediaType })
        }
      }
    }
  }

  await walk(rootDir)
  return results
}
