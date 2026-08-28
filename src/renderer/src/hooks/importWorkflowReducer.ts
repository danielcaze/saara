// src/renderer/src/hooks/importWorkflowReducer.ts
import type {
  AnalyzeProgress,
  CopyProgressEvent,
  CopySummary,
  DriveStatus,
  FileMeta,
  PhotoGroup
} from '../../../shared/types'

export type DestinationType = 'local' | 'drive'

// Mirrors src/shared/clustering/suggestGroupName.ts's date-stamp convention,
// so a blanked-out rename falls back to the same name auto-generation would
// have produced, not a generic placeholder.
export function defaultGroupName(group: PhotoGroup): string {
  if (group.isNoDateGroup || !group.startDate || !group.endDate) return 'No date'
  const start = group.startDate.slice(0, 10)
  const end = group.endDate.slice(0, 10)
  return start === end ? start : `${start}_to_${end}`
}

export interface FlatFile {
  file: FileMeta
  groupId: string
}

// Order matches exactly what's on screen: group order (top-to-bottom, as
// currently in state.groups), then file order within each group. This is
// the single source of truth for "what index is photo N" — Lightbox
// next/prev and OPEN_VIEWER both go through this, so a future reorder
// feature (Checkpoint 3) automatically changes navigation order too, since
// it changes the same underlying array.
export function flattenGroupFiles(groups: PhotoGroup[]): FlatFile[] {
  return groups.flatMap((group) => group.files.map((file) => ({ file, groupId: group.id })))
}

export interface State {
  sourcePath: string | null
  destinationPath: string | null
  destinationType: DestinationType
  driveStatus: DriveStatus
  driveConnecting: boolean
  driveError: string | null
  thresholdHours: number
  prefixCopiedFileNames: boolean
  analyzeProgress: AnalyzeProgress | null
  analyzeError: string | null
  groups: PhotoGroup[]
  copying: boolean
  copyProgress: CopyProgressEvent | null
  copySummary: CopySummary | null
  copyError: string | null
  viewerIndex: number | null
  selectedPaths: Set<string>
}

