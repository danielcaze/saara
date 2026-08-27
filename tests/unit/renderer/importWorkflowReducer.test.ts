import { describe, it, expect } from 'vitest'
import {
  reducer,
  initialState,
  flattenGroupFiles,
  defaultGroupName,
  type State
} from '../../../src/renderer/src/hooks/importWorkflowReducer'
import type { PhotoGroup, FileMeta } from '../../../src/shared/types'

function file(path: string, overrides: Partial<FileMeta> = {}): FileMeta {
  return {
    path,
    fileName: path.split('/').pop() as string,
    mediaType: 'photo',
    timestamp: null,
    timestampSource: null,
    metadataError: null,
    ...overrides
  }
}

function group(id: string, files: FileMeta[], overrides: Partial<PhotoGroup> = {}): PhotoGroup {
  return { id, name: id, files, startDate: null, endDate: null, isNoDateGroup: false, ...overrides }
}

function stateWithGroups(groups: PhotoGroup[]): State {
  return { ...initialState, groups }
}

describe('flattenGroupFiles', () => {
  it('flattens in group order then file order, exactly as displayed', () => {
    const groups = [group('g1', [file('/a.jpg'), file('/b.jpg')]), group('g2', [file('/c.jpg')])]
    expect(flattenGroupFiles(groups)).toEqual([
      { file: groups[0].files[0], groupId: 'g1' },
      { file: groups[0].files[1], groupId: 'g1' },
      { file: groups[1].files[0], groupId: 'g2' }
    ])
  })

  it('returns an empty array for no groups', () => {
    expect(flattenGroupFiles([])).toEqual([])
  })
})

describe('defaultGroupName', () => {
  it('returns "No date" for a no-date group', () => {
    expect(defaultGroupName(group('g1', [], { isNoDateGroup: true }))).toBe('No date')
  })

  it('returns a single date when start and end match', () => {
    expect(
      defaultGroupName(
        group('g1', [], {
          startDate: '2026-08-11T10:00:00.000Z',
          endDate: '2026-08-11T14:00:00.000Z'
        })
      )
    ).toBe('2026-08-11')
  })

  it('returns a date range when start and end differ', () => {
    expect(
      defaultGroupName(
        group('g1', [], {
          startDate: '2026-08-11T10:00:00.000Z',
          endDate: '2026-08-12T09:00:00.000Z'
        })
      )
    ).toBe('2026-08-11_to_2026-08-12')
  })
})

describe('reducer: viewer', () => {
  const twoGroups = [group('g1', [file('/a.jpg'), file('/b.jpg')]), group('g2', [file('/c.jpg')])]

  it('OPEN_VIEWER sets the viewer to the given index', () => {
    const state = reducer(stateWithGroups(twoGroups), { type: 'OPEN_VIEWER', index: 1 })
    expect(state.viewerIndex).toBe(1)
  })

  it('OPEN_VIEWER clamps an out-of-range index into bounds', () => {
    const state = reducer(stateWithGroups(twoGroups), { type: 'OPEN_VIEWER', index: 99 })
    expect(state.viewerIndex).toBe(2)
  })

  it('OPEN_VIEWER on an empty file list sets null', () => {
    const state = reducer(stateWithGroups([]), { type: 'OPEN_VIEWER', index: 0 })
    expect(state.viewerIndex).toBeNull()
  })

  it('CLOSE_VIEWER sets viewerIndex back to null', () => {
    const opened = reducer(stateWithGroups(twoGroups), { type: 'OPEN_VIEWER', index: 1 })
    const closed = reducer(opened, { type: 'CLOSE_VIEWER' })
    expect(closed.viewerIndex).toBeNull()
  })

  it('SET_VIEWER_INDEX clamps at the last photo instead of wrapping', () => {
    const opened = reducer(stateWithGroups(twoGroups), { type: 'OPEN_VIEWER', index: 2 })
    const next = reducer(opened, { type: 'SET_VIEWER_INDEX', index: 3 })
    expect(next.viewerIndex).toBe(2)
  })

  it('SET_VIEWER_INDEX clamps at the first photo instead of wrapping', () => {
    const opened = reducer(stateWithGroups(twoGroups), { type: 'OPEN_VIEWER', index: 0 })
    const prev = reducer(opened, { type: 'SET_VIEWER_INDEX', index: -1 })
    expect(prev.viewerIndex).toBe(0)
  })
})

