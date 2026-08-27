import os from 'node:os'
import { ExifTool } from 'exiftool-vendored'

// Caller dispatches reads concurrently up to this same limit (see
// extractMetadataBatch), so this is the real ceiling on parallel exiftool
// child processes, not just a queue depth. Capped at 4 — each proc is a
// real OS process, and reading from an SD card is I/O-bound past a point,
// so more procs than that mostly adds spawn overhead without speeding
// anything up.
export const EXIFTOOL_MAX_PROCS = Math.max(2, Math.min(4, os.cpus().length))

export const exiftool = new ExifTool({ maxProcs: EXIFTOOL_MAX_PROCS })

export async function shutdownExiftool(): Promise<void> {
  await exiftool.end()
}
