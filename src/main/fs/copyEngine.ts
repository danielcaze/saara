import fs from 'node:fs/promises'
import path from 'node:path'
import { sanitizeFolderName } from './sanitizeFolderName'
import { writeOrderManifest } from './orderManifest'
import type { CopyPlanGroup, CopyProgressEvent, CopySummary } from '../../shared/types'

export interface CopyPlan {
  destinationRoot: string
  groups: CopyPlanGroup[]
  prefixFileNames?: boolean
}

const CONCURRENCY = 4

export function uniqueFolderPath(desiredName: string, taken: Set<string>): string {
  // Note: deliberately does NOT check the filesystem for an existing
  // directory of this name — a pre-existing destination folder (e.g. from an
  // earlier copy job) should be reused, not treated as a naming collision.
  // Only collisions between group names within *this* plan get suffixed.
  let candidate = desiredName
  let counter = 2
  while (taken.has(candidate)) {
    candidate = `${desiredName} (${counter})`
    counter++
  }
  taken.add(candidate)
  return candidate
}

// Synchronous name-claiming: checking `existingNames.has` and then
// `existingNames.add` with no `await` in between means the check-and-claim
// cannot be interrupted mid-way. JS's single-threaded execution guarantees a
// synchronous function body runs to completion without interleaving with
// other concurrent workers, which is what actually closes the TOCTOU race
// that an async, filesystem-polling version of this function was exposed to.
function claimUniqueFileName(
  existingNames: Set<string>,
  fileName: string
): { finalName: string; wasConflict: boolean } {
  const ext = path.extname(fileName)
  const base = fileName.slice(0, fileName.length - ext.length)
  let candidate = fileName
  let counter = 1
  let wasConflict = false
  while (existingNames.has(candidate)) {
    candidate = `${base} (${counter})${ext}`
    counter++
    wasConflict = true
  }
  existingNames.add(candidate)
  return { finalName: candidate, wasConflict }
}

async function copyOne(
  sourcePath: string,
  destDir: string,
  fileName: string,
  existingNames: Set<string>
): Promise<{ resolvedName: string; conflict: boolean }> {
  const { finalName, wasConflict } = claimUniqueFileName(existingNames, fileName)
  const destPath = path.join(destDir, finalName)
  await fs.copyFile(sourcePath, destPath)
  const stat = await fs.stat(sourcePath)
  await fs.utimes(destPath, stat.atime, stat.mtime)
  return { resolvedName: finalName, conflict: wasConflict }
}

function orderedFileName(fileName: string, index: number, total: number): string {
  const width = Math.max(4, String(total).length)
  return `${String(index + 1).padStart(width, '0')}_${fileName}`
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let index = 0
  async function next(): Promise<void> {
    const current = index++
    if (current >= items.length) return
    await worker(items[current], current)
    await next()
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()))
}

export async function runCopyPlan(
  plan: CopyPlan,
  onProgress: (e: CopyProgressEvent) => void
): Promise<CopySummary> {
  const summary: CopySummary = {
    totalFiles: 0,
    copiedFiles: 0,
    skippedFiles: 0,
    conflicts: [],
    errors: []
  }
  const takenFolderNames = new Set<string>()
  let copiedSoFar = 0
  const totalFiles = plan.groups.reduce((sum, g) => sum + g.files.length, 0)

  for (const [groupOrder, group] of plan.groups.entries()) {
    const folderName = uniqueFolderPath(sanitizeFolderName(group.name), takenFolderNames)
    const destDir = path.join(plan.destinationRoot, folderName)
    await fs.mkdir(destDir, { recursive: true })
    const existingNames = new Set(await fs.readdir(destDir))
    const copiedNames = new Array<string | null>(group.files.length).fill(null)

    await runPool(group.files, CONCURRENCY, async (file, index) => {
      summary.totalFiles++
      try {
        const requestedName = plan.prefixFileNames
          ? orderedFileName(file.fileName, index, group.files.length)
          : file.fileName
        const { resolvedName, conflict } = await copyOne(
          file.sourcePath,
          destDir,
          requestedName,
          existingNames
        )
        copiedNames[index] = resolvedName
        summary.copiedFiles++
        if (conflict) {
          summary.conflicts.push({ originalName: requestedName, resolvedName })
        }
      } catch (err) {
        summary.errors.push({
          path: file.sourcePath,
          message: err instanceof Error ? err.message : String(err)
        })
      } finally {
        copiedSoFar++
        onProgress({
          groupId: group.id,
          groupName: group.name,
          fileName: file.fileName,
          filesCopiedSoFar: copiedSoFar,
          totalFiles
        })
      }
    })
    await writeOrderManifest(destDir, {
      id: group.id,
      name: group.name,
      groupOrder,
      folderName,
      files: copiedNames.filter((name): name is string => name !== null)
    })
  }

  return summary
}
