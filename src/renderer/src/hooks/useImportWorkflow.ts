// src/renderer/src/hooks/useImportWorkflow.ts
import { useCallback, useEffect, useReducer } from 'react'
import {
  defaultGroupName,
  flattenGroupFiles,
  initialState,
  reducer,
  type State
} from './importWorkflowReducer'

// Electron's ipcRenderer.invoke wraps main-process errors as
// `Error invoking remote method '<channel>': Error: <original message>` —
// strip that wrapper so the UI shows the original, user-facing message.
function friendlyIpcError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?(.*)$/s)
  return match ? match[1] : raw
}

interface ImportWorkflow {
  state: State
  pickSource: () => Promise<void>
  dropSource: (path: string) => Promise<void>
  pickDestination: () => Promise<void>
  dropDestination: (path: string) => void
  toggleDestinationType: () => void
  connectDrive: () => Promise<void>
  disconnectDrive: () => Promise<void>
  recluster: (hours: number) => Promise<void>
  renameGroup: (groupId: string, name: string) => void
  startCopy: () => Promise<void>
  openViewer: (path: string) => void
  closeViewer: () => void
  viewerNext: () => void
  viewerPrev: () => void
  toggleSelect: (path: string) => void
  clearSelection: () => void
  selectPaths: (paths: string[]) => void
  deleteFiles: (paths: string[]) => void
  moveFiles: (paths: string[], targetGroupId: string) => void
  reorderFiles: (groupId: string, path: string, targetIndex: number) => void
  createGroupAndMoveFiles: (paths: string[], name?: string) => void
  renameFile: (path: string, fileName: string) => void
}

