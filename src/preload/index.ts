import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipcChannels'
import type {
  AnalyzeProgress,
  CopyPlanGroup,
  CopyProgressEvent,
  CopySummary,
  MediaType,
  PhotoGroup
} from '../shared/types'

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

  recluster: (thresholdMs: number): Promise<{ groups: PhotoGroup[] }> =>
    ipcRenderer.invoke(IPC.RECOMPUTE_CLUSTERS, { thresholdMs }),

  getThumbnail: (path: string, mediaType: MediaType): Promise<{ dataUrl: string } | null> =>
    ipcRenderer.invoke(IPC.GET_THUMBNAIL, { path, mediaType }),

  copyStart: (destinationRoot: string, groups: CopyPlanGroup[]): Promise<CopySummary> =>
    ipcRenderer.invoke(IPC.COPY_START, { destinationRoot, groups }),

  onCopyProgress: (cb: (p: CopyProgressEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: CopyProgressEvent): void => cb(p)
    ipcRenderer.on(IPC.COPY_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC.COPY_PROGRESS, listener)
  },

  openPath: (path: string): Promise<void> => ipcRenderer.invoke(IPC.OPEN_PATH, { path })
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