describe('reducer: selection', () => {
  it('TOGGLE_SELECT adds a path, then removes it on a second toggle', () => {
    const selected = reducer(initialState, { type: 'TOGGLE_SELECT', path: '/a.jpg' })
    expect(selected.selectedPaths.has('/a.jpg')).toBe(true)
    const deselected = reducer(selected, { type: 'TOGGLE_SELECT', path: '/a.jpg' })
    expect(deselected.selectedPaths.has('/a.jpg')).toBe(false)
  })

  it('CLEAR_SELECTION empties the selection', () => {
    const selected = reducer(initialState, { type: 'TOGGLE_SELECT', path: '/a.jpg' })
    const cleared = reducer(selected, { type: 'CLEAR_SELECTION' })
    expect(cleared.selectedPaths.size).toBe(0)
  })
})

describe('reducer: DELETE_FILES', () => {
  it('removes the file from its group', () => {
    const state = stateWithGroups([group('g1', [file('/a.jpg'), file('/b.jpg')])])
    const next = reducer(state, { type: 'DELETE_FILES', paths: ['/a.jpg'] })
    expect(next.groups).toEqual([
      expect.objectContaining({ id: 'g1', files: [expect.objectContaining({ path: '/b.jpg' })] })
    ])
  })

  it('drops a group entirely once its last file is deleted', () => {
    const state = stateWithGroups([group('g1', [file('/a.jpg')]), group('g2', [file('/b.jpg')])])
    const next = reducer(state, { type: 'DELETE_FILES', paths: ['/a.jpg'] })
    expect(next.groups.map((g) => g.id)).toEqual(['g2'])
  })

  it('clears deleted paths out of the selection', () => {
    const withSelection = reducer(stateWithGroups([group('g1', [file('/a.jpg')])]), {
      type: 'TOGGLE_SELECT',
      path: '/a.jpg'
    })
    const next = reducer(withSelection, { type: 'DELETE_FILES', paths: ['/a.jpg'] })
    expect(next.selectedPaths.has('/a.jpg')).toBe(false)
  })

  it('clamps a now out-of-range viewerIndex down to the new last photo', () => {
    const opened = reducer(stateWithGroups([group('g1', [file('/a.jpg'), file('/b.jpg')])]), {
      type: 'OPEN_VIEWER',
      index: 1
    })
    const next = reducer(opened, { type: 'DELETE_FILES', paths: ['/b.jpg'] })
    expect(next.viewerIndex).toBe(0)
  })

  it('sets viewerIndex to null when every file is deleted', () => {
    const opened = reducer(stateWithGroups([group('g1', [file('/a.jpg')])]), {
      type: 'OPEN_VIEWER',
      index: 0
    })
    const next = reducer(opened, { type: 'DELETE_FILES', paths: ['/a.jpg'] })
    expect(next.viewerIndex).toBeNull()
  })

  it('keeps showing the same photo when a different, earlier file is deleted', () => {
    const opened = reducer(
      stateWithGroups([group('g1', [file('/a.jpg'), file('/b.jpg'), file('/c.jpg')])]),
      { type: 'OPEN_VIEWER', index: 1 }
    )
    const next = reducer(opened, { type: 'DELETE_FILES', paths: ['/a.jpg'] })
    const flat = flattenGroupFiles(next.groups)
    expect(flat[next.viewerIndex as number].file.path).toBe('/b.jpg')
  })

  it('rebuilds group startDate/endDate/isNoDateGroup after a delete', () => {
    const state = stateWithGroups([
      group('g1', [
        file('/a.jpg', { timestamp: '2026-08-11T10:00:00.000Z' }),
        file('/b.jpg', { timestamp: '2026-08-12T10:00:00.000Z' })
      ])
    ])
    const next = reducer(state, { type: 'DELETE_FILES', paths: ['/b.jpg'] })
    expect(next.groups[0]).toEqual(
      expect.objectContaining({
        startDate: '2026-08-11T10:00:00.000Z',
        endDate: '2026-08-11T10:00:00.000Z',
        isNoDateGroup: false
      })
    )
  })
})

