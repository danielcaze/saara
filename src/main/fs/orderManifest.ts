import fs from 'node:fs/promises'
import path from 'node:path'

import type { LocalOrderManifestGroup } from '../../shared/types'

export const ORDER_MANIFEST_FILE = '.saara.json'

interface GroupOrderManifest {
  version: 1
  group: Omit<LocalOrderManifestGroup, 'folderName'>
}

function isGroup(value: unknown): value is Omit<LocalOrderManifestGroup, 'folderName'> {
  if (!value || typeof value !== 'object') return false
  const group = value as Record<string, unknown>
  return (
    typeof group.id === 'string' &&
    typeof group.name === 'string' &&
    typeof group.groupOrder === 'number' &&
    Array.isArray(group.files) &&
    group.files.every((file) => typeof file === 'string')
  )
}

function isManifest(value: unknown): value is GroupOrderManifest {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Record<string, unknown>
  return manifest.version === 1 && isGroup(manifest.group)
}

export async function writeOrderManifest(
  destinationDirectory: string,
  group: LocalOrderManifestGroup
): Promise<void> {
  const target = path.join(destinationDirectory, ORDER_MANIFEST_FILE)
  const savedGroup = {
    id: group.id,
    name: group.name,
    groupOrder: group.groupOrder,
    files: group.files
  }
  const manifest: GroupOrderManifest = { version: 1, group: savedGroup }
  await fs.writeFile(target, JSON.stringify(manifest, null, 2), 'utf-8')
}

async function collectManifestPaths(directory: string, paths: string[]): Promise<void> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isFile() && entry.name === ORDER_MANIFEST_FILE) {
      paths.push(entryPath)
    } else if (entry.isDirectory()) {
      await collectManifestPaths(entryPath, paths)
    }
  }
}

export async function readOrderManifests(rootDir: string): Promise<LocalOrderManifestGroup[]> {
  const manifestPaths: string[] = []
  try {
    await collectManifestPaths(rootDir, manifestPaths)
  } catch {
    return []
  }

  const groups = await Promise.all(
    manifestPaths.map(async (manifestPath) => {
      try {
        const raw = await fs.readFile(manifestPath, 'utf-8')
        const parsed: unknown = JSON.parse(raw)
        if (!isManifest(parsed)) return null
        return {
          ...parsed.group,
          folderName: path.relative(rootDir, path.dirname(manifestPath))
        }
      } catch {
        return null
      }
    })
  )

  return groups
    .filter((group): group is LocalOrderManifestGroup => group !== null)
    .sort((left, right) => left.groupOrder - right.groupOrder)
}
