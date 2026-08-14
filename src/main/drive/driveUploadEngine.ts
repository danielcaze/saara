import { sanitizeFolderName } from '../fs/sanitizeFolderName'
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

  for (const group of plan.groups) {
    const folderName = sanitizeFolderName(group.name)
    let folder = await api.findFolder(plan.rootFolderId, folderName)
    if (!folder) folder = await api.createFolder(plan.rootFolderId, folderName)
    const existingNames = await api.listFileNames(folder.id)

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
            // for the *session-start* failure case, where uploadFile throws
            // DriveNetworkError outright (no bytes sent yet, safe to retry
            // the whole call).
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
