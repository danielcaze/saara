# Saara Google Drive Destination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a copy session upload sorted photo groups to Google Drive instead of a local folder — connect a Google account once, toggle "Destination" between local and Drive, and upload into an app-managed root folder that mirrors the existing per-group local-folder structure, with resumable/pausable uploads that survive connectivity blips.

**Architecture:** OAuth 2.0 "installed app" flow via a loopback HTTP redirect (opens the system browser, not an embedded webview); refresh token stored encrypted via Electron's `safeStorage`. A `DriveApi` interface abstracts all Drive REST calls (hand-rolled via `fetch`, not the full `googleapis` package — keeps the dependency footprint small) so the upload orchestration logic is unit-testable against a fake implementation. Uploads use Drive's resumable-upload protocol so a single large in-progress file can itself resume after a network blip, and the app skips files already present in a group's Drive folder so re-running a failed session doesn't re-upload or duplicate anything. The existing local-copy progress/summary UI (`ProgressBar`, sticky footer, done screen) is reused for both destinations by extending the existing `CopyProgressEvent`/`CopySummary` shared types rather than creating parallel ones.

**Tech Stack:** Same as V1.1 (Electron, TypeScript, React, zod, `@phosphor-icons/react`, `motion`, vitest), plus one new dependency: `google-auth-library` (OAuth2 client — token exchange/refresh/auth-URL generation only; all actual Drive REST calls are hand-rolled via the global `fetch`, available in Electron 39's bundled Node.js without any extra dependency).

---

## Context

This is **Checkpoint 1** of `docs/superpowers/specs/2026-08-14-saara-v2-roadmap-design.md` — read that spec first for the full rationale and the decisions already locked in there. Key ones repeated here so this plan is self-contained:

- Scope for Drive is picture backend copy uploads to Drive, using an app-managed root folder (no folder picker) — a "Saara" folder created/reused automatically, with one subfolder per group underneath it, matching the existing local-copy folder-per-group behavior.
- Destination toggle: a floating icon button in the corner of the existing Destination `Dropzone` box. Clicking it flips `destinationType` between `'local'` and `'drive'`; the icon swaps between the Drive logo and a folder icon.
- Retry semantics: re-running an upload after a partial failure reuses the existing group folder and skips files already uploaded (by name) — never re-uploads successes or creates duplicate folders.
- Pause/resume: the app is otherwise offline-first; only the Drive path needs connectivity handling. A network error mid-upload pauses (not fails) with backoff retry, shown distinctly in the progress UI ("Paused — waiting for connection…").
- Sharing links and any Drive folder browsing/picking UI are explicitly **out of scope** for this checkpoint (sharing is Checkpoint 4 in the roadmap spec).
- V1's existing local-copy path (`copyEngine.ts`, `COPY_START`/`COPY_PROGRESS` IPC, the `Dropzone`/`GroupCard`/`HomeScreen` UI) is untouched in behavior — this plan only adds an alternate path alongside it.

**Not handled by this plan (explicitly deferred, don't build):**
- Packaging/distributing OAuth credentials in a built installer. This plan reads `GOOGLE_DRIVE_CLIENT_ID`/`GOOGLE_DRIVE_CLIENT_SECRET` from the process environment (populated via a local `.env` file during `npm run dev`, which `electron-vite` loads automatically). How those variables get into a *packaged* production build is a separate concern to solve when the user actually packages a Drive-enabled release — not addressed here.
- The "immediately retry on the OS reporting connectivity restored" nicety from the spec. This plan uses a capped exponential backoff (5s → 10s → 20s, retrying indefinitely while paused) instead of listening for OS network-change events, because `navigator.onLine`/network-change events are unreliable (can report "online" while there's no real route to the internet) and the spec itself already flagged this. A ~20s-worst-case reconnect delay is an acceptable trade for not depending on a flaky signal.

---

## Prerequisite: Google Cloud OAuth setup (manual, blocks everything below)

This has to be done by hand, in a browser, using your own Google account — no task below can substitute for it.

1. Go to https://console.cloud.google.com/ and create a new project (or pick an existing one you're fine using for this).
2. In **APIs & Services → Library**, search for "Google Drive API" and click **Enable**.
3. In **APIs & Services → OAuth consent screen**:
   - User type: **External** (unless you have a Google Workspace org and want **Internal**).
   - Fill in the required app name/support email fields.
   - Under **Test users**, add the Google account(s) you'll actually sign in with. While the app is in "Testing" publishing status, only these accounts can complete the OAuth flow — this avoids Google's app-verification review process, which isn't worth going through for a personal tool.
   - Scopes: you don't need to add any here — the app requests `drive.file` at runtime, which is a "non-sensitive" scope that doesn't require verification.
4. In **APIs & Services → Credentials**, click **Create Credentials → OAuth client ID**. Application type: **Desktop app**. Give it any name (e.g. "Saara Dev").
5. After creation, copy the **Client ID** and **Client Secret** shown.
6. In the project root, copy `.env.example` (created in Task 1 below) to a new file named `.env`, and paste your Client ID/Secret into it. `.env` is gitignored — never commit it.

---

## Task 1: Dependency, env template, gitignore

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Install the OAuth client library**

```bash
npm install google-auth-library
```

- [ ] **Step 2: Create the env template**

```bash
# .env.example
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
```

- [ ] **Step 3: Gitignore the real `.env`**

Add to `.gitignore`:

```
.env
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: add google-auth-library dependency and .env template for Drive OAuth"
```

---

## Task 2: `driveConfig` — read OAuth credentials from the environment (TDD)

**Files:**
- Create: `src/main/drive/driveConfig.ts`
- Test: `tests/unit/drive/driveConfig.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/drive/driveConfig.test.ts
import { describe, it, expect } from 'vitest'
import { getDriveOAuthConfig } from '../../../src/main/drive/driveConfig'

describe('getDriveOAuthConfig', () => {
  it('returns null when both env vars are missing', () => {
    expect(getDriveOAuthConfig({})).toBeNull()
  })

  it('returns null when only the client ID is set', () => {
    expect(getDriveOAuthConfig({ GOOGLE_DRIVE_CLIENT_ID: 'abc' })).toBeNull()
  })

  it('returns null when only the client secret is set', () => {
    expect(getDriveOAuthConfig({ GOOGLE_DRIVE_CLIENT_SECRET: 'xyz' })).toBeNull()
  })

  it('returns the config when both are set', () => {
    expect(
      getDriveOAuthConfig({ GOOGLE_DRIVE_CLIENT_ID: 'abc', GOOGLE_DRIVE_CLIENT_SECRET: 'xyz' })
    ).toEqual({ clientId: 'abc', clientSecret: 'xyz' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/drive/driveConfig.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/drive/driveConfig.ts
export interface DriveOAuthConfig {
  clientId: string
  clientSecret: string
}

export function getDriveOAuthConfig(
  env: NodeJS.ProcessEnv = process.env
): DriveOAuthConfig | null {
  const clientId = env.GOOGLE_DRIVE_CLIENT_ID
  const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/drive/driveConfig.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/drive/driveConfig.ts tests/unit/drive/driveConfig.test.ts
git commit -m "feat: read Drive OAuth credentials from environment (DI'd for testing)"
```

---

## Task 3: `driveAuthStore` — encrypted refresh-token persistence (TDD)

**Files:**
- Create: `src/main/drive/driveAuthStore.ts`
- Test: `tests/unit/drive/driveAuthStore.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/drive/driveAuthStore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  getDriveTokens,
  setDriveTokens,
  clearDriveTokens,
  type TokenCipher
} from '../../../src/main/drive/driveAuthStore'

let tmpDir: string

// A real cipher would go through Electron's safeStorage (OS-level encryption).
// Tests use a trivial reversible stand-in so this module can be tested without
// Electron — the store's job is the file I/O and shape validation, not crypto.
const fakeCipher: TokenCipher = {
  encrypt: (text) => Buffer.from(text, 'utf-8'),
  decrypt: (buf) => buf.toString('utf-8')
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saara-drive-auth-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('driveAuthStore', () => {
  it('returns null when no file exists', async () => {
    expect(await getDriveTokens(tmpDir, fakeCipher)).toBeNull()
  })

  it('persists and reloads tokens', async () => {
    await setDriveTokens(tmpDir, fakeCipher, {
      refreshToken: 'refresh-abc',
      email: 'user@example.com'
    })
    expect(await getDriveTokens(tmpDir, fakeCipher)).toEqual({
      refreshToken: 'refresh-abc',
      email: 'user@example.com'
    })
  })

  it('overwrites previous tokens on repeated writes', async () => {
    await setDriveTokens(tmpDir, fakeCipher, { refreshToken: 'first', email: 'a@example.com' })
    await setDriveTokens(tmpDir, fakeCipher, { refreshToken: 'second', email: 'b@example.com' })
    expect(await getDriveTokens(tmpDir, fakeCipher)).toEqual({
      refreshToken: 'second',
      email: 'b@example.com'
    })
  })

  it('returns null after clearing', async () => {
    await setDriveTokens(tmpDir, fakeCipher, { refreshToken: 'x', email: 'a@example.com' })
    await clearDriveTokens(tmpDir)
    expect(await getDriveTokens(tmpDir, fakeCipher)).toBeNull()
  })

  it('returns null when the stored data is corrupt', async () => {
    await fs.mkdir(tmpDir, { recursive: true })
    await fs.writeFile(path.join(tmpDir, 'driveAuth.json'), 'not valid json', 'utf-8')
    expect(await getDriveTokens(tmpDir, fakeCipher)).toBeNull()
  })

  it('returns null when the stored data is missing required fields', async () => {
    await fs.mkdir(tmpDir, { recursive: true })
    const encrypted = fakeCipher.encrypt(JSON.stringify({ refreshToken: 'only-this' }))
    await fs.writeFile(path.join(tmpDir, 'driveAuth.json'), encrypted)
    expect(await getDriveTokens(tmpDir, fakeCipher)).toBeNull()
  })

  it('clearing a non-existent file does not throw', async () => {
    await expect(clearDriveTokens(tmpDir)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/drive/driveAuthStore.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/drive/driveAuthStore.ts
import fs from 'node:fs/promises'
import path from 'node:path'

export interface TokenCipher {
  encrypt(plainText: string): Buffer
  decrypt(encrypted: Buffer): string
}

export interface DriveTokens {
  refreshToken: string
  email: string
}

function tokenFilePath(userDataDir: string): string {
  return path.join(userDataDir, 'driveAuth.json')
}

function isDriveTokens(value: unknown): value is DriveTokens {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as DriveTokens).refreshToken === 'string' &&
    typeof (value as DriveTokens).email === 'string'
  )
}

export async function getDriveTokens(
  userDataDir: string,
  cipher: TokenCipher
): Promise<DriveTokens | null> {
  try {
    const encrypted = await fs.readFile(tokenFilePath(userDataDir))
    const decrypted = cipher.decrypt(encrypted)
    const parsed: unknown = JSON.parse(decrypted)
    return isDriveTokens(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function setDriveTokens(
  userDataDir: string,
  cipher: TokenCipher,
  tokens: DriveTokens
): Promise<void> {
  await fs.mkdir(userDataDir, { recursive: true })
  const encrypted = cipher.encrypt(JSON.stringify(tokens))
  await fs.writeFile(tokenFilePath(userDataDir), encrypted)
}

export async function clearDriveTokens(userDataDir: string): Promise<void> {
  await fs.rm(tokenFilePath(userDataDir), { force: true })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/drive/driveAuthStore.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Verify typecheck passes**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/main/drive/driveAuthStore.ts tests/unit/drive/driveAuthStore.test.ts
git commit -m "feat: add encrypted Drive refresh-token store (DI'd cipher for testing)"
```

---

## Task 4: `driveCallback` — parse the OAuth loopback redirect (TDD)

**Files:**
- Create: `src/main/drive/driveCallback.ts`
- Test: `tests/unit/drive/driveCallback.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/drive/driveCallback.test.ts
import { describe, it, expect } from 'vitest'
import { parseDriveCallback } from '../../../src/main/drive/driveCallback'

describe('parseDriveCallback', () => {
  it('extracts the code from a successful callback', () => {
    expect(parseDriveCallback('/callback?code=abc123&scope=drive.file')).toEqual({
      ok: true,
      code: 'abc123'
    })
  })

  it('surfaces an error param (e.g. user denied consent)', () => {
    expect(parseDriveCallback('/callback?error=access_denied')).toEqual({
      ok: false,
      error: 'access_denied'
    })
  })

  it('reports missing_code when neither code nor error is present', () => {
    expect(parseDriveCallback('/callback')).toEqual({ ok: false, error: 'missing_code' })
  })

  it('ignores requests to other paths the same way (no path filtering here)', () => {
    expect(parseDriveCallback('/favicon.ico')).toEqual({ ok: false, error: 'missing_code' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/drive/driveCallback.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/drive/driveCallback.ts
export type DriveCallbackResult = { ok: true; code: string } | { ok: false; error: string }

export function parseDriveCallback(requestUrl: string): DriveCallbackResult {
  const url = new URL(requestUrl, 'http://127.0.0.1')
  const error = url.searchParams.get('error')
  if (error) return { ok: false, error }
  const code = url.searchParams.get('code')
  if (!code) return { ok: false, error: 'missing_code' }
  return { ok: true, code }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/drive/driveCallback.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/drive/driveCallback.ts tests/unit/drive/driveCallback.test.ts
git commit -m "feat: add OAuth loopback callback URL parser"
```

---

## Task 5: `driveMimeType` — filename to MIME type (TDD)

**Files:**
- Create: `src/main/drive/driveMimeType.ts`
- Test: `tests/unit/drive/driveMimeType.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/drive/driveMimeType.test.ts
import { describe, it, expect } from 'vitest'
import { mimeTypeForFile } from '../../../src/main/drive/driveMimeType'

describe('mimeTypeForFile', () => {
  it('maps common photo extensions', () => {
    expect(mimeTypeForFile('IMG_001.JPG')).toBe('image/jpeg')
    expect(mimeTypeForFile('photo.jpeg')).toBe('image/jpeg')
    expect(mimeTypeForFile('photo.png')).toBe('image/png')
    expect(mimeTypeForFile('photo.heic')).toBe('image/heic')
  })

  it('maps common video extensions', () => {
    expect(mimeTypeForFile('clip.MP4')).toBe('video/mp4')
    expect(mimeTypeForFile('clip.mov')).toBe('video/quicktime')
  })

  it('falls back to application/octet-stream for unknown extensions', () => {
    expect(mimeTypeForFile('raw.cr2')).toBe('application/octet-stream')
  })

  it('falls back to application/octet-stream when there is no extension', () => {
    expect(mimeTypeForFile('README')).toBe('application/octet-stream')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/drive/driveMimeType.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/drive/driveMimeType.ts
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska'
}

export function mimeTypeForFile(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex === -1) return 'application/octet-stream'
  const ext = fileName.slice(dotIndex).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/drive/driveMimeType.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/drive/driveMimeType.ts tests/unit/drive/driveMimeType.test.ts
git commit -m "feat: add filename-to-MIME-type mapping for Drive uploads"
```

---

## Task 6: `driveApi` — the Drive REST client (interface + real implementation)

**Files:**
- Create: `src/main/drive/driveApi.ts`

This module has no dedicated unit test: every method makes a real network call, and there's no meaningful fake-able boundary *inside* this file (it *is* the boundary — Task 7 tests against a fake of the `DriveApi` interface this file defines). Correctness here is verified by `npm run typecheck` now and by the manual Drive smoke test in Task 16.

Uses the global `fetch` (stable in the Node.js version Electron 39 bundles — no extra dependency needed) rather than the `googleapis` package, which would pull in generated clients for ~50 Google services we don't use.

- [ ] **Step 1: Implement**

> **Revised after code review** (caught before Task 7 was built, so no downstream rework was needed): the original draft had the access-token fetch outside the retry-classification try/catch (meaning a network failure during token refresh — which happens periodically, since access tokens expire hourly — would never be classified as retryable), escaped only single quotes in Drive queries (Drive's grammar requires backslashes escaped too), had no request timeouts (a stalled connection would hang forever instead of surfacing as a retryable error), and — despite being called "resumable" — actually restarted the whole file from byte 0 on every retry instead of resuming from where it left off. The version below fixes all four.

```ts
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
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) return true
  const direct = (err as { code?: string } | undefined)?.code
  const nested = (err as { cause?: { code?: string } } | undefined)?.cause?.code
  const code = direct ?? nested
  return typeof code === 'string' && RETRYABLE_CODES.has(code)
}

const FETCH_TIMEOUT_MS = 30000

export interface DriveApi {
  findFolder(parentId: string, name: string): Promise<DriveFolderRef | null>
  createFolder(parentId: string, name: string): Promise<DriveFolderRef>
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
// Google's Drive API query grammar requires both to be escaped.
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
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/main/drive/driveApi.ts
git commit -m "feat: add Drive REST client (folders, listing, resumable upload)"
```

---

## Task 7: `driveUploadEngine` — upload orchestration against a fake `DriveApi` (TDD)

**Files:**
- Create: `src/main/drive/driveUploadEngine.ts`
- Test: `tests/unit/drive/driveUploadEngine.test.ts`

This is where the actual "reuse folder, skip duplicates, pause-and-retry on network errors" logic lives, and it's fully unit-testable because it only depends on the `DriveApi` interface, not real network calls.

> **Revised after code review**: the original draft was missing a folder-name collision guard — `copyEngine.ts` (the existing local-copy engine) already handles two *different* groups in one plan sanitizing to the same folder name via a `uniqueFolderPath`/`takenFolderNames` pair (suffixing the second one `" (2)"`, etc.), but the first draft of this file called `sanitizeFolderName` directly with no equivalent guard — meaning two same-named groups would silently merge into one Drive folder instead of getting separate ones. Fixed below by exporting and reusing `copyEngine.ts`'s existing helper rather than duplicating it. The review also found the test suite never exercised `onPause` actually firing during a single `uploadFile` call (the primary way Task 6's real `driveApi.ts` behaves now — it retries internally and calls `onPause` itself), and a misleading comment about why the outer retry loop still matters — both fixed below too.

- [ ] **Step 1: Export `uniqueFolderPath` from `copyEngine.ts` for reuse**

In `src/main/fs/copyEngine.ts`, change:

```ts
function uniqueFolderPath(desiredName: string, taken: Set<string>): string {
```

to:

```ts
export function uniqueFolderPath(desiredName: string, taken: Set<string>): string {
```

(Only the `export` keyword is added — the function body, its existing usage inside `copyEngine.ts`, and everything else in that file stays exactly as-is.)

- [ ] **Step 2: Write the failing tests**

```ts
// tests/unit/drive/driveUploadEngine.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getOrCreateRootFolder, runDriveUploadPlan } from '../../../src/main/drive/driveUploadEngine'
import { DriveNetworkError, type DriveApi, type DriveFolderRef } from '../../../src/main/drive/driveApi'
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
    expect(progress.at(-1)).toMatchObject({ filesCopiedSoFar: 2, totalFiles: 2, status: 'uploading' })
  })

  it('skips files already present in the group folder', async () => {
    const { api, folders, files } = createFakeApi()
    const root = await getOrCreateRootFolder(api)
    await api.createFolder(root.id, 'Birthday')
    files.get(folders.get('Birthday')!)!.add('a.jpg')

    const summary = await runDriveUploadPlan({ rootFolderId: root.id, groups: oneGroup }, () => {}, api)

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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/unit/drive/driveUploadEngine.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// src/main/drive/driveUploadEngine.ts
import { sanitizeFolderName } from '../fs/sanitizeFolderName'
import { uniqueFolderPath } from '../fs/copyEngine'
import { DriveNetworkError, type DriveApi, type DriveFolderRef } from './driveApi'
import type { CopyPlanGroup, CopyProgressEvent, CopySummary } from '../../shared/types'

export interface DriveUploadPlan {
  rootFolderId: string
  groups: CopyPlanGroup[]
}

export interface RunDriveUploadPlanOptions {
  wait?: (ms: number) => Promise<void>
  maxBackoffMs?: number
}

export async function getOrCreateRootFolder(api: DriveApi, name = 'Saara'): Promise<DriveFolderRef> {
  const existing = await api.findFolder('root', name)
  if (existing) return existing
  return api.createFolder('root', name)
}

export async function runDriveUploadPlan(
  plan: DriveUploadPlan,
  onProgress: (e: CopyProgressEvent) => void,
  api: DriveApi,
  options: RunDriveUploadPlanOptions = {}
): Promise<CopySummary> {
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const maxBackoffMs = options.maxBackoffMs ?? 20000
  const summary: CopySummary = { totalFiles: 0, copiedFiles: 0, skippedFiles: 0, conflicts: [], errors: [] }
  const totalFiles = plan.groups.reduce((sum, g) => sum + g.files.length, 0)
  let doneSoFar = 0
  const takenFolderNames = new Set<string>()

  for (const group of plan.groups) {
    // uniqueFolderPath (reused from copyEngine.ts's local-copy engine)
    // suffixes a name only if it collides with another group *within this
    // plan* — it deliberately doesn't check Drive for a pre-existing folder
    // of that name, since a pre-existing one (from an earlier run) should be
    // reused for skip-duplicates, not treated as a collision.
    const folderName = uniqueFolderPath(sanitizeFolderName(group.name), takenFolderNames)
    let folder = await api.findFolder(plan.rootFolderId, folderName)
    if (!folder) folder = await api.createFolder(plan.rootFolderId, folderName)
    const existingNames = await api.listFileNames(folder.id)

    for (const file of group.files) {
      summary.totalFiles++

      if (existingNames.has(file.fileName)) {
        summary.skippedFiles++
        doneSoFar++
        onProgress({
          groupId: group.id,
          groupName: group.name,
          fileName: file.fileName,
          filesCopiedSoFar: doneSoFar,
          totalFiles,
          status: 'done'
        })
        continue
      }

      let attempt = 0
      for (;;) {
        try {
          await api.uploadFile({
            parentId: folder.id,
            filePath: file.sourcePath,
            fileName: file.fileName,
            // driveApi's uploadFile already retries indefinitely on its own
            // for a mid-upload network blip (true resumable-upload retry);
            // this surfaces that internal pause as a 'paused' progress event
            // too, so the UI doesn't just sit still with no feedback during
            // that internal retry. The outer retry loop here still matters
            // for two cases where uploadFile throws DriveNetworkError out
            // instead of handling it internally: a session-start failure
            // (no bytes sent yet, safe to retry the whole call from scratch)
            // and a network blip during uploadFile's own internal
            // "how many bytes did you actually get" resume-offset check
            // (which has no retry loop of its own) — the latter can happen
            // after bytes have already been sent, so the outer retry here
            // starts a fresh upload session rather than truly resuming in
            // that specific case.
            onPause: () =>
              onProgress({
                groupId: group.id,
                groupName: group.name,
                fileName: file.fileName,
                filesCopiedSoFar: doneSoFar,
                totalFiles,
                status: 'paused'
              })
          })
          summary.copiedFiles++
          break
        } catch (err) {
          if (err instanceof DriveNetworkError) {
            attempt++
            onProgress({
              groupId: group.id,
              groupName: group.name,
              fileName: file.fileName,
              filesCopiedSoFar: doneSoFar,
              totalFiles,
              status: 'paused'
            })
            await wait(Math.min(5000 * 2 ** (attempt - 1), maxBackoffMs))
            continue
          }
          summary.errors.push({
            path: file.sourcePath,
            message: err instanceof Error ? err.message : String(err)
          })
          break
        }
      }

      doneSoFar++
      onProgress({
        groupId: group.id,
        groupName: group.name,
        fileName: file.fileName,
        filesCopiedSoFar: doneSoFar,
        totalFiles,
        status: 'uploading'
      })
    }
  }

  return summary
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/unit/drive/driveUploadEngine.test.ts
```

Expected: PASS, 9 tests. (This will fail to typecheck/import until Task 9 adds the `status` field to `CopyProgressEvent` — if running this task's tests before Task 9, expect a type error on the `status:` properties. Do Task 9 first if executing tasks out of order; as written, this plan does Task 9 after, so temporarily accept a type error here and re-verify after Task 9's Step 4.)

- [ ] **Step 6: Commit**

```bash
git add src/main/fs/copyEngine.ts src/main/drive/driveUploadEngine.ts tests/unit/drive/driveUploadEngine.test.ts
git commit -m "feat: add Drive upload orchestration (skip-duplicates, pause/retry on network errors)"
```

---

## Task 8: `driveAuth` — OAuth loopback flow orchestration

**Files:**
- Create: `src/main/drive/driveAuth.ts`

Like Task 6, this has no dedicated unit test — it needs a real system browser and real Google consent screen. `parseDriveCallback` (Task 4, unit tested) is the part of this flow that actually has logic worth testing in isolation; this file just wires it to a real HTTP server and `OAuth2Client`. Verified via typecheck now and the manual smoke test in Task 16.

> **Revised after code review**: the original draft had no timeout on the wait for the browser callback — if the user closed the tab or never completed consent, `connectDrive()` would hang forever with the local server still bound and no way to recover short of restarting the app. The email-fetch `fetch()` call also had no timeout, unlike every network call in `driveApi.ts` (Task 6, hardened for exactly this reason). Both fixed below with a shared `withTimeout` helper.

- [ ] **Step 1: Implement**

```ts
// src/main/drive/driveAuth.ts
import http from 'node:http'
import { shell } from 'electron'
import { OAuth2Client } from 'google-auth-library'
import { parseDriveCallback } from './driveCallback'
import type { DriveOAuthConfig } from './driveConfig'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const CONNECT_TIMEOUT_MS = 5 * 60 * 1000 // time allowed to complete the browser consent flow
const FETCH_TIMEOUT_MS = 30000

export interface DriveConnectResult {
  refreshToken: string
  email: string
}

// Races `promise` against a timeout, and always clears the timer afterward
// regardless of which one wins — otherwise a promise that settles well
// before its timeout would still leave a dangling timer.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

async function fetchConnectedEmail(oauth2Client: OAuth2Client): Promise<string> {
  const { token } = await oauth2Client.getAccessToken()
  if (!token) throw new Error('Failed to obtain a Google access token.')
  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`Failed to fetch the connected Google account (${res.status}).`)
  const data = (await res.json()) as { user?: { emailAddress?: string } }
  const email = data.user?.emailAddress
  if (!email) throw new Error('Could not determine the connected Google account.')
  return email
}

export async function connectDrive(config: DriveOAuthConfig): Promise<DriveConnectResult> {
  const server = http.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Failed to start the local Google sign-in listener.')
  }
  const redirectUri = `http://127.0.0.1:${address.port}/callback`
  const oauth2Client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri
  })

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [SCOPE]
  })

  const codePromise = new Promise<string>((resolve, reject) => {
    server.on('request', (req, res) => {
      const result = parseDriveCallback(req.url ?? '')
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      if (result.ok) {
        res.end('Saara is connected to Google Drive. You can close this tab.')
        resolve(result.code)
      } else {
        res.end(`Google Drive connection failed (${result.error}). You can close this tab.`)
        reject(new Error(`Google sign-in failed: ${result.error}`))
      }
    })
  })

  await shell.openExternal(authUrl)

  let code: string
  try {
    code = await withTimeout(
      codePromise,
      CONNECT_TIMEOUT_MS,
      'Google sign-in timed out. Try connecting again.'
    )
  } finally {
    server.close()
  }

  const { tokens } = await oauth2Client.getToken(code)
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a long-lived connection. Disconnect and try connecting again.'
    )
  }
  oauth2Client.setCredentials(tokens)

  const email = await fetchConnectedEmail(oauth2Client)
  return { refreshToken: tokens.refresh_token, email }
}

