import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { scanFiles } from '../../../src/main/fs/scanFiles'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saara-scan-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

async function touch(relPath: string): Promise<void> {
  const full = path.join(tmpDir, relPath)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, 'x')
}

describe('scanFiles', () => {
  it('finds supported media files recursively', async () => {
    await touch('a.jpg')
    await touch('sub/b.CR2')
    await touch('sub/deeper/c.mp4')

    const results = await scanFiles(tmpDir)
    const names = results.map((r) => path.basename(r.path)).sort()
    expect(names).toEqual(['a.jpg', 'b.CR2', 'c.mp4'])
  })

  it('excludes unsupported file types', async () => {
    await touch('a.jpg')
    await touch('notes.txt')
    await touch('Thumbs.db')

    const results = await scanFiles(tmpDir)
    expect(results.map((r) => path.basename(r.path))).toEqual(['a.jpg'])
  })

  it('returns an empty array for an empty directory', async () => {
    const results = await scanFiles(tmpDir)
    expect(results).toEqual([])
  })

  it('assigns the correct mediaType per file', async () => {
    await touch('a.jpg')
    await touch('b.CR2')
    await touch('c.mp4')

    const results = await scanFiles(tmpDir)
    const byName = Object.fromEntries(results.map((r) => [path.basename(r.path), r.mediaType]))
    expect(byName['a.jpg']).toBe('photo')
    expect(byName['b.CR2']).toBe('raw')
    expect(byName['c.mp4']).toBe('video')
  })

  it('throws a clear error when rootDir is a file, not a folder', async () => {
    await touch('not-a-folder.jpg')
    await expect(scanFiles(path.join(tmpDir, 'not-a-folder.jpg'))).rejects.toThrow(/not a folder/)
  })

  it('throws a clear error when rootDir does not exist', async () => {
    await expect(scanFiles(path.join(tmpDir, 'does-not-exist'))).rejects.toThrow(/not a folder/)
  })
})
