// src/main/ipc/handlers.ts
import { ipcMain, dialog, shell, BrowserWindow, app, safeStorage } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import {
  selectFolderRequestSchema,
  analyzeRequestSchema,
  reclusterRequestSchema,
  getThumbnailRequestSchema,
  getLightboxPreviewRequestSchema,
  copyStartRequestSchema,
  openPathRequestSchema,
  settingsSetRequestSchema,
  driveUploadStartRequestSchema,
  driveShareGroupRequestSchema
} from '../../shared/ipcSchemas'
import { recluster } from '../importSession'
import { runAnalyzeInWorker } from '../analyzeWorkerRunner'
import { runCopyPlan } from '../fs/copyEngine'
import { extractThumbnail, extractLightboxPreview } from '../thumbnails/extractThumbnail'
import { getSettings, setSettings } from '../settings/settingsStore'
import {
  getDriveTokens,
  setDriveTokens,
  clearDriveTokens,
  type TokenCipher
} from '../drive/driveAuthStore'
import { getDriveOAuthConfig, type DriveOAuthConfig } from '../drive/driveConfig'
import { connectDrive, createAuthorizedClient } from '../drive/driveAuth'
import { createGoogleDriveApi, type DriveApi } from '../drive/driveApi'
import { getOrCreateRootFolder, runDriveUploadPlan } from '../drive/driveUploadEngine'

const driveCipher: TokenCipher = {
  encrypt: (text) => safeStorage.encryptString(text),
  decrypt: (buf) => safeStorage.decryptString(buf)
}

const driveFolderLinks = new Map<string, string>()

function requireDriveConfig(): DriveOAuthConfig {
  const config = getDriveOAuthConfig()
  if (!config) {
    throw new Error(
      'Google Drive is not configured for this build (missing GOOGLE_DRIVE_CLIENT_ID/GOOGLE_DRIVE_CLIENT_SECRET).'
    )
  }
  return config
}

async function getConnectedDriveApi(): Promise<DriveApi> {
  const config = requireDriveConfig()
  const tokens = await getDriveTokens(app.getPath('userData'), driveCipher)
  if (!tokens) throw new Error('Google Drive is not connected.')
  const oauth2Client = createAuthorizedClient(config, tokens.refreshToken)
  return createGoogleDriveApi(async () => {
    const { token } = await oauth2Client.getAccessToken()
    if (!token) throw new Error('Failed to obtain a Google access token.')
    return token
  })
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.SELECT_FOLDER, async (_event, payload) => {
    const { role } = selectFolderRequestSchema.parse(payload)
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: role === 'source' ? 'Select source folder (SD card)' : 'Select destination folder'
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.ANALYZE, async (_event, payload) => {
    const { sourcePath, thresholdMs } = analyzeRequestSchema.parse(payload)
    const groups = await runAnalyzeInWorker(sourcePath, thresholdMs, (progress) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.ANALYZE_PROGRESS, progress)
      }
    })
    return { groups }
  })

  ipcMain.handle(IPC.RECOMPUTE_CLUSTERS, async (_event, payload) => {
    const { thresholdMs } = reclusterRequestSchema.parse(payload)
    return { groups: recluster(thresholdMs) }
  })

  ipcMain.handle(IPC.GET_THUMBNAIL, async (_event, payload) => {
    const { path, mediaType } = getThumbnailRequestSchema.parse(payload)
    const dataUrl = await extractThumbnail(path, mediaType)
    return dataUrl ? { dataUrl } : null
  })

  ipcMain.handle(IPC.GET_LIGHTBOX_PREVIEW, async (_event, payload) => {
    const { path, mediaType } = getLightboxPreviewRequestSchema.parse(payload)
    const dataUrl = await extractLightboxPreview(path, mediaType)
    return dataUrl ? { dataUrl } : null
  })

  ipcMain.handle(IPC.COPY_START, async (_event, payload) => {
    const { destinationRoot, groups } = copyStartRequestSchema.parse(payload)
    return runCopyPlan({ destinationRoot, groups }, (progress) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.COPY_PROGRESS, progress)
      }
    })
  })

  ipcMain.handle(IPC.OPEN_PATH, async (_event, payload) => {
    const { path } = openPathRequestSchema.parse(payload)
    await shell.openPath(path)
  })

  ipcMain.handle(IPC.SETTINGS_GET, async () => {
    return getSettings(app.getPath('userData'))
  })

  ipcMain.handle(IPC.SETTINGS_SET, async (_event, payload) => {
    const settings = settingsSetRequestSchema.parse(payload)
    await setSettings(app.getPath('userData'), settings)
  })

  ipcMain.handle(IPC.DRIVE_STATUS, async () => {
    const tokens = await getDriveTokens(app.getPath('userData'), driveCipher)
    return { connected: !!tokens, email: tokens?.email ?? null }
  })

  ipcMain.handle(IPC.DRIVE_CONNECT, async () => {
    const config = requireDriveConfig()
    const result = await connectDrive(config)
    await setDriveTokens(app.getPath('userData'), driveCipher, {
      refreshToken: result.refreshToken,
      email: result.email
    })
    return { connected: true, email: result.email }
  })

  ipcMain.handle(IPC.DRIVE_DISCONNECT, async () => {
    await clearDriveTokens(app.getPath('userData'))
  })

  ipcMain.handle(IPC.DRIVE_UPLOAD_START, async (_event, payload) => {
    const { groups } = driveUploadStartRequestSchema.parse(payload)
    const api = await getConnectedDriveApi()
    const root = await getOrCreateRootFolder(api)
    const summary = await runDriveUploadPlan(
      { rootFolderId: root.id, groups },
      (progress) => {
        const win = getWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC.DRIVE_UPLOAD_PROGRESS, progress)
        }
      },
      api
    )
    for (const group of summary.driveGroups ?? []) {
      if (group.webViewLink) driveFolderLinks.set(group.folderId, group.webViewLink)
    }
    return summary
  })

  ipcMain.handle(IPC.DRIVE_OPEN_ROOT, async () => {
    const api = await getConnectedDriveApi()
    const root = await getOrCreateRootFolder(api)
    if (root.webViewLink) await shell.openExternal(root.webViewLink)
  })

  ipcMain.handle(IPC.DRIVE_SHARE_GROUP, async (_event, payload) => {
    const { folderId } = driveShareGroupRequestSchema.parse(payload)
    const api = await getConnectedDriveApi()
    await api.createSharePermission(folderId)
    const link = driveFolderLinks.get(folderId) ?? (await api.getWebViewLink(folderId))
    if (!link) throw new Error('Drive did not return a link for this folder.')
    driveFolderLinks.set(folderId, link)
    return link
  })
}
