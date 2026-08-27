// src/main/importSession.ts
import { scanFiles, assertIsDirectory } from './fs/scanFiles'
import { extractMetadataBatch, type ExtractedMetadata } from './metadata/extractMetadata'
import { clusterByGap, type TimestampedFile } from '../shared/clustering/clusterByGap'
import { suggestGroupName } from '../shared/clustering/suggestGroupName'
import type { AnalyzeProgress, FileMeta, PhotoGroup } from '../shared/types'

let cachedMetadata: ExtractedMetadata[] = []

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
  return toPhotoGroups(cachedMetadata, thresholdMs)
}

export function recluster(thresholdMs: number): PhotoGroup[] {
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

export function setCachedMetadata(metadata: ExtractedMetadata[]): void {
  cachedMetadata = metadata
}