export function useImportWorkflow(): ImportWorkflow {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    window.saaraAPI.getSettings().then(({ thresholdHours }) => {
      dispatch({ type: 'SET_THRESHOLD_HOURS', hours: thresholdHours })
    })
    window.saaraAPI.driveStatus().then((status) => {
      dispatch({ type: 'DRIVE_STATUS_LOADED', status })
    })
  }, [])

  const runAnalyze = useCallback(async (sourcePath: string, thresholdHours: number) => {
    const unsubscribe = window.saaraAPI.onAnalyzeProgress((progress) => {
      dispatch({ type: 'ANALYZE_PROGRESS', progress })
    })
    try {
      const { groups } = await window.saaraAPI.analyze(sourcePath, thresholdHours * 3600_000)
      dispatch({ type: 'ANALYZE_DONE', groups })
    } catch (err) {
      dispatch({ type: 'ANALYZE_ERROR', message: friendlyIpcError(err) })
    } finally {
      unsubscribe()
    }
  }, [])

  const pickSource = useCallback(async () => {
    const path = await window.saaraAPI.selectFolder('source')
    if (!path) return
    dispatch({ type: 'SET_SOURCE', path })
    void runAnalyze(path, state.thresholdHours)
  }, [runAnalyze, state.thresholdHours])

  const dropSource = useCallback(
    async (path: string) => {
      dispatch({ type: 'SET_SOURCE', path })
      void runAnalyze(path, state.thresholdHours)
    },
    [runAnalyze, state.thresholdHours]
  )

  const pickDestination = useCallback(async () => {
    const path = await window.saaraAPI.selectFolder('destination')
    if (path) dispatch({ type: 'SET_DESTINATION', path })
  }, [])

  const dropDestination = useCallback((path: string) => {
    dispatch({ type: 'SET_DESTINATION', path })
  }, [])

  const toggleDestinationType = useCallback(() => {
    dispatch({ type: 'TOGGLE_DESTINATION_TYPE' })
  }, [])

  const connectDriveAccount = useCallback(async () => {
    dispatch({ type: 'DRIVE_CONNECTING' })
    try {
      const status = await window.saaraAPI.driveConnect()
      dispatch({ type: 'DRIVE_CONNECTED', status })
    } catch (err) {
      dispatch({ type: 'DRIVE_CONNECT_ERROR', message: friendlyIpcError(err) })
    }
  }, [])

  const disconnectDrive = useCallback(async () => {
    await window.saaraAPI.driveDisconnect()
    dispatch({ type: 'DRIVE_DISCONNECTED' })
  }, [])

  const recluster = useCallback(async (hours: number) => {
    dispatch({ type: 'SET_THRESHOLD_HOURS', hours })
    const { groups } = await window.saaraAPI.recluster(hours * 3600_000)
    dispatch({ type: 'SET_GROUPS', groups })
  }, [])

  const renameGroup = useCallback(
    (groupId: string, name: string) => {
      dispatch({
        type: 'SET_GROUPS',
        groups: state.groups.map((g) => (g.id === groupId ? { ...g, name } : g))
      })
    },
    [state.groups]
  )

  const startCopy = useCallback(async () => {
    const isDrive = state.destinationType === 'drive'
    if (isDrive ? !state.driveStatus.connected : !state.destinationPath) return

    dispatch({ type: 'START_COPY' })
    const unsubscribe = isDrive
      ? window.saaraAPI.onDriveUploadProgress((progress) =>
          dispatch({ type: 'COPY_PROGRESS', progress })
        )
      : window.saaraAPI.onCopyProgress((progress) => dispatch({ type: 'COPY_PROGRESS', progress }))

    const groups = state.groups.map((g) => ({
      id: g.id,
      name: g.name.trim() || defaultGroupName(g),
      files: g.files.map((f) => ({ sourcePath: f.path, fileName: f.fileName }))
    }))

    try {
      const summary = isDrive
        ? await window.saaraAPI.driveUploadStart(groups)
        : await window.saaraAPI.copyStart(state.destinationPath as string, groups)
      dispatch({ type: 'COPY_DONE', summary })
    } catch (err) {
      // Covers upfront failures with no per-file granularity to attach an error
      // to — Drive not connected, OAuth not configured, no network at all
      // before the first request even goes out. Without this, the UI would
      // stay stuck on "Uploading..." forever, since nothing else clears
      // `copying`.
      dispatch({ type: 'COPY_ERROR', message: friendlyIpcError(err) })
    } finally {
      unsubscribe()
    }
  }, [state.destinationType, state.destinationPath, state.driveStatus.connected, state.groups])

  const openViewer = useCallback(
    (path: string) => {
      const index = flattenGroupFiles(state.groups).findIndex((f) => f.file.path === path)
      if (index === -1) return
      dispatch({ type: 'OPEN_VIEWER', index })
    },
    [state.groups]
  )

  const closeViewer = useCallback(() => {
    dispatch({ type: 'CLOSE_VIEWER' })
  }, [])

  const viewerNext = useCallback(() => {
    if (state.viewerIndex === null) return
    dispatch({ type: 'SET_VIEWER_INDEX', index: state.viewerIndex + 1 })
  }, [state.viewerIndex])

  const viewerPrev = useCallback(() => {
    if (state.viewerIndex === null) return
    dispatch({ type: 'SET_VIEWER_INDEX', index: state.viewerIndex - 1 })
  }, [state.viewerIndex])

  const toggleSelect = useCallback((path: string) => {
    dispatch({ type: 'TOGGLE_SELECT', path })
  }, [])

  const clearSelection = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' })
  }, [])

  const selectPaths = useCallback((paths: string[]) => {
    dispatch({ type: 'SELECT_PATHS', paths })
  }, [])

  const deleteFiles = useCallback((paths: string[]) => {
    dispatch({ type: 'DELETE_FILES', paths })
  }, [])

  const moveFiles = useCallback((paths: string[], targetGroupId: string) => {
    dispatch({ type: 'MOVE_FILES', paths, targetGroupId })
  }, [])

  const reorderFiles = useCallback((groupId: string, path: string, targetIndex: number) => {
    dispatch({ type: 'REORDER_FILES', groupId, path, targetIndex })
  }, [])

  const createGroupAndMoveFiles = useCallback((paths: string[], name?: string) => {
    const groupId = `group-new-${crypto.randomUUID()}`
    dispatch({ type: 'CREATE_GROUP', groupId, name })
    dispatch({ type: 'MOVE_FILES', paths, targetGroupId: groupId })
  }, [])

  const renameFile = useCallback((path: string, fileName: string) => {
    dispatch({ type: 'RENAME_FILE', path, fileName })
  }, [])

  return {
    state,
    pickSource,
    dropSource,
    pickDestination,
    dropDestination,
    toggleDestinationType,
    connectDrive: connectDriveAccount,
    disconnectDrive,
    recluster,
    renameGroup,
    startCopy,
    openViewer,
    closeViewer,
    viewerNext,
    viewerPrev,
    toggleSelect,
    clearSelection,
    selectPaths,
    deleteFiles,
    moveFiles,
    reorderFiles,
    createGroupAndMoveFiles,
    renameFile
  }
}