export function createAuthorizedClient(config: DriveOAuthConfig, refreshToken: string): OAuth2Client {
  const client = new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret })
  client.setCredentials({ refresh_token: refreshToken })
  return client
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/main/drive/driveAuth.ts
git commit -m "feat: add Drive OAuth loopback flow (system browser, no embedded webview)"
```

---

## Task 9: Shared types, IPC channels, IPC schemas

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipcChannels.ts`
- Modify: `src/shared/ipcSchemas.ts`

- [ ] **Step 1: Extend `CopyProgressEvent` and add `DriveStatus`**

In `src/shared/types.ts`, change:

```ts
export interface CopyProgressEvent {
  groupId: string
  groupName: string
  fileName: string
  filesCopiedSoFar: number
  totalFiles: number
}
```

to:

```ts
export interface CopyProgressEvent {
  groupId: string
  groupName: string
  fileName: string
  filesCopiedSoFar: number
  totalFiles: number
  status?: 'uploading' | 'paused' | 'done'
}

export interface DriveStatus {
  connected: boolean
  email: string | null
}
```

(Only this interface and the new one after it change — the rest of the file, including `CopySummary`, stays as-is; `CopySummary`'s existing `skippedFiles` field is reused as-is for Drive's already-uploaded-skip count, no change needed there.)

