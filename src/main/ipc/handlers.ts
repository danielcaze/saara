import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import {
  selectFolderRequestSchema,
  analyzeRequestSchema,
  reclusterRequestSchema,
  getThumbnailRequestSchema,
  copyStartRequestSchema,
  openPathRequestSchema,
} from '../../shared/ipcSchemas'
import { analyzeSource, recluster } from '../importSession'
import { runCopyPlan } from '../fs/copyEngine'
import { extractThumbnail } from '../thumbnails/extractThumbnail'

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.SELECT_FOLDER, async (_event, payload) => {
    const { role } = selectFolderRequestSchema.parse(payload)
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: role === 'source' ? 'Selecionar pasta de origem (cartão SD)' : 'Selecionar pasta de destino',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.ANALYZE, async (_event, payload) => {
    const { sourcePath, thresholdMs } = analyzeRequestSchema.parse(payload)
    const groups = await analyzeSource(sourcePath, thresholdMs, (progress) => {
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
}
