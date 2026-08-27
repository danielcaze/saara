import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipcChannels'
import type {
  AnalyzeProgress,
  CopyPlanGroup,
  CopyProgressEvent,
  CopySummary,
  DriveStatus,
  MediaType,
  PhotoGroup
} from '../shared/types'
import type { Settings } from '../shared/settingsSchema'

// Custom APIs for renderer
const api = {}

const saaraAPI = {
  selectFolder: (role: 'source' | 'destination'): Promise<string | null> =>
    ipcRenderer.invoke(IPC.SELECT_FOLDER, { role }),

  analyze: (sourcePath: string, thresholdMs: number): Promise<{ groups: PhotoGroup[] }> =>
    ipcRenderer.invoke(IPC.ANALYZE, { sourcePath, thresholdMs }),

  onAnalyzeProgress: (cb: (p: AnalyzeProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: AnalyzeProgress): void => cb(p)
    ipcRenderer.on(IPC.ANALYZE_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC.ANALYZE_PROGRESS, listener)
  },

  analyzeCancel: (): Promise<void> => ipcRenderer.invoke(IPC.ANALYZE_CANCEL),

  recluster: (thresholdMs: number): Promise<{ groups: PhotoGroup[] }> =>
    ipcRenderer.invoke(IPC.RECOMPUTE_CLUSTERS, { thresholdMs }),

  getThumbnail: (path: string, mediaType: MediaType): Promise<{ dataUrl: string } | null> =>
    ipcRenderer.invoke(IPC.GET_THUMBNAIL, { path, mediaType }),

  getLightboxPreview: (path: string, mediaType: MediaType): Promise<{ dataUrl: string } | null> =>
    ipcRenderer.invoke(IPC.GET_LIGHTBOX_PREVIEW, { path, mediaType }),

  copyStart: (
    destinationRoot: string,
    groups: CopyPlanGroup[],
    prefixFileNames: boolean
  ): Promise<CopySummary> =>
    ipcRenderer.invoke(IPC.COPY_START, { destinationRoot, groups, prefixFileNames }),

  onCopyProgress: (cb: (p: CopyProgressEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: CopyProgressEvent): void => cb(p)
    ipcRenderer.on(IPC.COPY_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC.COPY_PROGRESS, listener)
  },

  openPath: (path: string): Promise<void> => ipcRenderer.invoke(IPC.OPEN_PATH, { path }),

  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.SETTINGS_GET),

  setSettings: (settings: Settings): Promise<void> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET, settings),

  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  driveStatus: (): Promise<DriveStatus> => ipcRenderer.invoke(IPC.DRIVE_STATUS),

  driveConnect: (): Promise<DriveStatus> => ipcRenderer.invoke(IPC.DRIVE_CONNECT),

  driveDisconnect: (): Promise<void> => ipcRenderer.invoke(IPC.DRIVE_DISCONNECT),

  driveUploadStart: (groups: CopyPlanGroup[]): Promise<CopySummary> =>
    ipcRenderer.invoke(IPC.DRIVE_UPLOAD_START, { groups }),

  onDriveUploadProgress: (cb: (p: CopyProgressEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: CopyProgressEvent): void => cb(p)
    ipcRenderer.on(IPC.DRIVE_UPLOAD_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC.DRIVE_UPLOAD_PROGRESS, listener)
  },

  openDriveRoot: (): Promise<void> => ipcRenderer.invoke(IPC.DRIVE_OPEN_ROOT),

  shareDriveGroup: (folderId: string): Promise<string> =>
    ipcRenderer.invoke(IPC.DRIVE_SHARE_GROUP, { folderId }),

  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('saaraAPI', saaraAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.saaraAPI = saaraAPI
}

export type SaaraAPI = typeof saaraAPI
