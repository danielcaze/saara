import fs from 'node:fs'
import { mimeTypeForFile } from './driveMimeType'

export interface DriveFolderRef {
  id: string
  name: string
  webViewLink: string | null
}

export class DriveNetworkError extends Error {}

const RETRYABLE_CODES = new Set([
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN'
])

function isRetryableNetworkError(err: unknown): boolean {
  const direct = (err as { code?: string } | undefined)?.code
  const nested = (err as { cause?: { code?: string } } | undefined)?.cause?.code
  const code = direct ?? nested
  return typeof code === 'string' && RETRYABLE_CODES.has(code)
}

export interface DriveApi {
  findFolder(parentId: string, name: string): Promise<DriveFolderRef | null>
  createFolder(parentId: string, name: string): Promise<DriveFolderRef>
  listFileNames(folderId: string): Promise<Set<string>>
  uploadFile(params: { parentId: string; filePath: string; fileName: string }): Promise<void>
}

export function createGoogleDriveApi(accessTokenProvider: () => Promise<string>): DriveApi {
  async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await accessTokenProvider()
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    try {
      return await fetch(url, { ...init, headers })
    } catch (err) {
      if (isRetryableNetworkError(err)) {
        throw new DriveNetworkError('Network error talking to Google Drive.')
      }
      throw err
    }
  }

  return {
    async findFolder(parentId, name) {
      const escaped = name.replace(/'/g, "\\'")
      const q = encodeURIComponent(
        `'${parentId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      )
      const res = await authedFetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)&pageSize=1`
      )
      if (!res.ok) throw new Error(`Failed to search Drive (${res.status}).`)
      const data = (await res.json()) as {
        files?: { id?: string; name?: string; webViewLink?: string }[]
      }
      const file = data.files?.[0]
      if (!file?.id || !file.name) return null
      return { id: file.id, name: file.name, webViewLink: file.webViewLink ?? null }
    },

    async createFolder(parentId, name) {
      const res = await authedFetch(
        'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
          })
        }
      )
      if (!res.ok) throw new Error(`Failed to create a Drive folder (${res.status}).`)
      const data = (await res.json()) as { id?: string; name?: string; webViewLink?: string }
      if (!data.id || !data.name) throw new Error('Drive did not return the created folder.')
      return { id: data.id, name: data.name, webViewLink: data.webViewLink ?? null }
    },

    async listFileNames(folderId) {
      const names = new Set<string>()
      let pageToken: string | undefined
      do {
        const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
        const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
        const res = await authedFetch(
          `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(name)&pageSize=1000${pageParam}`
        )
        if (!res.ok) throw new Error(`Failed to list Drive folder contents (${res.status}).`)
        const data = (await res.json()) as { nextPageToken?: string; files?: { name?: string }[] }
        for (const file of data.files ?? []) {
          if (file.name) names.add(file.name)
        }
        pageToken = data.nextPageToken
      } while (pageToken)
      return names
    },

    async uploadFile({ parentId, filePath, fileName }) {
      const stat = await fs.promises.stat(filePath)

      let startRes: Response
      try {
        startRes = await authedFetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=UTF-8',
              'X-Upload-Content-Type': mimeTypeForFile(fileName),
              'X-Upload-Content-Length': String(stat.size)
            },
            body: JSON.stringify({ name: fileName, parents: [parentId] })
          }
        )
      } catch (err) {
        if (err instanceof DriveNetworkError) throw err
        throw new Error('Failed to start a Drive upload.')
      }
      if (!startRes.ok) throw new Error(`Failed to start a Drive upload (${startRes.status}).`)
      const uploadUrl = startRes.headers.get('location')
      if (!uploadUrl) throw new Error('Drive did not return an upload session URL.')

      let putRes: Response
      try {
        putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': mimeTypeForFile(fileName),
            'Content-Length': String(stat.size)
          },
          body: fs.createReadStream(filePath) as unknown as BodyInit,
          // @ts-expect-error Node's fetch requires this to accept a streaming request body
          duplex: 'half'
        })
      } catch (err) {
        if (isRetryableNetworkError(err)) {
          throw new DriveNetworkError('Network error while uploading to Drive.')
        }
        throw err
      }
      if (!putRes.ok) throw new Error(`Drive upload failed (${putRes.status}).`)
    }
  }
}
