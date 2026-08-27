import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { AnalyzeProgress, PhotoGroup } from '../shared/types'
import { setCachedMetadata } from './importSession'
import type { AnalyzeWorkerMessage } from './analyzeWorker'

// __dirname here is the compiled out/main directory in both dev and packaged
// builds (electron-vite pre-bundles main in dev too, it's only the renderer
// that runs off a dev server), so analyzeWorker.js sits right next to this
// file's own compiled output.
function workerEntryPath(): string {
  return join(__dirname, 'analyzeWorker.js')
}

export function runAnalyzeInWorker(
  sourcePath: string,
  thresholdMs: number,
  onProgress: (progress: AnalyzeProgress) => void
): Promise<PhotoGroup[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerEntryPath(), { workerData: { sourcePath, thresholdMs } })

    worker.on('message', (message: AnalyzeWorkerMessage) => {
      if (message.type === 'progress') {
        onProgress(message.progress)
        return
      }
      if (message.type === 'done') {
        setCachedMetadata(message.metadata)
        resolve(message.groups)
      } else {
        reject(new Error(message.message))
      }
      void worker.terminate()
    })

    worker.on('error', (err) => reject(err))
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Analyze worker exited with code ${code}`))
    })
  })
}