- [ ] **Step 2: Add the Drive IPC channels**

In `src/shared/ipcChannels.ts`, add four entries:

```ts
export const IPC = {
  SELECT_FOLDER: 'dialog:selectFolder',
  ANALYZE: 'import:analyze',
  ANALYZE_PROGRESS: 'import:analyze:progress',
  RECOMPUTE_CLUSTERS: 'cluster:recompute',
  GET_THUMBNAIL: 'thumbnail:get',
  COPY_START: 'copy:start',
  COPY_PROGRESS: 'copy:progress',
  OPEN_PATH: 'shell:openPath',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  DRIVE_STATUS: 'drive:status',
  DRIVE_CONNECT: 'drive:connect',
  DRIVE_DISCONNECT: 'drive:disconnect',
  DRIVE_UPLOAD_START: 'drive:upload:start',
  DRIVE_UPLOAD_PROGRESS: 'drive:upload:progress',
  DRIVE_OPEN_ROOT: 'drive:openRoot',
} as const
```

- [ ] **Step 3: Add the Drive upload request schema**

In `src/shared/ipcSchemas.ts`, add at the end (reuses the existing `copyPlanGroupSchema` already defined above it in the file):

```ts
export const driveUploadStartRequestSchema = z.object({
  groups: z.array(copyPlanGroupSchema),
})
```

