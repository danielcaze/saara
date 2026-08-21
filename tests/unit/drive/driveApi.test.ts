import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGoogleDriveApi } from '../../../src/main/drive/driveApi'

describe('createSharePermission', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not create a duplicate permission when anyone already has reader access', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ permissions: [{ role: 'reader', type: 'anyone' }] }), {
        status: 200
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = createGoogleDriveApi(async () => 'access-token')

    await api.createSharePermission('folder-123')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/files/folder-123/permissions?fields=permissions(role,type)',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('creates an anyone-reader permission when one is not present', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ permissions: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const api = createGoogleDriveApi(async () => 'access-token')

    await api.createSharePermission('folder-123')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://www.googleapis.com/drive/v3/files/folder-123/permissions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      })
    )
  })
})