export type Action =
  | { type: 'SET_SOURCE'; path: string }
  | { type: 'REMOVE_SOURCE' }
  | { type: 'SET_DESTINATION'; path: string }
  | { type: 'TOGGLE_DESTINATION_TYPE' }
  | { type: 'DRIVE_STATUS_LOADED'; status: DriveStatus }
  | { type: 'DRIVE_CONNECTING' }
  | { type: 'DRIVE_CONNECTED'; status: DriveStatus }
  | { type: 'DRIVE_CONNECT_ERROR'; message: string }
  | { type: 'DRIVE_DISCONNECTED' }
  | { type: 'SET_THRESHOLD_HOURS'; hours: number }
  | { type: 'SET_PREFIX_COPIED_FILE_NAMES'; enabled: boolean }
  | { type: 'ANALYZE_PROGRESS'; progress: AnalyzeProgress }
  | { type: 'ANALYZE_DONE'; groups: PhotoGroup[] }
  | { type: 'ANALYZE_ERROR'; message: string }
  | { type: 'SET_GROUPS'; groups: PhotoGroup[] }
  | { type: 'START_COPY' }
  | { type: 'COPY_PROGRESS'; progress: CopyProgressEvent }
  | { type: 'COPY_DONE'; summary: CopySummary }
  | { type: 'COPY_ERROR'; message: string }
  | { type: 'OPEN_VIEWER'; index: number }
  | { type: 'CLOSE_VIEWER' }
  | { type: 'SET_VIEWER_INDEX'; index: number }
  | { type: 'TOGGLE_SELECT'; path: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SELECT_PATHS'; paths: string[] }
  | { type: 'DELETE_FILES'; paths: string[] }
  | { type: 'CREATE_GROUP'; groupId: string; name?: string }
  | { type: 'MOVE_FILES'; paths: string[]; targetGroupId: string }
  | { type: 'MOVE_FILE_TO_INDEX'; path: string; targetGroupId: string; targetIndex: number }
  | { type: 'REORDER_FILES'; groupId: string; path: string; targetIndex: number }
  | { type: 'RENAME_FILE'; path: string; fileName: string }

export const initialState: State = {
  sourcePath: null,
  destinationPath: null,
  destinationType: 'local',
  driveStatus: { connected: false, email: null },
  driveConnecting: false,
  driveError: null,
  thresholdHours: 24,
  prefixCopiedFileNames: false,
  analyzeProgress: null,
  analyzeError: null,
  groups: [],
  copying: false,
  copyProgress: null,
  copySummary: null,
  copyError: null,
  viewerIndex: null,
  selectedPaths: new Set()
}

function clampViewerIndex(index: number, flatLength: number): number | null {
  if (flatLength === 0) return null
  return Math.max(0, Math.min(index, flatLength - 1))
}

// Removes the given files from every group (matched by path, which is a
// full absolute filesystem path and therefore unique across the whole
// session), dropping any group left with zero files afterward — an empty
// group card has no purpose once its last file is gone.
function removeFilesFromGroups(groups: PhotoGroup[], paths: Set<string>): PhotoGroup[] {
  return groups
    .map((group) => ({ ...group, files: group.files.filter((f) => !paths.has(f.path)) }))
    .filter((group) => group.files.length > 0)
}

// Recomputes a group's date range from whatever files it currently holds.
// Called after any edit that changes a group's file membership (delete,
// move) — group.startDate/endDate/isNoDateGroup are derived data from
// clusterByGap at analysis time, and go stale the moment files.length
// changes, producing wrong date labels and wrong copy-time fallback
// folder names (see defaultGroupName) if left untouched. min/max instead
// of first/last because files aren't guaranteed sorted by timestamp after
// a move appends onto the end of a group.
function rebuildGroupMetadata(
  files: FileMeta[]
): Pick<PhotoGroup, 'startDate' | 'endDate' | 'isNoDateGroup'> {
  const dated = files.filter((f) => f.timestamp !== null)
  if (dated.length === 0) return { startDate: null, endDate: null, isNoDateGroup: true }
  let startDate = dated[0].timestamp as string
  let endDate = dated[0].timestamp as string
  for (const f of dated) {
    const t = f.timestamp as string
    if (t < startDate) startDate = t
    if (t > endDate) endDate = t
  }
  return { startDate, endDate, isNoDateGroup: false }
}

function withRebuiltMetadata(groups: PhotoGroup[]): PhotoGroup[] {
  return groups.map((g) => ({ ...g, ...rebuildGroupMetadata(g.files) }))
}

// A new group named after an existing one is confusing to tell apart in the
// list, so append " (N)" — the smallest N that isn't already taken.
function uniqueGroupName(groups: PhotoGroup[], name: string): string {
  const taken = new Set(groups.map((g) => g.name))
  if (!taken.has(name)) return name
  let n = 1
  while (taken.has(`${name} (${n})`)) n++
  return `${name} (${n})`
}

// After any edit that can change which files exist or where they sit in
// the flattened on-screen order (delete, move, a fresh analysis/recluster
// replacing groups wholesale), the viewer index and selection can point
// at the wrong photo or at paths that no longer exist. This reconciles
// both from the previous flattened order, by path — not by index — so
// the viewer keeps showing the same photo across an edit whenever that
// photo still exists, instead of drifting to whatever now occupies its
// old numeric slot (e.g. deleting the photo before the one you're
// viewing used to silently swap the displayed photo).
function reconcileAfterGroupsChange(
  prevFlat: FlatFile[],
  viewerIndex: number | null,
  selectedPaths: Set<string>,
  nextGroups: PhotoGroup[]
): { viewerIndex: number | null; selectedPaths: Set<string> } {
  const nextFlat = flattenGroupFiles(nextGroups)
  const nextPaths = new Set(nextFlat.map((f) => f.file.path))
  const selectedPathsNext = new Set([...selectedPaths].filter((p) => nextPaths.has(p)))

  if (viewerIndex === null || nextFlat.length === 0) {
    return {
      viewerIndex: nextFlat.length === 0 ? null : viewerIndex,
      selectedPaths: selectedPathsNext
    }
  }

  const currentPath = prevFlat[viewerIndex]?.file.path
  const idx = currentPath ? nextFlat.findIndex((f) => f.file.path === currentPath) : -1
  const viewerIndexNext = idx !== -1 ? idx : clampViewerIndex(viewerIndex, nextFlat.length)
  return { viewerIndex: viewerIndexNext, selectedPaths: selectedPathsNext }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_SOURCE':
      return {
        ...state,
        sourcePath: action.path,
        groups: [],
        analyzeError: null,
        copySummary: null,
        viewerIndex: null,
        selectedPaths: new Set()
      }
    case 'REMOVE_SOURCE':
      return {
        ...state,
        sourcePath: null,
        groups: [],
        analyzeProgress: null,
        analyzeError: null,
        copySummary: null,
        copyError: null,
        viewerIndex: null,
        selectedPaths: new Set()
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
    case 'SET_PREFIX_COPIED_FILE_NAMES':
      return { ...state, prefixCopiedFileNames: action.enabled }
    case 'ANALYZE_PROGRESS':
      return { ...state, analyzeProgress: action.progress, analyzeError: null }
    case 'ANALYZE_DONE':
      return {
        ...state,
        groups: action.groups,
        analyzeProgress: null,
        analyzeError: null,
        viewerIndex: null,
        selectedPaths: new Set()
      }
    case 'ANALYZE_ERROR':
      return {
        ...state,
        analyzeProgress: null,
        analyzeError: action.message,
        groups: [],
        viewerIndex: null,
        selectedPaths: new Set()
      }
    case 'SET_GROUPS': {
      // Shared by recluster (a full regroup — same class of change as
      // ANALYZE_DONE) and renameGroup (only a group's name changes, files/
      // order untouched). The reducer can't tell those apart from the
      // action alone, so reconcile by path instead of resetting — a no-op
      // when only a name changed, and correct when membership/order did.
      const prevFlat = flattenGroupFiles(state.groups)
      const { viewerIndex, selectedPaths } = reconcileAfterGroupsChange(
        prevFlat,
        state.viewerIndex,
        state.selectedPaths,
        action.groups
      )
      return { ...state, groups: action.groups, viewerIndex, selectedPaths }
    }
    case 'START_COPY':
      return { ...state, copying: true, copyProgress: null, copySummary: null, copyError: null }
    case 'COPY_PROGRESS':
      return { ...state, copyProgress: action.progress }
    case 'COPY_DONE':
      return { ...state, copying: false, copySummary: action.summary }
    case 'COPY_ERROR':
      return { ...state, copying: false, copyError: action.message }
    case 'OPEN_VIEWER':
      return {
        ...state,
        viewerIndex: clampViewerIndex(action.index, flattenGroupFiles(state.groups).length)
      }
    case 'CLOSE_VIEWER':
      return { ...state, viewerIndex: null }
    case 'SET_VIEWER_INDEX':
      return {
        ...state,
        viewerIndex: clampViewerIndex(action.index, flattenGroupFiles(state.groups).length)
      }
    case 'TOGGLE_SELECT': {
      const next = new Set(state.selectedPaths)
      if (next.has(action.path)) next.delete(action.path)
      else next.add(action.path)
      return { ...state, selectedPaths: next }
    }
    case 'CLEAR_SELECTION':
      return { ...state, selectedPaths: new Set() }
    case 'SELECT_PATHS':
      // Additive: a per-group Ctrl+A must not clobber a selection made in a
      // different group moments earlier — only the whole-session Ctrl+A
      // case (paths = every file) needs to "select everything," and union
      // already gets that for free.
      return { ...state, selectedPaths: new Set([...state.selectedPaths, ...action.paths]) }
    case 'DELETE_FILES': {
      const paths = new Set(action.paths)
      const prevFlat = flattenGroupFiles(state.groups)
      const groups = withRebuiltMetadata(removeFilesFromGroups(state.groups, paths))
      const { viewerIndex, selectedPaths } = reconcileAfterGroupsChange(
        prevFlat,
        state.viewerIndex,
        state.selectedPaths,
        groups
      )
      return { ...state, groups, viewerIndex, selectedPaths }
    }
    case 'CREATE_GROUP':
      return {
        ...state,
        groups: [
          ...state.groups,
          {
            id: action.groupId,
            name: uniqueGroupName(state.groups, action.name?.trim() || 'New group'),
            files: [],
            // An empty group has no dated files, so it must read as a
            // no-date group — leaving isNoDateGroup false here (with
            // startDate/endDate null) makes GroupCard's date label render
            // "undefined – undefined" instead of "No date".
            startDate: null,
            endDate: null,
            isNoDateGroup: true
          }
        ]
      }
    case 'MOVE_FILES': {
      const paths = new Set(action.paths)
      const moving = state.groups.flatMap((g) => g.files.filter((f) => paths.has(f.path)))
      if (moving.length === 0) return state
      const targetExists = state.groups.some((g) => g.id === action.targetGroupId)
      if (!targetExists) return state

      const prevFlat = flattenGroupFiles(state.groups)
      // Every group's own files are filtered first (removing moved-out
      // files from wherever they currently live, including the target
      // group itself if applicable), then the moving files are appended
      // onto the target. Since `moving` is always non-empty here, the
      // target group can never end up empty and get dropped by the
      // filter below — this is what makes "move into the group a file is
      // already in" a safe no-op instead of silently deleting the group.
      const groups = withRebuiltMetadata(
        state.groups
          .map((g) => {
            const remaining = g.files.filter((f) => !paths.has(f.path))
            const files = g.id === action.targetGroupId ? [...remaining, ...moving] : remaining
            return { ...g, files }
          })
          .filter((g) => g.files.length > 0)
      )
      const { viewerIndex, selectedPaths: reconciled } = reconcileAfterGroupsChange(
        prevFlat,
        state.viewerIndex,
        state.selectedPaths,
        groups
      )
      // A moved file still exists afterward, so reconcileAfterGroupsChange
      // (which only drops paths that no longer exist) would otherwise leave
      // it selected in its new group — deselect explicitly so a move always
      // clears the selection it acted on.
      const selectedPaths = new Set([...reconciled].filter((p) => !paths.has(p)))
      return { ...state, groups, viewerIndex, selectedPaths }
    }
    case 'MOVE_FILE_TO_INDEX': {
      const moving = state.groups
        .flatMap((group) => group.files)
        .find((file) => file.path === action.path)
      const targetExists = state.groups.some((group) => group.id === action.targetGroupId)
      if (!moving || !targetExists) return state

      const prevFlat = flattenGroupFiles(state.groups)
      const groups = withRebuiltMetadata(
        state.groups
          .map((group) => {
            const remaining = group.files.filter((file) => file.path !== action.path)
            if (group.id !== action.targetGroupId) return { ...group, files: remaining }

            const insertAt = Math.max(0, Math.min(action.targetIndex, remaining.length))
            const files = [...remaining]
            files.splice(insertAt, 0, moving)
            return { ...group, files }
          })
          .filter((group) => group.files.length > 0)
      )
      const { viewerIndex, selectedPaths: reconciled } = reconcileAfterGroupsChange(
        prevFlat,
        state.viewerIndex,
        state.selectedPaths,
        groups
      )
      const selectedPaths = new Set([...reconciled].filter((path) => path !== action.path))
      return { ...state, groups, viewerIndex, selectedPaths }
    }
    case 'REORDER_FILES': {
      const group = state.groups.find((candidate) => candidate.id === action.groupId)
      const sourceIndex = group?.files.findIndex((file) => file.path === action.path) ?? -1
      if (!group || sourceIndex === -1) return state

      // targetIndex is expressed against the list after the dragged file has
      // been lifted out. This keeps the drag UI and reducer aligned at both
      // ends of the list and makes a drop back in the same slot a no-op.
      const files = group.files.filter((file) => file.path !== action.path)
      const insertAt = Math.max(0, Math.min(action.targetIndex, files.length))
      files.splice(insertAt, 0, group.files[sourceIndex])
      const groups = state.groups.map((candidate) =>
        candidate.id === action.groupId ? { ...candidate, files } : candidate
      )
      const { viewerIndex, selectedPaths } = reconcileAfterGroupsChange(
        flattenGroupFiles(state.groups),
        state.viewerIndex,
        state.selectedPaths,
        groups
      )
      return { ...state, groups, viewerIndex, selectedPaths }
    }
    case 'RENAME_FILE':
      return {
        ...state,
        groups: state.groups.map((g) => ({
          ...g,
          files: g.files.map((f) =>
            f.path === action.path ? { ...f, fileName: action.fileName } : f
          )
        }))
      }
    default:
      return state
  }
}