- [ ] **Step 4: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: `driveUploadEngine.test.ts` (Task 7) now typechecks cleanly since `CopyProgressEvent` has `status`.

- [ ] **Step 5: Re-run Task 7's tests to confirm they now pass end-to-end**

```bash
npx vitest run tests/unit/drive/driveUploadEngine.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Run the full test suite (no regressions)**

```bash
npm test
```

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/shared/ipcChannels.ts src/shared/ipcSchemas.ts
git commit -m "feat: add Drive IPC channels and shared types (status field, DriveStatus)"
```

---

## Task 10: Wire the IPC handlers

**Files:**
- Modify: `src/main/ipc/handlers.ts`

- [ ] **Step 1: Replace the file's full contents**

```ts
// src/main/ipc/handlers.ts
import { ipcMain, dialog, shell, BrowserWindow, app, safeStorage } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import {
  selectFolderRequestSchema,
  analyzeRequestSchema,
  reclusterRequestSchema,
  getThumbnailRequestSchema,
  copyStartRequestSchema,
  openPathRequestSchema,
  settingsSetRequestSchema,
  driveUploadStartRequestSchema,
} from '../../shared/ipcSchemas'
import { analyzeSource, recluster } from '../importSession'
import { runCopyPlan } from '../fs/copyEngine'
import { extractThumbnail } from '../thumbnails/extractThumbnail'
import { getSettings, setSettings } from '../settings/settingsStore'
import { getDriveTokens, setDriveTokens, clearDriveTokens, type TokenCipher } from '../drive/driveAuthStore'
import { getDriveOAuthConfig, type DriveOAuthConfig } from '../drive/driveConfig'
import { connectDrive, createAuthorizedClient } from '../drive/driveAuth'
import { createGoogleDriveApi, type DriveApi } from '../drive/driveApi'
import { getOrCreateRootFolder, runDriveUploadPlan } from '../drive/driveUploadEngine'

const driveCipher: TokenCipher = {
  encrypt: (text) => safeStorage.encryptString(text),
  decrypt: (buf) => safeStorage.decryptString(buf),
}

function requireDriveConfig(): DriveOAuthConfig {
  const config = getDriveOAuthConfig()
  if (!config) {
    throw new Error(
      'Google Drive is not configured for this build (missing GOOGLE_DRIVE_CLIENT_ID/GOOGLE_DRIVE_CLIENT_SECRET).'
    )
  }
  return config
}

async function getConnectedDriveApi(): Promise<DriveApi> {
  const config = requireDriveConfig()
  const tokens = await getDriveTokens(app.getPath('userData'), driveCipher)
  if (!tokens) throw new Error('Google Drive is not connected.')
  const oauth2Client = createAuthorizedClient(config, tokens.refreshToken)
  return createGoogleDriveApi(async () => {
    const { token } = await oauth2Client.getAccessToken()
    if (!token) throw new Error('Failed to obtain a Google access token.')
    return token
  })
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.SELECT_FOLDER, async (_event, payload) => {
    const { role } = selectFolderRequestSchema.parse(payload)
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: role === 'source' ? 'Select source folder (SD card)' : 'Select destination folder',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.ANALYZE, async (_event, payload) => {
    const { sourcePath, thresholdMs } = analyzeRequestSchema.parse(payload)
    const groups = await analyzeSource(sourcePath, thresholdMs, (progress) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.ANALYZE_PROGRESS, progress)
      }
    })
    return { groups }
  })

  ipcMain.handle(IPC.RECOMPUTE_CLUSTERS, async (_event, payload) => {
    const { thresholdMs } = reclusterRequestSchema.parse(payload)
    return { groups: recluster(thresholdMs) }
  })

  ipcMain.handle(IPC.GET_THUMBNAIL, async (_event, payload) => {
    const { path, mediaType } = getThumbnailRequestSchema.parse(payload)
    const dataUrl = await extractThumbnail(path, mediaType)
    return dataUrl ? { dataUrl } : null
  })

  ipcMain.handle(IPC.COPY_START, async (_event, payload) => {
    const { destinationRoot, groups } = copyStartRequestSchema.parse(payload)
    return runCopyPlan({ destinationRoot, groups }, (progress) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.COPY_PROGRESS, progress)
      }
    })
  })

  ipcMain.handle(IPC.OPEN_PATH, async (_event, payload) => {
    const { path } = openPathRequestSchema.parse(payload)
    await shell.openPath(path)
  })

  ipcMain.handle(IPC.SETTINGS_GET, async () => {
    return getSettings(app.getPath('userData'))
  })

  ipcMain.handle(IPC.SETTINGS_SET, async (_event, payload) => {
    const settings = settingsSetRequestSchema.parse(payload)
    await setSettings(app.getPath('userData'), settings)
  })

  ipcMain.handle(IPC.DRIVE_STATUS, async () => {
    const tokens = await getDriveTokens(app.getPath('userData'), driveCipher)
    return { connected: !!tokens, email: tokens?.email ?? null }
  })

  ipcMain.handle(IPC.DRIVE_CONNECT, async () => {
    const config = requireDriveConfig()
    const result = await connectDrive(config)
    await setDriveTokens(app.getPath('userData'), driveCipher, {
      refreshToken: result.refreshToken,
      email: result.email,
    })
    return { connected: true, email: result.email }
  })

  ipcMain.handle(IPC.DRIVE_DISCONNECT, async () => {
    await clearDriveTokens(app.getPath('userData'))
  })

  ipcMain.handle(IPC.DRIVE_UPLOAD_START, async (_event, payload) => {
    const { groups } = driveUploadStartRequestSchema.parse(payload)
    const api = await getConnectedDriveApi()
    const root = await getOrCreateRootFolder(api)
    return runDriveUploadPlan({ rootFolderId: root.id, groups }, (progress) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.DRIVE_UPLOAD_PROGRESS, progress)
      }
    }, api)
  })

  ipcMain.handle(IPC.DRIVE_OPEN_ROOT, async () => {
    const api = await getConnectedDriveApi()
    const root = await getOrCreateRootFolder(api)
    if (root.webViewLink) await shell.openExternal(root.webViewLink)
  })
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

- [ ] **Step 3: Run the full test suite (no regressions)**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/handlers.ts
git commit -m "feat: wire Drive IPC handlers (status, connect, disconnect, upload, open root)"
```