describe('reducer: CREATE_GROUP and MOVE_FILES', () => {
  it('CREATE_GROUP appends a new empty group', () => {
    const next = reducer(stateWithGroups([group('g1', [file('/a.jpg')])]), {
      type: 'CREATE_GROUP',
      groupId: 'new-1'
    })
    expect(next.groups).toEqual([
      expect.objectContaining({ id: 'g1' }),
      expect.objectContaining({ id: 'new-1', name: 'New group', files: [], isNoDateGroup: true })
    ])
  })

  it('MOVE_FILES keeps the viewer on the same photo even though its flat index shifts', () => {
    const opened = reducer(
      stateWithGroups([
        group('g1', [file('/a.jpg'), file('/b.jpg')]),
        group('g2', [file('/c.jpg')])
      ]),
      { type: 'OPEN_VIEWER', index: 1 }
    )
    const next = reducer(opened, { type: 'MOVE_FILES', paths: ['/b.jpg'], targetGroupId: 'g2' })
    const flat = flattenGroupFiles(next.groups)
    expect(flat[next.viewerIndex as number].file.path).toBe('/b.jpg')
  })

  it('rebuilds group startDate/endDate after a move', () => {
    const state = stateWithGroups([
      group('g1', [file('/a.jpg', { timestamp: '2026-08-11T10:00:00.000Z' })]),
      group('g2', [file('/b.jpg', { timestamp: '2026-08-13T10:00:00.000Z' })])
    ])
    const next = reducer(state, { type: 'MOVE_FILES', paths: ['/a.jpg'], targetGroupId: 'g2' })
    expect(next.groups[0]).toEqual(
      expect.objectContaining({
        id: 'g2',
        startDate: '2026-08-11T10:00:00.000Z',
        endDate: '2026-08-13T10:00:00.000Z'
      })
    )
  })

  it('MOVE_FILES moves a file into an existing group and out of its old one', () => {
    const state = stateWithGroups([
      group('g1', [file('/a.jpg'), file('/b.jpg')]),
      group('g2', [file('/c.jpg')])
    ])
    const next = reducer(state, { type: 'MOVE_FILES', paths: ['/a.jpg'], targetGroupId: 'g2' })
    expect(next.groups).toEqual([
      expect.objectContaining({ id: 'g1', files: [expect.objectContaining({ path: '/b.jpg' })] }),
      expect.objectContaining({
        id: 'g2',
        files: [
          expect.objectContaining({ path: '/c.jpg' }),
          expect.objectContaining({ path: '/a.jpg' })
        ]
      })
    ])
  })

  it('MOVE_FILE_TO_INDEX moves a file exactly once at the requested target index', () => {
    const state = stateWithGroups([
      group('g1', [file('/a.jpg'), file('/b.jpg')]),
      group('g2', [file('/c.jpg'), file('/d.jpg')])
    ])
    const next = reducer(state, {
      type: 'MOVE_FILE_TO_INDEX',
      path: '/a.jpg',
      targetGroupId: 'g2',
      targetIndex: 1
    })

    expect(next.groups[0].files.map((entry) => entry.path)).toEqual(['/b.jpg'])
    expect(next.groups[1].files.map((entry) => entry.path)).toEqual(['/c.jpg', '/a.jpg', '/d.jpg'])
    expect(
      flattenGroupFiles(next.groups).filter(({ file }) => file.path === '/a.jpg')
    ).toHaveLength(1)
  })

  it('drops the source group once it is emptied by the move', () => {
    const state = stateWithGroups([group('g1', [file('/a.jpg')]), group('g2', [file('/b.jpg')])])
    const next = reducer(state, { type: 'MOVE_FILES', paths: ['/a.jpg'], targetGroupId: 'g2' })
    expect(next.groups.map((g) => g.id)).toEqual(['g2'])
  })

  it('moving a file into the group it is already in is a safe no-op, not a data loss', () => {
    const state = stateWithGroups([group('g1', [file('/a.jpg'), file('/b.jpg')])])
    const next = reducer(state, { type: 'MOVE_FILES', paths: ['/a.jpg'], targetGroupId: 'g1' })
    expect(next.groups).toHaveLength(1)
    expect(next.groups[0].files.map((f) => f.path).sort()).toEqual(['/a.jpg', '/b.jpg'])
  })

  it('is a no-op when the target group does not exist', () => {
    const state = stateWithGroups([group('g1', [file('/a.jpg')])])
    const next = reducer(state, { type: 'MOVE_FILES', paths: ['/a.jpg'], targetGroupId: 'missing' })
    expect(next).toBe(state)
  })

  it('CREATE_GROUP followed by MOVE_FILES lands the files in the freshly created group', () => {
    const created = reducer(stateWithGroups([group('g1', [file('/a.jpg')])]), {
      type: 'CREATE_GROUP',
      groupId: 'new-1'
    })
    const moved = reducer(created, {
      type: 'MOVE_FILES',
      paths: ['/a.jpg'],
      targetGroupId: 'new-1'
    })
    expect(moved.groups).toEqual([
      expect.objectContaining({ id: 'new-1', files: [expect.objectContaining({ path: '/a.jpg' })] })
    ])
  })
})

