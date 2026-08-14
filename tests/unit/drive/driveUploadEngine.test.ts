import { describe, it, expect } from 'vitest'
import {
  getOrCreateRootFolder,
  runDriveUploadPlan
} from '../../../src/main/drive/driveUploadEngine'
import { DriveNetworkError, type DriveApi } from '../../../src/main/drive/driveApi'
import type { CopyPlanGroup, CopyProgressEvent } from '../../../src/shared/types'

function createFakeApi(): {
  api: DriveApi
  folders: Map<string, string>
  files: Map<string, Set<string>>
  uploadCalls: string[]
} {
  const folders = new Map<string, string>() // name -> id
  const files = new Map<string, Set<string>>() // folderId -> file names
  const uploadCalls: string[] = []
  let nextId = 1

  const api: DriveApi = {
    async findFolder(_parentId, name) {
      const id = folders.get(name)
      return id ? { id, name, webViewLink: null } : null
    },
    async createFolder(_parentId, name) {
      const id = `folder-${nextId++}`
      folders.set(name, id)
      files.set(id, new Set())
      return { id, name, webViewLink: null }
    },
    async listFileNames(folderId) {
      return new Set(files.get(folderId) ?? [])
    },
    async uploadFile({ parentId, fileName }) {
      uploadCalls.push(fileName)
      files.get(parentId)?.add(fileName)
    }
  }

  return { api, folders, files, uploadCalls }
}

const instantWait = async (): Promise<void> => {}

describe('getOrCreateRootFolder', () => {
  it('creates the "Saara" root folder when missing', async () => {
    const { api, folders } = createFakeApi()
    const root = await getOrCreateRootFolder(api)
    expect(root.name).toBe('Saara')
    expect(folders.has('Saara')).toBe(true)
  })

  it('reuses an existing root folder', async () => {
    const { api, folders } = createFakeApi()
    const first = await getOrCreateRootFolder(api)
    const second = await getOrCreateRootFolder(api)
    expect(second.id).toBe(first.id)
    expect(folders.size).toBe(1)
  })
})

