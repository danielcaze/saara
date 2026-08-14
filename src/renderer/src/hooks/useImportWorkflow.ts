// src/renderer/src/hooks/useImportWorkflow.ts
import { useCallback, useEffect, useReducer } from 'react'
import type {
  AnalyzeProgress,
  CopyProgressEvent,
  CopySummary,
  DriveStatus,
  PhotoGroup
} from '../../../shared/types'

// Electron's ipcRenderer.invoke wraps main-process errors as
// `Error invoking remote method '<channel>': Error: <original message>` —
// strip that wrapper so the UI shows the original, user-facing message.
function friendlyIpcError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?(.*)$/s)
  return match ? match[1] : raw
}

// Mirrors src/shared/clustering/suggestGroupName.ts's date-stamp convention,
// so a blanked-out rename falls back to the same name auto-generation would
// have produced, not a generic placeholder.
function defaultGroupName(group: PhotoGroup): string {
  if (group.isNoDateGroup || !group.startDate || !group.endDate) return 'No date'
  const start = group.startDate.slice(0, 10)
  const end = group.endDate.slice(0, 10)
  return start === end ? start : `${start}_to_${end}`
}

type DestinationType = 'local' | 'drive'

interface State {
  sourcePath: string | null
  destinationPath: string | null
  destinationType: DestinationType
  driveStatus: DriveStatus
  driveConnecting: boolean
  driveError: string | null
  thresholdHours: number
  analyzeProgress: AnalyzeProgress | null
  analyzeError: string | null
  groups: PhotoGroup[]
  copying: boolean
  copyProgress: CopyProgressEvent | null
  copySummary: CopySummary | null
  copyError: string | null
}

type Action =
  | { type: 'SET_SOURCE'; path: string }
  | { type: 'SET_DESTINATION'; path: string }
  | { type: 'TOGGLE_DESTINATION_TYPE' }
  | { type: 'DRIVE_STATUS_LOADED'; status: DriveStatus }
  | { type: 'DRIVE_CONNECTING' }
  | { type: 'DRIVE_CONNECTED'; status: DriveStatus }
  | { type: 'DRIVE_CONNECT_ERROR'; message: string }
  | { type: 'DRIVE_DISCONNECTED' }
  | { type: 'SET_THRESHOLD_HOURS'; hours: number }
  | { type: 'ANALYZE_PROGRESS'; progress: AnalyzeProgress }
  | { type: 'ANALYZE_DONE'; groups: PhotoGroup[] }
  | { type: 'ANALYZE_ERROR'; message: string }
  | { type: 'SET_GROUPS'; groups: PhotoGroup[] }
  | { type: 'START_COPY' }
  | { type: 'COPY_PROGRESS'; progress: CopyProgressEvent }
  | { type: 'COPY_DONE'; summary: CopySummary }
  | { type: 'COPY_ERROR'; message: string }

const initialState: State = {
  sourcePath: null,
  destinationPath: null,
  destinationType: 'local',
  driveStatus: { connected: false, email: null },
  driveConnecting: false,
  driveError: null,
  thresholdHours: 24,
  analyzeProgress: null,
  analyzeError: null,
  groups: [],
  copying: false,
  copyProgress: null,
  copySummary: null,
  copyError: null
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_SOURCE':
      return {
        ...state,
        sourcePath: action.path,
        groups: [],
        analyzeError: null,
        copySummary: null
      }
    case 'SET_DESTINATION':
      return { ...state, destinationPath: action.path, copySummary: null }
    case 'TOGGLE_DESTINATION_TYPE':
      return {
        ...state,
        destinationType: state.destinationType === 'local' ? 'drive' : 'local',
        copySummary: null,
        driveError: null
      }
    case 'DRIVE_STATUS_LOADED':
      return { ...state, driveStatus: action.status }
    case 'DRIVE_CONNECTING':
      return { ...state, driveConnecting: true, driveError: null }
    case 'DRIVE_CONNECTED':
      return { ...state, driveConnecting: false, driveStatus: action.status, driveError: null }
    case 'DRIVE_CONNECT_ERROR':
      return { ...state, driveConnecting: false, driveError: action.message }
    case 'DRIVE_DISCONNECTED':
      return { ...state, driveStatus: { connected: false, email: null } }
    case 'SET_THRESHOLD_HOURS':
      return { ...state, thresholdHours: action.hours }
    case 'ANALYZE_PROGRESS':
      return { ...state, analyzeProgress: action.progress, analyzeError: null }
    case 'ANALYZE_DONE':
      return { ...state, groups: action.groups, analyzeProgress: null, analyzeError: null }
    case 'ANALYZE_ERROR':
      return { ...state, analyzeProgress: null, analyzeError: action.message, groups: [] }
    case 'SET_GROUPS':
      return { ...state, groups: action.groups }
    case 'START_COPY':
      return { ...state, copying: true, copyProgress: null, copySummary: null, copyError: null }
    case 'COPY_PROGRESS':
      return { ...state, copyProgress: action.progress }
    case 'COPY_DONE':
      return { ...state, copying: false, copySummary: action.summary }
    case 'COPY_ERROR':
      return { ...state, copying: false, copyError: action.message }
    default:
      return state
  }
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
    startCopy
  }
}
