// src/main/drive/driveApi.ts
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
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET'
])

function isRetryableNetworkError(err: unknown): boolean {
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'))
    return true
  const direct = (err as { code?: string } | undefined)?.code
  const nested = (err as { cause?: { code?: string } } | undefined)?.cause?.code
  const code = direct ?? nested
  return typeof code === 'string' && RETRYABLE_CODES.has(code)
}

const FETCH_TIMEOUT_MS = 30000

export interface DriveApi {
  findFolder(parentId: string, name: string): Promise<DriveFolderRef | null>
  createFolder(parentId: string, name: string): Promise<DriveFolderRef>
  createSharePermission(fileId: string): Promise<void>
  getWebViewLink(fileId: string): Promise<string | null>
  listFileNames(folderId: string): Promise<Set<string>>
  uploadFile(params: {
    parentId: string
    filePath: string
    fileName: string
    onPause?: () => void
  }): Promise<void>
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Escape order matters: backslashes must be escaped before quotes, otherwise
// the backslash inserted to escape a quote would itself need escaping.
// Google's Drive API query grammar requires both to be escaped (documented:
// a name containing a literal backslash or single quote must have each
// escaped as \\ and \' respectively).
function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function createGoogleDriveApi(accessTokenProvider: () => Promise<string>): DriveApi {
  async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      const token = await accessTokenProvider()
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${token}`)
      return await fetch(url, { ...init, headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    } catch (err) {
      if (isRetryableNetworkError(err)) {
        throw new DriveNetworkError('Network error talking to Google Drive.')
      }
      throw err
    }
  }

  // Per Google's resumable-upload protocol: an empty PUT with
  // `Content-Range: bytes */TOTAL` to the same session URL asks Drive how
  // many bytes it has actually received so far, so an interrupted upload can
  // resume from that offset instead of restarting from byte 0.
  async function queryUploadedBytes(uploadUrl: string, totalSize: number): Promise<number> {
    let res: Response
    try {
      res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes */${totalSize}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      })
    } catch (err) {
      if (isRetryableNetworkError(err)) {
        throw new DriveNetworkError('Network error while resuming a Drive upload.')
      }
      throw err
    }
    if (res.status === 308) {
      const range = res.headers.get('range')
      const match = range?.match(/bytes=0-(\d+)/)
      return match ? Number(match[1]) + 1 : 0
    }
    if (res.ok) return totalSize
    throw new Error(`Failed to check Drive upload progress (${res.status}).`)
  }

  return {
    async findFolder(parentId, name) {
      const escaped = escapeDriveQueryValue(name)
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

    async createSharePermission(fileId) {
      const permissionsUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`
      const listRes = await authedFetch(`${permissionsUrl}?fields=permissions(role,type)`)
      if (!listRes.ok) throw new Error(`Failed to list Drive permissions (${listRes.status}).`)
      const data = (await listRes.json()) as {
        permissions?: { role?: string; type?: string }[]
      }
      if (
        data.permissions?.some(
          (permission) => permission.role === 'reader' && permission.type === 'anyone'
        )
      ) {
        return
      }

      const createRes = await authedFetch(permissionsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      })
      if (!createRes.ok) {
        throw new Error(`Failed to create Drive share permission (${createRes.status}).`)
      }
    },

    async getWebViewLink(fileId) {
      const res = await authedFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=webViewLink`
      )
      if (!res.ok) throw new Error(`Failed to get Drive folder link (${res.status}).`)
      const data = (await res.json()) as { webViewLink?: string }
      return data.webViewLink ?? null
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

    async uploadFile({ parentId, filePath, fileName, onPause }) {
      const stat = await fs.promises.stat(filePath)
      const totalSize = stat.size

      let uploadUrl: string
      try {
        const startRes = await authedFetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=UTF-8',
              'X-Upload-Content-Type': mimeTypeForFile(fileName),
              'X-Upload-Content-Length': String(totalSize)
            },
            body: JSON.stringify({ name: fileName, parents: [parentId] })
          }
        )
        if (!startRes.ok) throw new Error(`Failed to start a Drive upload (${startRes.status}).`)
        const location = startRes.headers.get('location')
        if (!location) throw new Error('Drive did not return an upload session URL.')
        uploadUrl = location
      } catch (err) {
        if (err instanceof DriveNetworkError) throw err
        throw err instanceof Error
          ? new Error('Failed to start a Drive upload.', { cause: err })
          : new Error('Failed to start a Drive upload.')
      }

      // Uploads in a single PUT, but if it's interrupted mid-flight, queries
      // how many bytes Drive actually received and resumes from that offset
      // on the *same* session URL rather than restarting the whole file —
      // this is what makes the upload genuinely resumable, not just
      // retryable-from-scratch. Retries indefinitely with capped backoff,
      // matching the app's "pause and wait for the connection to come back"
      // design rather than giving up after N attempts.
      let uploadedBytes = 0
      let attempt = 0
      for (;;) {
        let stream: fs.ReadStream | null = null
        try {
          stream = fs.createReadStream(filePath, { start: uploadedBytes })
          const res = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': mimeTypeForFile(fileName),
              'Content-Range': `bytes ${uploadedBytes}-${totalSize - 1}/${totalSize}`
            },
            body: stream as unknown as BodyInit,
            // @ts-expect-error Node's fetch requires this to accept a streaming request body
            duplex: 'half',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
          })
          if (res.ok) return
          throw new Error(`Drive upload failed (${res.status}).`)
        } catch (err) {
          stream?.destroy()
          if (!isRetryableNetworkError(err)) throw err
          attempt++
          onPause?.()
          await wait(Math.min(5000 * 2 ** (attempt - 1), 20000))
          uploadedBytes = await queryUploadedBytes(uploadUrl, totalSize)
        }
      }
    }
  }
}
