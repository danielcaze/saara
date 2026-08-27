// src/main/importSession.ts
import path from 'node:path'
import { scanFiles, assertIsDirectory } from './fs/scanFiles'
import { readOrderManifests } from './fs/orderManifest'
import { extractMetadataBatch, type ExtractedMetadata } from './metadata/extractMetadata'
import { clusterByGap, type TimestampedFile } from '../shared/clustering/clusterByGap'
import { suggestGroupName } from '../shared/clustering/suggestGroupName'
import type {
  AnalyzeProgress,
  FileMeta,
  LocalOrderManifestGroup,
  PhotoGroup
} from '../shared/types'

let cachedMetadata: ExtractedMetadata[] = []
let cachedSourcePath: string | null = null
let cachedOrderManifest: LocalOrderManifestGroup[] | null = null

function toFileMeta(m: ExtractedMetadata, fileName: string): FileMeta {
  return {
    path: m.path,
    fileName,
    mediaType: m.mediaType,
    timestamp: m.timestamp ? m.timestamp.toISOString() : null,
    timestampSource: m.timestampSource,
    metadataError: m.error ?? null
  }
}

function toPhotoGroups(metadata: ExtractedMetadata[], thresholdMs: number): PhotoGroup[] {
  const byPath = new Map(metadata.map((m) => [m.path, m]))
  const timestamped: TimestampedFile[] = metadata.map((m) => ({
    path: m.path,
    timestamp: m.timestamp
  }))
  const clustered = clusterByGap(timestamped, thresholdMs)

  return clustered.map((g) => {
    const files = g.files.map((f) => {
      const meta = byPath.get(f.path)!
      return toFileMeta(meta, f.path.split(/[\\/]/).pop() ?? f.path)
    })
    return {
      id: g.id,
      name: suggestGroupName(g),
      files,
      startDate: g.startDate ? g.startDate.toISOString() : null,
      endDate: g.endDate ? g.endDate.toISOString() : null,
      isNoDateGroup: g.isNoDateGroup
    }
  })
}

export function restoredGroupsFromManifest(
  sourcePath: string,
  metadata: ExtractedMetadata[],
  groups: LocalOrderManifestGroup[]
): { groups: PhotoGroup[]; restoredPaths: Set<string> } {
  const metadataByPath = new Map(metadata.map((item) => [item.path, item]))
  const restoredPaths = new Set<string>()
  const restored = groups.flatMap((stored, index) => {
    const files = stored.files.flatMap((fileName) => {
      const filePath = path.join(sourcePath, stored.folderName, fileName)
      const file = metadataByPath.get(filePath)
      if (!file || restoredPaths.has(filePath)) return []
      restoredPaths.add(filePath)
      return [toFileMeta(file, fileName)]
    })
    if (files.length === 0) return []
    const dated = files
      .map((file) => file.timestamp)
      .filter((timestamp): timestamp is string => !!timestamp)
    return [
      {
        id: stored.id || `restored-group-${index}`,
        name: stored.name,
        files,
        startDate: dated.length
          ? dated.reduce((earliest, date) => (date < earliest ? date : earliest))
          : null,
        endDate: dated.length
          ? dated.reduce((latest, date) => (date > latest ? date : latest))
          : null,
        isNoDateGroup: dated.length === 0
      }
    ]
  })
  return { groups: restored, restoredPaths }
}

export async function analyzeSource(
  sourcePath: string,
  thresholdMs: number,
  onProgress: (p: AnalyzeProgress) => void
): Promise<PhotoGroup[]> {
  await assertIsDirectory(sourcePath)

  onProgress({ phase: 'scanning', current: 0, total: 0 })
  const scanned = await scanFiles(sourcePath)

  onProgress({ phase: 'reading-metadata', current: 0, total: scanned.length })
  cachedMetadata = await extractMetadataBatch(
    scanned.map((s) => ({ path: s.path, mediaType: s.mediaType })),
    (done, total) => onProgress({ phase: 'reading-metadata', current: done, total })
  )

  onProgress({ phase: 'clustering', current: 0, total: cachedMetadata.length })
  const manifest = await readOrderManifests(sourcePath)
  cachedSourcePath = sourcePath
  cachedOrderManifest = manifest
  const restored = restoredGroupsFromManifest(sourcePath, cachedMetadata, manifest)
  if (restored.groups.length === 0) return toPhotoGroups(cachedMetadata, thresholdMs)

  // Keep media added manually after Saara's export instead of hiding it. It
  // follows the normal timestamp grouping and appears after restored groups.
  const unlisted = cachedMetadata.filter((file) => !restored.restoredPaths.has(file.path))
  return [...restored.groups, ...toPhotoGroups(unlisted, thresholdMs)]
}

export function recluster(thresholdMs: number): PhotoGroup[] {
  if (cachedSourcePath && cachedOrderManifest) {
    const restored = restoredGroupsFromManifest(
      cachedSourcePath,
      cachedMetadata,
      cachedOrderManifest
    )
    if (restored.groups.length > 0) {
      const unlisted = cachedMetadata.filter((file) => !restored.restoredPaths.has(file.path))
      return [...restored.groups, ...toPhotoGroups(unlisted, thresholdMs)]
    }
  }
  return toPhotoGroups(cachedMetadata, thresholdMs)
}

// analyzeSource runs inside a worker thread (see analyzeWorker.ts) so it has
// its own module instance and its own cachedMetadata. These let the main
// thread pull that metadata back out once the worker reports done, so
// recluster() (called from the main thread, cheap enough to stay there) keeps
// working against the same data the worker just extracted.
export function getCachedMetadata(): ExtractedMetadata[] {
  return cachedMetadata
}

export function setCachedMetadata(
  metadata: ExtractedMetadata[],
  sourcePath: string | null = null,
  orderManifest: LocalOrderManifestGroup[] | null = null
): void {
  cachedMetadata = metadata
  cachedSourcePath = sourcePath
  cachedOrderManifest = orderManifest
}

export function getCachedOrderManifest(): LocalOrderManifestGroup[] | null {
  return cachedOrderManifest
}
