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