---

## Task 11: Expose the Drive API from preload

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Replace the file's full contents**

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipcChannels'
import type {
  AnalyzeProgress,
  CopyPlanGroup,
  CopyProgressEvent,
  CopySummary,
  DriveStatus,
  MediaType,
  PhotoGroup
} from '../shared/types'
import type { Settings } from '../shared/settingsSchema'

// Custom APIs for renderer
const api = {}

const saaraAPI = {
  selectFolder: (role: 'source' | 'destination'): Promise<string | null> =>
    ipcRenderer.invoke(IPC.SELECT_FOLDER, { role }),

  analyze: (sourcePath: string, thresholdMs: number): Promise<{ groups: PhotoGroup[] }> =>
    ipcRenderer.invoke(IPC.ANALYZE, { sourcePath, thresholdMs }),

  onAnalyzeProgress: (cb: (p: AnalyzeProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: AnalyzeProgress): void => cb(p)
    ipcRenderer.on(IPC.ANALYZE_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC.ANALYZE_PROGRESS, listener)
  },

  recluster: (thresholdMs: number): Promise<{ groups: PhotoGroup[] }> =>
    ipcRenderer.invoke(IPC.RECOMPUTE_CLUSTERS, { thresholdMs }),

  getThumbnail: (path: string, mediaType: MediaType): Promise<{ dataUrl: string } | null> =>
    ipcRenderer.invoke(IPC.GET_THUMBNAIL, { path, mediaType }),

  copyStart: (destinationRoot: string, groups: CopyPlanGroup[]): Promise<CopySummary> =>
    ipcRenderer.invoke(IPC.COPY_START, { destinationRoot, groups }),

  onCopyProgress: (cb: (p: CopyProgressEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: CopyProgressEvent): void => cb(p)
    ipcRenderer.on(IPC.COPY_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC.COPY_PROGRESS, listener)
  },

  openPath: (path: string): Promise<void> => ipcRenderer.invoke(IPC.OPEN_PATH, { path }),

  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.SETTINGS_GET),

  setSettings: (settings: Settings): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_SET, settings),

  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  driveStatus: (): Promise<DriveStatus> => ipcRenderer.invoke(IPC.DRIVE_STATUS),

  driveConnect: (): Promise<DriveStatus> => ipcRenderer.invoke(IPC.DRIVE_CONNECT),

  driveDisconnect: (): Promise<void> => ipcRenderer.invoke(IPC.DRIVE_DISCONNECT),

  driveUploadStart: (groups: CopyPlanGroup[]): Promise<CopySummary> =>
    ipcRenderer.invoke(IPC.DRIVE_UPLOAD_START, { groups }),

  onDriveUploadProgress: (cb: (p: CopyProgressEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: CopyProgressEvent): void => cb(p)
    ipcRenderer.on(IPC.DRIVE_UPLOAD_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC.DRIVE_UPLOAD_PROGRESS, listener)
  },

  openDriveRoot: (): Promise<void> => ipcRenderer.invoke(IPC.DRIVE_OPEN_ROOT)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('saaraAPI', saaraAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.saaraAPI = saaraAPI
}

