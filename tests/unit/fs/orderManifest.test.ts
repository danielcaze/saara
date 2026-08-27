import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  ORDER_MANIFEST_FILE,
  readOrderManifests,
  writeOrderManifest
} from '../../../src/main/fs/orderManifest'

let rootDir: string

beforeEach(async () => {
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saara-manifest-'))
})

afterEach(async () => {
  await fs.rm(rootDir, { recursive: true, force: true })
})

describe('local order manifests', () => {
  it('reads group manifests from exported folders in their original group order', async () => {
    const laterGroup = path.join(rootDir, 'Later')
    const firstGroup = path.join(rootDir, 'First')
    await fs.mkdir(laterGroup)
    await fs.mkdir(firstGroup)
    await writeOrderManifest(laterGroup, {
      id: 'later',
      name: 'Later',
      groupOrder: 1,
      folderName: 'Later',
      files: ['B.JPG']
    })
    await writeOrderManifest(firstGroup, {
      id: 'first',
      name: 'First',
      groupOrder: 0,
      folderName: 'First',
      files: ['A.JPG']
    })

    await expect(readOrderManifests(rootDir)).resolves.toEqual([
      { id: 'first', name: 'First', groupOrder: 0, folderName: 'First', files: ['A.JPG'] },
      { id: 'later', name: 'Later', groupOrder: 1, folderName: 'Later', files: ['B.JPG'] }
    ])
  })

  it('returns no restored groups when a source does not contain manifests', async () => {
    await fs.mkdir(path.join(rootDir, 'Photos'))
    await expect(readOrderManifests(rootDir)).resolves.toEqual([])
  })

  it('ignores malformed manifests', async () => {
    const groupDir = path.join(rootDir, 'Photos')
    await fs.mkdir(groupDir)
    await fs.writeFile(path.join(groupDir, ORDER_MANIFEST_FILE), '{not valid json', 'utf-8')
    await expect(readOrderManifests(rootDir)).resolves.toEqual([])
  })
})
