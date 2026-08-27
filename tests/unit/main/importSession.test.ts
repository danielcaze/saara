import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { restoredGroupsFromManifest } from '../../../src/main/importSession'

describe('restoredGroupsFromManifest', () => {
  it('restores files in the saved group and file order', () => {
    const sourcePath = path.join('C:', 'Exports')
    const firstPath = path.join(sourcePath, 'Weekend', '0001_A.JPG')
    const secondPath = path.join(sourcePath, 'Weekend', '0002_B.JPG')
    const result = restoredGroupsFromManifest(
      sourcePath,
      [
        {
          path: firstPath,
          mediaType: 'photo',
          timestamp: new Date('2026-08-01T10:00:00Z'),
          timestampSource: 'DateTimeOriginal'
        },
        {
          path: secondPath,
          mediaType: 'photo',
          timestamp: new Date('2026-08-01T11:00:00Z'),
          timestampSource: 'DateTimeOriginal'
        }
      ],
      [
        {
          id: 'weekend',
          name: 'Weekend',
          groupOrder: 0,
          folderName: 'Weekend',
          files: ['0002_B.JPG', '0001_A.JPG']
        }
      ]
    )

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]).toMatchObject({ id: 'weekend', name: 'Weekend' })
    expect(result.groups[0].files.map((file) => file.fileName)).toEqual([
      '0002_B.JPG',
      '0001_A.JPG'
    ])
    expect(result.restoredPaths).toEqual(new Set([firstPath, secondPath]))
  })
})
