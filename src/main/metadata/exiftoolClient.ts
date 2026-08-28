import os from 'node:os'
import { ExifTool } from 'exiftool-vendored'

// Caller dispatches reads concurrently up to this same limit (see
// extractMetadataBatch), so this is the real ceiling on parallel exiftool
// child processes, not just a queue depth. A slow SD-card-via-USB adapter is
// latency-bound per file, not bandwidth-saturated (this was proven wrong
// once already for the copy step's concurrency cap) — video files in
// particular often need a seek to EOF for the moov atom, so more procs in
// flight hides that latency instead of serializing it.
export const EXIFTOOL_MAX_PROCS = Math.max(2, Math.min(8, os.cpus().length))

export const exiftool = new ExifTool({ maxProcs: EXIFTOOL_MAX_PROCS })

export async function shutdownExiftool(): Promise<void> {
  await exiftool.end()
}
