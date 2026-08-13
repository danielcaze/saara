// src/renderer/src/hooks/useImportWorkflow.ts
import { useCallback, useEffect, useReducer } from 'react'
import type {
  AnalyzeProgress,
  CopyProgressEvent,
  CopySummary,
  PhotoGroup
} from '../../../shared/types'

const DEFAULT_GROUP_NAME = 'Untitled group'

interface State {
  sourcePath: string | null
  destinationPath: string | null
  thresholdHours: number
  analyzeProgress: AnalyzeProgress | null
  analyzeError: string | null
  groups: PhotoGroup[]
  copying: boolean
  copyProgress: CopyProgressEvent | null
  copySummary: CopySummary | null
}

type Action =
  | { type: 'SET_SOURCE'; path: string }
  | { type: 'SET_DESTINATION'; path: string }
  | { type: 'SET_THRESHOLD_HOURS'; hours: number }
  | { type: 'ANALYZE_PROGRESS'; progress: AnalyzeProgress }
  | { type: 'ANALYZE_DONE'; groups: PhotoGroup[] }
  | { type: 'ANALYZE_ERROR'; message: string }
  | { type: 'SET_GROUPS'; groups: PhotoGroup[] }
  | { type: 'START_COPY' }
  | { type: 'COPY_PROGRESS'; progress: CopyProgressEvent }
  | { type: 'COPY_DONE'; summary: CopySummary }

const initialState: State = {
  sourcePath: null,
  destinationPath: null,
  thresholdHours: 24,
  analyzeProgress: null,
  analyzeError: null,
  groups: [],
  copying: false,
  copyProgress: null,
  copySummary: null
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
      return { ...state, copying: true, copyProgress: null, copySummary: null }
    case 'COPY_PROGRESS':
      return { ...state, copyProgress: action.progress }
    case 'COPY_DONE':
      return { ...state, copying: false, copySummary: action.summary }
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
  }, [])

  const runAnalyze = useCallback(async (sourcePath: string, thresholdHours: number) => {
    const unsubscribe = window.saaraAPI.onAnalyzeProgress((progress) => {
      dispatch({ type: 'ANALYZE_PROGRESS', progress })
    })
    try {
      const { groups } = await window.saaraAPI.analyze(sourcePath, thresholdHours * 3600_000)
      dispatch({ type: 'ANALYZE_DONE', groups })
    } catch (err) {
      dispatch({ type: 'ANALYZE_ERROR', message: err instanceof Error ? err.message : String(err) })
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
    if (!state.destinationPath) return
    dispatch({ type: 'START_COPY' })
    const unsubscribe = window.saaraAPI.onCopyProgress((progress) => {
      dispatch({ type: 'COPY_PROGRESS', progress })
    })
    const summary = await window.saaraAPI.copyStart(
      state.destinationPath,
      state.groups.map((g) => ({
        id: g.id,
        name: g.name.trim() || DEFAULT_GROUP_NAME,
        files: g.files.map((f) => ({ sourcePath: f.path, fileName: f.fileName }))
      }))
    )
    unsubscribe()
    dispatch({ type: 'COPY_DONE', summary })
  }, [state.destinationPath, state.groups])

  return {
    state,
    pickSource,
    dropSource,
    pickDestination,
    dropDestination,
    recluster,
    renameGroup,
    startCopy
  }
}
