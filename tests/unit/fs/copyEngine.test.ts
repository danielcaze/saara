import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { runCopyPlan, type CopyPlan } from '../../../src/main/fs/copyEngine'
import { sanitizeFolderName } from '../../../src/main/fs/sanitizeFolderName'

let srcDir: string
let destDir: string

beforeEach(async () => {
  srcDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saara-src-'))
  destDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saara-dest-'))
})

afterEach(async () => {
  await fs.rm(srcDir, { recursive: true, force: true })
  await fs.rm(destDir, { recursive: true, force: true })
})

async function writeSrcFile(name: string, content = 'x') {
  const full = path.join(srcDir, name)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, content)
  return full
}

describe('sanitizeFolderName', () => {
  it('strips Windows-illegal characters', () => {
    expect(sanitizeFolderName('2026-08-09_a_2026-08-11')).toBe('2026-08-09_a_2026-08-11')
    expect(sanitizeFolderName('Trip: Paris/Rome?')).toBe('Trip Paris Rome')
  })

  it('trims trailing dots and spaces', () => {
    expect(sanitizeFolderName('Trip. ')).toBe('Trip')
  })
})

describe('runCopyPlan', () => {
  it('copies files into a per-group subfolder', async () => {
    const f1 = await writeSrcFile('IMG_0001.jpg')
    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [{ id: 'group-0', name: '2026-08-11', files: [{ sourcePath: f1, fileName: 'IMG_0001.jpg' }] }],
    }
    const summary = await runCopyPlan(plan, () => {})
    expect(summary.copiedFiles).toBe(1)
    expect(summary.errors).toEqual([])
    const copied = await fs.readFile(path.join(destDir, '2026-08-11', 'IMG_0001.jpg'), 'utf-8')
    expect(copied).toBe('x')
  })

  it('never overwrites on name conflict, appends a suffix instead', async () => {
    const f1 = await writeSrcFile('IMG_0001.jpg', 'first')
    await fs.mkdir(path.join(destDir, '2026-08-11'), { recursive: true })
    await fs.writeFile(path.join(destDir, '2026-08-11', 'IMG_0001.jpg'), 'existing')

    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [{ id: 'group-0', name: '2026-08-11', files: [{ sourcePath: f1, fileName: 'IMG_0001.jpg' }] }],
    }
    const summary = await runCopyPlan(plan, () => {})

    expect(summary.conflicts).toEqual([{ originalName: 'IMG_0001.jpg', resolvedName: 'IMG_0001 (1).jpg' }])
    const original = await fs.readFile(path.join(destDir, '2026-08-11', 'IMG_0001.jpg'), 'utf-8')
    expect(original).toBe('existing') // untouched
    const renamed = await fs.readFile(path.join(destDir, '2026-08-11', 'IMG_0001 (1).jpg'), 'utf-8')
    expect(renamed).toBe('first')
  })

  it('resolves multiple sequential conflicts without collision', async () => {
    const f1 = await writeSrcFile('a/IMG_0001.jpg', 'one')
    await fs.mkdir(path.join(destDir, 'g'), { recursive: true })
    await fs.writeFile(path.join(destDir, 'g', 'IMG_0001.jpg'), 'existing0')
    await fs.writeFile(path.join(destDir, 'g', 'IMG_0001 (1).jpg'), 'existing1')

    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [{ id: 'group-0', name: 'g', files: [{ sourcePath: f1, fileName: 'IMG_0001.jpg' }] }],
    }
    const summary = await runCopyPlan(plan, () => {})
    expect(summary.conflicts[0].resolvedName).toBe('IMG_0001 (2).jpg')
  })

  it('preserves source mtime on the copied file', async () => {
    const f1 = await writeSrcFile('IMG_0002.jpg')
    const oldTime = new Date('2020-01-01T00:00:00Z')
    await fs.utimes(f1, oldTime, oldTime)

    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [{ id: 'group-0', name: 'g', files: [{ sourcePath: f1, fileName: 'IMG_0002.jpg' }] }],
    }
    await runCopyPlan(plan, () => {})
    const destStat = await fs.stat(path.join(destDir, 'g', 'IMG_0002.jpg'))
    expect(Math.abs(destStat.mtime.getTime() - oldTime.getTime())).toBeLessThan(2000)
  })

  it('leaves the source file untouched after copy', async () => {
    const f1 = await writeSrcFile('IMG_0003.jpg', 'original-content')
    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [{ id: 'group-0', name: 'g', files: [{ sourcePath: f1, fileName: 'IMG_0003.jpg' }] }],
    }
    await runCopyPlan(plan, () => {})
    const sourceContent = await fs.readFile(f1, 'utf-8')
    expect(sourceContent).toBe('original-content')
  })

  it('reports progress with correct running counts', async () => {
    const f1 = await writeSrcFile('a.jpg')
    const f2 = await writeSrcFile('b.jpg')
    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [
        {
          id: 'group-0',
          name: 'g',
          files: [
            { sourcePath: f1, fileName: 'a.jpg' },
            { sourcePath: f2, fileName: 'b.jpg' },
          ],
        },
      ],
    }
    const events: number[] = []
    await runCopyPlan(plan, (e) => events.push(e.filesCopiedSoFar))
    expect(events).toEqual([1, 2])
  })

  it('gives distinct folders to two groups whose names sanitize to the same string', async () => {
    const f1 = await writeSrcFile('a.jpg')
    const f2 = await writeSrcFile('b.jpg')
    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [
        { id: 'group-0', name: 'Trip: Paris', files: [{ sourcePath: f1, fileName: 'a.jpg' }] },
        { id: 'group-1', name: 'Trip Paris', files: [{ sourcePath: f2, fileName: 'b.jpg' }] },
      ],
    }
    await runCopyPlan(plan, () => {})
    const entries = await fs.readdir(destDir)
    expect(entries.sort()).toEqual(['Trip Paris', 'Trip Paris (2)'])
  })

  it('never silently overwrites when two files in the same group share a filename (concurrency race)', async () => {
    const srcA = path.join(srcDir, 'a')
    const srcB = path.join(srcDir, 'b')
    await fs.mkdir(srcA, { recursive: true })
    await fs.mkdir(srcB, { recursive: true })
    const f1 = path.join(srcA, 'IMG_0001.jpg')
    const f2 = path.join(srcB, 'IMG_0001.jpg')
    await fs.writeFile(f1, 'content-from-camera-A')
    await fs.writeFile(f2, 'content-from-camera-B')

    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [
        {
          id: 'group-0',
          name: 'g',
          files: [
            { sourcePath: f1, fileName: 'IMG_0001.jpg' },
            { sourcePath: f2, fileName: 'IMG_0001.jpg' },
          ],
        },
      ],
    }
    const summary = await runCopyPlan(plan, () => {})

    // Both files must survive under distinct names, no data loss
    const destFiles = await fs.readdir(path.join(destDir, 'g'))
    expect(destFiles).toHaveLength(2)
    const contents = await Promise.all(destFiles.map((f) => fs.readFile(path.join(destDir, 'g', f), 'utf-8')))
    expect(contents.sort()).toEqual(['content-from-camera-A', 'content-from-camera-B'])
    expect(summary.copiedFiles).toBe(2)
    expect(summary.conflicts).toHaveLength(1)
  })

  it("doesn't abort the rest of the job when one file fails", async () => {
    const f1 = await writeSrcFile('good.jpg')
    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [
        {
          id: 'group-0',
          name: 'g',
          files: [
            { sourcePath: path.join(srcDir, 'missing.jpg'), fileName: 'missing.jpg' },
            { sourcePath: f1, fileName: 'good.jpg' },
          ],
        },
      ],
    }
    const summary = await runCopyPlan(plan, () => {})
    expect(summary.errors).toHaveLength(1)
    expect(summary.copiedFiles).toBe(1)
    const copied = await fs.readFile(path.join(destDir, 'g', 'good.jpg'), 'utf-8')
    expect(copied).toBe('x')
  })
})