describe('runDriveUploadPlan', () => {
  const oneGroup: CopyPlanGroup[] = [
    {
      id: 'g1',
      name: 'Birthday',
      files: [
        { sourcePath: '/src/a.jpg', fileName: 'a.jpg' },
        { sourcePath: '/src/b.jpg', fileName: 'b.jpg' }
      ]
    }
  ]

  it('uploads every file and reports an accurate summary', async () => {
    const { api } = createFakeApi()
    const root = await getOrCreateRootFolder(api)
    const progress: CopyProgressEvent[] = []

    const summary = await runDriveUploadPlan(
      { rootFolderId: root.id, groups: oneGroup },
      (e) => progress.push(e),
      api
    )

    expect(summary).toEqual({
      totalFiles: 2,
      copiedFiles: 2,
      skippedFiles: 0,
      conflicts: [],
      errors: []
    })
    expect(progress.at(-1)).toMatchObject({
      filesCopiedSoFar: 2,
      totalFiles: 2,
      status: 'uploading'
    })
  })

  it('skips files already present in the group folder', async () => {
    const { api, folders, files } = createFakeApi()
    const root = await getOrCreateRootFolder(api)
    await api.createFolder(root.id, 'Birthday')
    files.get(folders.get('Birthday')!)!.add('a.jpg')

    const summary = await runDriveUploadPlan(
      { rootFolderId: root.id, groups: oneGroup },
      () => {},
      api
    )

    expect(summary.copiedFiles).toBe(1)
    expect(summary.skippedFiles).toBe(1)
    expect(summary.totalFiles).toBe(2)
  })

  it('reuses the same group folder across two runs instead of creating a duplicate', async () => {
    const { api, folders } = createFakeApi()
    const root = await getOrCreateRootFolder(api)
    await runDriveUploadPlan({ rootFolderId: root.id, groups: oneGroup }, () => {}, api)
    await runDriveUploadPlan({ rootFolderId: root.id, groups: oneGroup }, () => {}, api)

    expect(folders.size).toBe(2) // root + one group folder, not two group folders
  })

  it('pauses and retries on a network error, then succeeds', async () => {
    const { api, uploadCalls } = createFakeApi()
    const root = await getOrCreateRootFolder(api)
    let attempts = 0
    const flaky: DriveApi = {
      ...api,
      // Records every attempt (success or failure) before deciding whether
      // to throw, so a file that fails twice then succeeds shows up 3 times
      // in `uploadCalls` — the original version of this mock only recorded
      // the delegating/success call, making the 3-then-1 pattern below
      // structurally unreachable no matter how the retry loop was written.
      async uploadFile(params) {
        attempts++
        uploadCalls.push(params.fileName)
        if (attempts < 3) throw new DriveNetworkError('simulated blip')
      }
    }
    const progress: CopyProgressEvent[] = []

    const summary = await runDriveUploadPlan(
      { rootFolderId: root.id, groups: [oneGroup[0]] },
      (e) => progress.push(e),
      flaky,
      { wait: instantWait }
    )

    expect(summary.copiedFiles).toBe(2)
    expect(summary.errors).toEqual([])
    expect(uploadCalls).toEqual(['a.jpg', 'a.jpg', 'a.jpg', 'b.jpg'])
    expect(progress.some((e) => e.status === 'paused')).toBe(true)
  })

  it('records a non-network error without retrying and moves on to the next file', async () => {
    const { api } = createFakeApi()
    const root = await getOrCreateRootFolder(api)
    const failing: DriveApi = {
      ...api,
      async uploadFile({ fileName }) {
        if (fileName === 'a.jpg') throw new Error('quota exceeded')
        return api.uploadFile({ parentId: root.id, filePath: '', fileName })
      }
    }

    const summary = await runDriveUploadPlan(
      { rootFolderId: root.id, groups: oneGroup },
      () => {},
      failing,
      { wait: instantWait }
    )

    expect(summary.copiedFiles).toBe(1)
    expect(summary.errors).toEqual([{ path: '/src/a.jpg', message: 'quota exceeded' }])
  })

  it('surfaces onPause callbacks fired during a single uploadFile call as paused progress events', async () => {
    // This is the primary way driveApi.ts's real uploadFile behaves after its
    // Task 6 fix: it retries indefinitely *internally* on a network blip and
    // calls onPause each time, rather than throwing DriveNetworkError back
    // out to this orchestration layer. Without this test, that path — now
    // the common case — was never exercised.
    const { api } = createFakeApi()
    const root = await getOrCreateRootFolder(api)
    const pausingApi: DriveApi = {
      ...api,
      async uploadFile(params) {
        params.onPause?.()
        params.onPause?.()
        return api.uploadFile(params)
      }
    }
    const progress: CopyProgressEvent[] = []

    const summary = await runDriveUploadPlan(
      { rootFolderId: root.id, groups: [oneGroup[0]] },
      (e) => progress.push(e),
      pausingApi
    )

    expect(summary.copiedFiles).toBe(2)
    expect(summary.errors).toEqual([])
    expect(progress.filter((e) => e.status === 'paused').length).toBeGreaterThanOrEqual(2)
  })

  it('gives two same-named groups separate folders instead of merging them', async () => {
    const sameNameGroups: CopyPlanGroup[] = [
      { id: 'g1', name: 'Trip', files: [{ sourcePath: '/src/a.jpg', fileName: 'a.jpg' }] },
      { id: 'g2', name: 'Trip', files: [{ sourcePath: '/src/b.jpg', fileName: 'b.jpg' }] }
    ]
    const { api, folders } = createFakeApi()
    const root = await getOrCreateRootFolder(api)

    const summary = await runDriveUploadPlan(
      { rootFolderId: root.id, groups: sameNameGroups },
      () => {},
      api
    )

    expect(summary.copiedFiles).toBe(2)
    expect(summary.errors).toEqual([])
    expect(folders.has('Trip')).toBe(true)
    expect(folders.has('Trip (2)')).toBe(true)
    expect(folders.size).toBe(3) // root + "Trip" + "Trip (2)"
  })
})
