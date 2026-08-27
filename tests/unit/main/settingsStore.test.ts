import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { getSettings, setSettings } from '../../../src/main/settings/settingsStore'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saara-settings-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('settingsStore', () => {
  it('returns default settings when no file exists', async () => {
    const settings = await getSettings(tmpDir)
    expect(settings).toEqual({ thresholdHours: 24, prefixCopiedFileNames: false })
  })

  it('persists and reloads settings', async () => {
    await setSettings(tmpDir, { thresholdHours: 12, prefixCopiedFileNames: true })
    const settings = await getSettings(tmpDir)
    expect(settings).toEqual({ thresholdHours: 12, prefixCopiedFileNames: true })
  })

  it('overwrites previous settings on repeated writes', async () => {
    await setSettings(tmpDir, { thresholdHours: 12, prefixCopiedFileNames: false })
    await setSettings(tmpDir, { thresholdHours: 48, prefixCopiedFileNames: true })
    const settings = await getSettings(tmpDir)
    expect(settings).toEqual({ thresholdHours: 48, prefixCopiedFileNames: true })
  })

  it('falls back to defaults when the file contains invalid data', async () => {
    await fs.mkdir(tmpDir, { recursive: true })
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"thresholdHours": -5}', 'utf-8')
    const settings = await getSettings(tmpDir)
    expect(settings).toEqual({ thresholdHours: 24, prefixCopiedFileNames: false })
  })

  it('rejects invalid settings on write', async () => {
    await expect(
      setSettings(tmpDir, { thresholdHours: -1, prefixCopiedFileNames: false })
    ).rejects.toThrow()
  })
})
