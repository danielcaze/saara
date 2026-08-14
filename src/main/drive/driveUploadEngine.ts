import { sanitizeFolderName } from '../fs/sanitizeFolderName'
import { uniqueFolderPath } from '../fs/copyEngine'
import { DriveNetworkError, type DriveApi, type DriveFolderRef } from './driveApi'
import type { CopyPlanGroup, CopyProgressEvent, CopySummary } from '../../shared/types'

export interface DriveUploadPlan {
  rootFolderId: string
  groups: CopyPlanGroup[]
}

export interface RunDriveUploadPlanOptions {
  wait?: (ms: number) => Promise<void>
  maxBackoffMs?: number
}

export async function getOrCreateRootFolder(
  api: DriveApi,
  name = 'Saara'
): Promise<DriveFolderRef> {
  const existing = await api.findFolder('root', name)
  if (existing) return existing
  return api.createFolder('root', name)
}

// Retries the whole find-or-create-folder + list-existing-files setup on a
// network blip, same as the per-file upload loop below — without this, a
// blip during setup (which happens once per group, before any file-level
// retry logic even runs) would abort the entire plan instead of pausing,
// losing progress on every group after it. Only DriveNetworkError retries;
// any other error (e.g. a real permission problem) still propagates and
// aborts, same as before this existed.
async function setupGroupFolder(
  api: DriveApi,
  rootFolderId: string,
  folderName: string,
  onNetworkPause: () => Promise<void>
): Promise<{ folder: DriveFolderRef; existingNames: Set<string> }> {
  for (;;) {
    try {
      let folder = await api.findFolder(rootFolderId, folderName)
      if (!folder) folder = await api.createFolder(rootFolderId, folderName)
      const existingNames = await api.listFileNames(folder.id)
      return { folder, existingNames }
    } catch (err) {
      if (!(err instanceof DriveNetworkError)) throw err
      await onNetworkPause()
    }
  }
}

export async function runDriveUploadPlan(
  plan: DriveUploadPlan,
  onProgress: (e: CopyProgressEvent) => void,
  api: DriveApi,
  options: RunDriveUploadPlanOptions = {}
): Promise<CopySummary> {
  const wait =
    options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const maxBackoffMs = options.maxBackoffMs ?? 20000
  const summary: CopySummary = {
    totalFiles: 0,
    copiedFiles: 0,
    skippedFiles: 0,
    conflicts: [],
    errors: []
  }
  const totalFiles = plan.groups.reduce((sum, g) => sum + g.files.length, 0)
  let doneSoFar = 0
  const takenFolderNames = new Set<string>()

  for (const group of plan.groups) {
    // uniqueFolderPath (reused from copyEngine.ts's local-copy engine)
    // suffixes a name only if it collides with another group *within this
    // plan* — it deliberately doesn't check Drive for a pre-existing folder
    // of that name, since a pre-existing one (from an earlier run) should be
    // reused for skip-duplicates, not treated as a collision.
    const folderName = uniqueFolderPath(sanitizeFolderName(group.name), takenFolderNames)
    let setupAttempt = 0
    const { folder, existingNames } = await setupGroupFolder(
      api,
      plan.rootFolderId,
      folderName,
      async () => {
        setupAttempt++
        onProgress({
          groupId: group.id,
          groupName: group.name,
          fileName: group.files[0]?.fileName ?? '',
          filesCopiedSoFar: doneSoFar,
          totalFiles,
          status: 'paused'
        })
        await wait(Math.min(5000 * 2 ** (setupAttempt - 1), maxBackoffMs))
      }
    )

    for (const file of group.files) {
      summary.totalFiles++

      if (existingNames.has(file.fileName)) {
        summary.skippedFiles++
        doneSoFar++
        onProgress({
          groupId: group.id,
          groupName: group.name,
          fileName: file.fileName,
          filesCopiedSoFar: doneSoFar,
          totalFiles,
          status: 'done'
        })
        continue
      }

      let attempt = 0
      for (;;) {
        try {
          await api.uploadFile({
            parentId: folder.id,
            filePath: file.sourcePath,
            fileName: file.fileName,
            // driveApi's uploadFile already retries indefinitely on its own
            // for a mid-upload network blip (true resumable-upload retry);
            // this surfaces that internal pause as a 'paused' progress event
            // too, so the UI doesn't just sit still with no feedback during
            // that internal retry. The outer retry loop here still matters
            // for two cases where uploadFile throws DriveNetworkError out
            // instead of handling it internally: a session-start failure
            // (no bytes sent yet, safe to retry the whole call from scratch)
            // and a network blip during uploadFile's own internal
            // "how many bytes did you actually get" resume-offset check
            // (which has no retry loop of its own) — the latter can happen
            // after bytes have already been sent, so the outer retry here
            // starts a fresh upload session rather than truly resuming in
            // that specific case.
            onPause: () =>
              onProgress({
                groupId: group.id,
                groupName: group.name,
                fileName: file.fileName,
                filesCopiedSoFar: doneSoFar,
                totalFiles,
                status: 'paused'
              })
          })
          summary.copiedFiles++
          break
        } catch (err) {
          if (err instanceof DriveNetworkError) {
            attempt++
            onProgress({
              groupId: group.id,
              groupName: group.name,
              fileName: file.fileName,
              filesCopiedSoFar: doneSoFar,
              totalFiles,
              status: 'paused'
            })
            await wait(Math.min(5000 * 2 ** (attempt - 1), maxBackoffMs))
            continue
          }
          summary.errors.push({
            path: file.sourcePath,
            message: err instanceof Error ? err.message : String(err)
          })
          break
        }
      }

      doneSoFar++
      onProgress({
        groupId: group.id,
        groupName: group.name,
        fileName: file.fileName,
        filesCopiedSoFar: doneSoFar,
        totalFiles,
        status: 'uploading'
      })
    }
  }

  return summary
}