describe('reducer: REORDER_FILES', () => {
  it('moves a file to the requested position within its group', () => {
    const state = stateWithGroups([
      group('g1', [file('/a.jpg'), file('/b.jpg'), file('/c.jpg')]),
      group('g2', [file('/d.jpg')])
    ])
    const next = reducer(state, {
      type: 'REORDER_FILES',
      groupId: 'g1',
      path: '/a.jpg',
      targetIndex: 2
    })

    expect(next.groups[0].files.map((entry) => entry.path)).toEqual(['/b.jpg', '/c.jpg', '/a.jpg'])
    expect(next.groups[1].files.map((entry) => entry.path)).toEqual(['/d.jpg'])
  })

  it('keeps the viewer on the same file when its flat index changes', () => {
    const opened = reducer(
      stateWithGroups([group('g1', [file('/a.jpg'), file('/b.jpg'), file('/c.jpg')])]),
      { type: 'OPEN_VIEWER', index: 1 }
    )
    const next = reducer(opened, {
      type: 'REORDER_FILES',
      groupId: 'g1',
      path: '/a.jpg',
      targetIndex: 2
    })
    const flat = flattenGroupFiles(next.groups)

    expect(flat[next.viewerIndex as number].file.path).toBe('/b.jpg')
  })

  it('clamps the insertion index and ignores paths outside the target group', () => {
    const state = stateWithGroups([group('g1', [file('/a.jpg'), file('/b.jpg')])])
    const appended = reducer(state, {
      type: 'REORDER_FILES',
      groupId: 'g1',
      path: '/a.jpg',
      targetIndex: 99
    })
    const ignored = reducer(appended, {
      type: 'REORDER_FILES',
      groupId: 'g1',
      path: '/missing.jpg',
      targetIndex: 0
    })

    expect(appended.groups[0].files.map((entry) => entry.path)).toEqual(['/b.jpg', '/a.jpg'])
    expect(ignored).toBe(appended)
  })
})

describe('reducer: RENAME_FILE', () => {
  it('renames only the matching file, leaving its path and other files untouched', () => {
    const state = stateWithGroups([group('g1', [file('/a.jpg'), file('/b.jpg')])])
    const next = reducer(state, { type: 'RENAME_FILE', path: '/a.jpg', fileName: 'renamed.jpg' })
    expect(next.groups[0].files).toEqual([
      expect.objectContaining({ path: '/a.jpg', fileName: 'renamed.jpg' }),
      expect.objectContaining({ path: '/b.jpg', fileName: 'b.jpg' })
    ])
  })
})

describe('reducer: viewer/selection reset and reconcile on group-replacing actions', () => {
  const twoFiles = [group('g1', [file('/a.jpg'), file('/b.jpg')])]

  it('SET_SOURCE clears viewerIndex and selectedPaths', () => {
    const busy = reducer(reducer(stateWithGroups(twoFiles), { type: 'OPEN_VIEWER', index: 0 }), {
      type: 'TOGGLE_SELECT',
      path: '/a.jpg'
    })
    const next = reducer(busy, { type: 'SET_SOURCE', path: '/new/source' })
    expect(next.viewerIndex).toBeNull()
    expect(next.selectedPaths.size).toBe(0)
  })

  it('ANALYZE_DONE clears viewerIndex and selectedPaths even though it sets new groups', () => {
    const busy = reducer(reducer(stateWithGroups(twoFiles), { type: 'OPEN_VIEWER', index: 0 }), {
      type: 'TOGGLE_SELECT',
      path: '/a.jpg'
    })
    const next = reducer(busy, { type: 'ANALYZE_DONE', groups: [group('g9', [file('/z.jpg')])] })
    expect(next.viewerIndex).toBeNull()
    expect(next.selectedPaths.size).toBe(0)
  })

  it('ANALYZE_ERROR clears viewerIndex and selectedPaths', () => {
    const busy = reducer(reducer(stateWithGroups(twoFiles), { type: 'OPEN_VIEWER', index: 0 }), {
      type: 'TOGGLE_SELECT',
      path: '/a.jpg'
    })
    const next = reducer(busy, { type: 'ANALYZE_ERROR', message: 'boom' })
    expect(next.viewerIndex).toBeNull()
    expect(next.selectedPaths.size).toBe(0)
  })

  it('SET_GROUPS from a rename (files/order unchanged) leaves the viewer and selection untouched', () => {
    const busy = reducer(reducer(stateWithGroups(twoFiles), { type: 'OPEN_VIEWER', index: 1 }), {
      type: 'TOGGLE_SELECT',
      path: '/a.jpg'
    })
    const renamed = busy.groups.map((g) => (g.id === 'g1' ? { ...g, name: 'Renamed' } : g))
    const next = reducer(busy, { type: 'SET_GROUPS', groups: renamed })
    expect(next.viewerIndex).toBe(1)
    expect(next.selectedPaths.has('/a.jpg')).toBe(true)
  })

  it('SET_GROUPS from a recluster (membership/order changed) reconciles by path, not stale index', () => {
    const opened = reducer(stateWithGroups(twoFiles), { type: 'OPEN_VIEWER', index: 1 })
    const reclustered = [group('g1', [file('/b.jpg')]), group('g2', [file('/a.jpg')])]
    const next = reducer(opened, { type: 'SET_GROUPS', groups: reclustered })
    const flat = flattenGroupFiles(next.groups)
    expect(flat[next.viewerIndex as number].file.path).toBe('/b.jpg')
  })
})
