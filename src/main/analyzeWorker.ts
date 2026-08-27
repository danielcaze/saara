// Runs analyzeSource() off the main thread. Analyzing a large source folder
// does hundreds of sequential exiftool round-trips plus clustering, and even
// though each round-trip is async, the accumulated JS work between awaits was
// enough to make the main process feel frozen — ipcMain handlers (e.g.
// settings) would stall until analysis finished. Isolating it in a worker
// thread means the main thread's event loop is never contended by this work,
// regardless of how slow or large a given folder turns out to be.
import { parentPort, workerData } from 'node:worker_threads'
import { analyzeSource, getCachedMetadata, getCachedOrderManifest } from './importSession'
import { shutdownExiftool } from './metadata/exiftoolClient'
import type { AnalyzeProgress, LocalOrderManifestGroup, PhotoGroup } from '../shared/types'
import type { ExtractedMetadata } from './metadata/extractMetadata'

export type AnalyzeWorkerMessage =
  | { type: 'progress'; progress: AnalyzeProgress }
  | {
      type: 'done'
      groups: PhotoGroup[]
      metadata: ExtractedMetadata[]
      orderManifest: LocalOrderManifestGroup[] | null
    }
  | { type: 'error'; message: string }

async function run(): Promise<void> {
  if (!parentPort) throw new Error('analyzeWorker must run inside a worker thread')

  const { sourcePath, thresholdMs } = workerData as { sourcePath: string; thresholdMs: number }

  try {
    const groups = await analyzeSource(sourcePath, thresholdMs, (progress) => {
      parentPort!.postMessage({ type: 'progress', progress } satisfies AnalyzeWorkerMessage)
    })
    parentPort.postMessage({
      type: 'done',
      groups,
      metadata: getCachedMetadata(),
      orderManifest: getCachedOrderManifest()
    } satisfies AnalyzeWorkerMessage)
  } catch (err) {
    parentPort.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err)
    } satisfies AnalyzeWorkerMessage)
  } finally {
    await shutdownExiftool()
  }
}

void run()
