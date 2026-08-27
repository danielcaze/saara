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

let activeWorker: Worker | null = null

export function runAnalyzeInWorker(
  sourcePath: string,
  thresholdMs: number,
  onProgress: (progress: AnalyzeProgress) => void
): Promise<PhotoGroup[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerEntryPath(), { workerData: { sourcePath, thresholdMs } })
    activeWorker = worker

    // cancelAnalyze() terminates the worker directly, which fires 'exit'
    // below with a non-zero code — settled guards against that racing a
    // 'message'/'error' handler that already settled the promise first.
    let settled = false

    worker.on('message', (message: AnalyzeWorkerMessage) => {
      if (settled) return
      if (message.type === 'progress') {
        onProgress(message.progress)
        return
      }
      settled = true
      if (message.type === 'done') {
        setCachedMetadata(message.metadata)
        resolve(message.groups)
      } else {
        reject(new Error(message.message))
      }
      void worker.terminate()
    })

    worker.on('error', (err) => {
      if (settled) return
      settled = true
      reject(err)
    })
    worker.on('exit', (code) => {
      if (activeWorker === worker) activeWorker = null
      if (settled) return
      settled = true
      reject(new Error(`Analyze worker exited with code ${code}`))
    })
  })
}

export function cancelAnalyze(): void {
  if (!activeWorker) return
  void activeWorker.terminate()
  activeWorker = null
}