export type SaaraAPI = typeof saaraAPI
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: expose Drive API on window.saaraAPI"
```

---

## Task 12: `useImportWorkflow` — destination type and Drive connection state

**Files:**
- Modify: `src/renderer/src/hooks/useImportWorkflow.ts`

- [ ] **Step 1: Replace the file's full contents**

```ts
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
      ? window.saaraAPI.onDriveUploadProgress((progress) => dispatch({ type: 'COPY_PROGRESS', progress }))
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
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

- [ ] **Step 3: Run the full test suite (no regressions)**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/hooks/useImportWorkflow.ts
git commit -m "feat: add destinationType/Drive connection state, branch startCopy by destination"
```

---

## Task 13: `Dropzone` — corner button and override body

**Files:**
- Modify: `src/renderer/src/components/Dropzone.tsx`

- [ ] **Step 1: Replace the file's full contents**

```tsx
// src/renderer/src/components/Dropzone.tsx
import { useState } from 'react'
import type { ReactNode, DragEvent, KeyboardEvent } from 'react'

interface CornerButtonProps {
  icon: ReactNode
  label: string
  onClick: () => void
}

interface Props {
  label: string
  hint: string
  icon: ReactNode
  path: string | null
  onPick: () => void
  onDropPath: (path: string) => void
  disabled?: boolean
  cornerButton?: CornerButtonProps
  overrideBody?: ReactNode
}

