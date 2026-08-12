import { useReducer, useCallback } from 'react'
import type {
  AnalyzeProgress,
  CopyProgressEvent,
  CopySummary,
  PhotoGroup
} from '../../../shared/types'

type Stage = 'setup' | 'review'

interface State {
  stage: Stage
  sourcePath: string | null
  destinationPath: string | null
  thresholdHours: number
  analyzeProgress: AnalyzeProgress | null
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
  | { type: 'SET_GROUPS'; groups: PhotoGroup[] }
  | { type: 'START_COPY' }
  | { type: 'COPY_PROGRESS'; progress: CopyProgressEvent }
  | { type: 'COPY_DONE'; summary: CopySummary }

const initialState: State = {
  stage: 'setup',
  sourcePath: null,
  destinationPath: null,
  thresholdHours: 24,
  analyzeProgress: null,
  groups: [],
  copying: false,
  copyProgress: null,
  copySummary: null
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_SOURCE':
      return { ...state, sourcePath: action.path }
    case 'SET_DESTINATION':
      return { ...state, destinationPath: action.path }
    case 'SET_THRESHOLD_HOURS':
      return { ...state, thresholdHours: action.hours }
    case 'ANALYZE_PROGRESS':
      return { ...state, analyzeProgress: action.progress }
    case 'ANALYZE_DONE':
      return { ...state, stage: 'review', groups: action.groups, analyzeProgress: null }
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

export interface ImportWorkflow {
  state: State
  pickSource: () => Promise<void>
  pickDestination: () => Promise<void>
  setThresholdHours: (hours: number) => void
  analyze: () => Promise<void>
  recluster: (hours: number) => Promise<void>
  renameGroup: (groupId: string, name: string) => void
  startCopy: () => Promise<void>
}

export function useImportWorkflow(): ImportWorkflow {
  const [state, dispatch] = useReducer(reducer, initialState)

  const pickSource = useCallback(async () => {
    const path = await window.saaraAPI.selectFolder('source')
    if (path) dispatch({ type: 'SET_SOURCE', path })
  }, [])

  const pickDestination = useCallback(async () => {
    const path = await window.saaraAPI.selectFolder('destination')
    if (path) dispatch({ type: 'SET_DESTINATION', path })
  }, [])

  const setThresholdHours = useCallback((hours: number) => {
    dispatch({ type: 'SET_THRESHOLD_HOURS', hours })
  }, [])

  const analyze = useCallback(async () => {
    if (!state.sourcePath) return
    const unsubscribe = window.saaraAPI.onAnalyzeProgress((progress) => {
      dispatch({ type: 'ANALYZE_PROGRESS', progress })
    })
    const { groups } = await window.saaraAPI.analyze(
      state.sourcePath,
      state.thresholdHours * 3600_000
    )
    unsubscribe()
    dispatch({ type: 'ANALYZE_DONE', groups })
  }, [state.sourcePath, state.thresholdHours])

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
        name: g.name,
        files: g.files.map((f) => ({ sourcePath: f.path, fileName: f.fileName }))
      }))
    )
    unsubscribe()
    dispatch({ type: 'COPY_DONE', summary })
  }, [state.destinationPath, state.groups])

  return {
    state,
    pickSource,
    pickDestination,
    setThresholdHours,
    analyze,
    recluster,
    renameGroup,
    startCopy
  }
}