export function Dropzone({
  label,
  hint,
  icon,
  path,
  onPick,
  onDropPath,
  disabled,
  cornerButton,
  overrideBody
}: Props): React.JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    if (!disabled) setIsDragOver(true)
  }

  function handleDragLeave(): void {
    setIsDragOver(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragOver(false)
    if (disabled || overrideBody) return
    const file = e.dataTransfer.files[0]
    if (!file) return
    const droppedPath = window.saaraAPI.getPathForFile(file)
    if (droppedPath) onDropPath(droppedPath)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick()
    }
  }

  const accessibleLabel = `${label}: ${path ? path : hint}`

  return (
    <div
      className={`dropzone${isDragOver ? ' dropzone-active' : ''}`}
      data-disabled={disabled ? 'true' : 'false'}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled ? 'true' : undefined}
      aria-label={accessibleLabel}
      onClick={disabled || overrideBody ? undefined : onPick}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {cornerButton && (
        <button
          type="button"
          className="dropzone-corner-button"
          aria-label={cornerButton.label}
          onClick={(e) => {
            e.stopPropagation()
            cornerButton.onClick()
          }}
        >
          {cornerButton.icon}
        </button>
      )}
      {overrideBody ?? (
        <>
          {icon}
          <span className="dropzone-label">{label}</span>
          {path ? (
            <span className="dropzone-path">{path}</span>
          ) : (
            <span className="dropzone-hint">{hint}</span>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck and lint**

```bash
npm run typecheck
npx eslint src/renderer/src/components/Dropzone.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Dropzone.tsx
git commit -m "feat: add Dropzone corner-button and override-body support for Drive toggle"
```

---

## Task 14: `HomeScreen` — Drive toggle, connect flow, paused progress, view-in-Drive

**Files:**
- Modify: `src/renderer/src/screens/HomeScreen.tsx`

- [ ] **Step 1: Replace the file's full contents**

```tsx
// src/renderer/src/screens/HomeScreen.tsx
import { AnimatePresence, motion } from 'motion/react'
import {
  FolderOpen,
  FolderPlus,
  Gear,
  CheckCircle,
  WarningCircle,
  GoogleDriveLogo
} from '@phosphor-icons/react'
import { Dropzone } from '../components/Dropzone'
import { GroupCard } from '../components/GroupCard'
import { ProgressBar } from '../components/ProgressBar'
import type { useImportWorkflow } from '../hooks/useImportWorkflow'

const PHASE_LABELS: Record<string, string> = {
  scanning: 'Scanning files',
  'reading-metadata': 'Analyzing files',
  clustering: 'Grouping'
}

interface Props {
  workflow: ReturnType<typeof useImportWorkflow>
  onOpenSettings: () => void
}

export function HomeScreen({ workflow, onOpenSettings }: Props): React.JSX.Element {
  const {
    state,
    pickSource,
    dropSource,
    pickDestination,
    dropDestination,
    toggleDestinationType,
    connectDrive,
    renameGroup,
    startCopy
  } = workflow

  const totalFiles = state.groups.reduce((sum, g) => sum + g.files.length, 0)
  const subView = state.copySummary
    ? 'done'
    : state.copying
      ? 'copying'
      : state.analyzeError
        ? 'error'
        : state.analyzeProgress
          ? 'analyzing'
          : state.groups.length > 0
            ? 'reviewing'
            : 'empty'
  const boxesDisabled = state.copying || !!state.analyzeProgress
  const isDrive = state.destinationType === 'drive'

  const destinationReady = isDrive ? state.driveStatus.connected : !!state.destinationPath

  const driveBody = isDrive ? (
    <>
      <FolderPlus size={28} aria-hidden="true" />
      <span className="dropzone-label">Destination</span>
      {state.driveStatus.connected ? (
        <span className="dropzone-path">{state.driveStatus.email}</span>
      ) : (
        <button
          type="button"
          className="field-button"
          disabled={state.driveConnecting}
          onClick={(e) => {
            e.stopPropagation()
            void connectDrive()
          }}
        >
          {state.driveConnecting ? 'Connecting…' : 'Connect Google Drive'}
        </button>
      )}
      {state.driveError && <span className="field-error">{state.driveError}</span>}
    </>
  ) : undefined

  return (
    <div className="home-screen">
      <div className="screen-header">
        <h1 className="wordmark" style={{ marginRight: 'auto' }}>
          S<span className="wordmark-accent">a</span>ara
        </h1>
        <button
          className="icon-button"
          onClick={onOpenSettings}
          disabled={boxesDisabled}
          aria-label="Settings"
        >
          <Gear size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="dropzone-row">
        <Dropzone
          label="Source"
          hint="Drop folder or click to browse"
          icon={<FolderOpen size={28} aria-hidden="true" />}
          path={state.sourcePath}
          onPick={pickSource}
          onDropPath={dropSource}
          disabled={boxesDisabled}
        />
        <Dropzone
          label="Destination"
          hint="Drop folder or click to browse"
          icon={<FolderPlus size={28} aria-hidden="true" />}
          path={state.destinationPath}
          onPick={pickDestination}
          onDropPath={dropDestination}
          disabled={boxesDisabled}
          overrideBody={driveBody}
          cornerButton={{
            icon: isDrive ? (
              <FolderOpen size={16} aria-hidden="true" />
            ) : (
              <GoogleDriveLogo size={16} aria-hidden="true" />
            ),
            label: isDrive ? 'Switch to a local folder' : 'Switch to Google Drive',
            onClick: toggleDestinationType
          }}
        />
      </div>

      <div className="home-content">
        <AnimatePresence mode="wait">
          {subView === 'empty' && (
            <motion.p
              key="empty"
              className="field-value"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              Drop or select a source folder to get started.
            </motion.p>
          )}

          {subView === 'analyzing' && state.analyzeProgress && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <p>{PHASE_LABELS[state.analyzeProgress.phase] ?? state.analyzeProgress.phase}</p>
              <p className="tabular-nums">
                {state.analyzeProgress.current}/{state.analyzeProgress.total}
              </p>
            </motion.div>
          )}

          {subView === 'error' && (
            <motion.p
              key="error"
              className="field-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {state.analyzeError}
            </motion.p>
          )}

          {subView === 'reviewing' && (
            <motion.div
              key="reviewing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {state.groups.map((g) => (
                <GroupCard key={g.id} group={g} onRename={(name) => renameGroup(g.id, name)} />
              ))}
            </motion.div>
          )}

          {subView === 'copying' && (
            <motion.div
              key="copying"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <h1>{isDrive ? 'Uploading to Drive…' : 'Copying files…'}</h1>
              {state.copyProgress && (
                <>
                  {state.copyProgress.status === 'paused' ? (
                    <p className="field-error">
                      <WarningCircle size={16} aria-hidden="true" /> Paused — waiting for
                      connection…
                    </p>
                  ) : (
                    <p>
                      {state.copyProgress.groupName}: {state.copyProgress.fileName}
                    </p>
                  )}
                  <ProgressBar
                    current={state.copyProgress.filesCopiedSoFar}
                    total={state.copyProgress.totalFiles}
                  />
                </>
              )}
            </motion.div>
          )}

          {subView === 'done' && state.copySummary && (
            <motion.div
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <h1>
                <CheckCircle size={22} aria-hidden="true" />{' '}
                {isDrive ? 'Upload complete' : 'Copy complete'}
              </h1>
              <p className="tabular-nums">
                {state.copySummary.copiedFiles}/{state.copySummary.totalFiles} files{' '}
                {isDrive ? 'uploaded' : 'copied'}
                {state.copySummary.skippedFiles > 0 &&
                  ` (${state.copySummary.skippedFiles} already there, skipped)`}
              </p>
              {state.copySummary.conflicts.length > 0 && (
                <p>
                  <WarningCircle size={16} aria-hidden="true" />{' '}
                  {state.copySummary.conflicts.length} name conflicts resolved (renamed, nothing
                  overwritten)
                </p>
              )}
              {state.copySummary.errors.length > 0 && (
                <p>
                  <WarningCircle size={16} aria-hidden="true" /> {state.copySummary.errors.length}{' '}
                  files failed to {isDrive ? 'upload' : 'copy'}
                </p>
              )}
              {isDrive ? (
                <button className="primary" onClick={() => window.saaraAPI.openDriveRoot()}>
                  <GoogleDriveLogo size={18} aria-hidden="true" /> View in Drive
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={!state.destinationPath}
                  onClick={() =>
                    state.destinationPath && window.saaraAPI.openPath(state.destinationPath)
                  }
                >
                  <FolderOpen size={18} aria-hidden="true" /> Open destination folder
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {subView === 'reviewing' && (
        <div className="sticky-footer">
          <span className="tabular-nums field-value">
            {state.groups.length} groups, {totalFiles} files
          </span>
          {!destinationReady && (
            <span className="field-error">
              {isDrive ? 'Connect Google Drive to continue' : 'Select a destination folder to continue'}
            </span>
          )}
          {state.copyError && <span className="field-error">{state.copyError}</span>}
          <button className="primary" disabled={!destinationReady} onClick={startCopy}>
            {isDrive ? 'Confirm & Upload' : 'Confirm & Copy'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck and lint**

```bash
npm run typecheck
npx eslint src/renderer/src/screens/HomeScreen.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/screens/HomeScreen.tsx
git commit -m "feat: wire Drive toggle, connect flow, paused-upload UI, view-in-Drive"
```

---

## Task 15: Styling — corner button, paused state

**Files:**
- Modify: `src/renderer/src/theme.css`

- [ ] **Step 1: Add the new rules**

Append to the end of `src/renderer/src/theme.css`:

```css
/* --- Drive destination additions below --- */

.dropzone {
  position: relative;
}

.dropzone-corner-button {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color 150ms ease,
    border-color 150ms ease;
}

.dropzone-corner-button:hover {
  color: var(--color-text);
  border-color: var(--color-accent);
}
```

- [ ] **Step 2: Verify typecheck (CSS isn't type-checked, but confirm nothing else broke)**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/theme.css
git commit -m "feat: style the Dropzone corner toggle button"
```

---

## Task 16: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

```bash
npm run typecheck
```

- [ ] **Step 2: Full test suite**

```bash
npm test
npm run test:metadata
```

- [ ] **Step 3: Full lint**

```bash
npx eslint .
```

Confirm no new errors beyond the pre-existing baseline (this codebase already has some CRLF-related prettier warnings and a few pre-existing `explicit-function-return-type` errors in unrelated test files — don't chase those, just confirm nothing new from this plan's files).

- [ ] **Step 4: Code-smell check**

```bash
npm run smell
```

- [ ] **Step 5: Manual OAuth + upload smoke test (ask before running — opens a real browser and talks to real Google Drive)**

Requires: the `.env` file from the Prerequisite section filled in with real credentials, and `npm run dev` running. Confirm with the user before running, then walk through by hand:

1. Analyze a source folder as usual (this part is unchanged).
2. Click the Drive icon in the corner of the Destination box — it should flip to a folder icon and the box should show "Connect Google Drive".
3. Click "Connect Google Drive" — your system browser should open to a real Google consent screen. Approve it.
4. Back in the app, the Destination box should now show your connected Google account's email, and "Confirm & Copy" should read "Confirm & Upload".
5. Click "Confirm & Upload". Watch the progress UI; confirm it reaches "Upload complete".
6. In a real browser, go to https://drive.google.com and confirm a "Saara" folder exists at the root, containing a subfolder per group, containing the uploaded files.
7. Click "View in Drive" on the done screen — confirm it opens that same Saara folder in your browser.
8. Re-run the exact same upload (same source, same groups) without changing anything. Confirm the summary shows all files as skipped (not re-uploaded, not duplicated) — check Drive directly to confirm no duplicate files/folders were created.
9. If you can, test the pause/resume path: start an upload, then disable your network connection mid-upload. Confirm the progress UI shows "Paused — waiting for connection…", and that re-enabling the network lets the upload finish on its own within about 20 seconds.
10. Click the corner icon again to switch back to "local" — confirm the Destination box reverts to the normal folder dropzone/path behavior from before this plan, unchanged.
