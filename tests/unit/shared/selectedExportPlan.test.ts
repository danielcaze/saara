import { describe, expect, it } from 'vitest'
import { selectedExportPlan } from '../../../src/shared/selectedExportPlan'
import type { PhotoGroup } from '../../../src/shared/types'

const group: PhotoGroup = {
  id: 'g1',
  name: 'Beach day',
  startDate: null,
  endDate: null,
  isNoDateGroup: false,
  files: [
    {
      path: '/card/001.jpg',
      fileName: '001.jpg',
      mediaType: 'photo',
      timestamp: null,
      timestampSource: null,
      metadataError: null
    },
    {
      path: '/card/015.jpg',
      fileName: '015.jpg',
      mediaType: 'photo',
      timestamp: null,
      timestampSource: null,
      metadataError: null
    }
  ]
}

describe('selectedExportPlan', () => {
  it('keeps the group and renumbers only its selected files when enabled', () => {
    expect(selectedExportPlan([group], new Set(['/card/001.jpg', '/card/015.jpg']), true)).toEqual([
      {
        id: 'g1',
        name: 'Beach day',
        files: [
          { sourcePath: '/card/001.jpg', fileName: '0001_001.jpg' },
          { sourcePath: '/card/015.jpg', fileName: '0002_015.jpg' }
        ]
      }
    ])
  })

  it('keeps selected filenames unchanged when ordered filenames are disabled', () => {
    expect(
      selectedExportPlan([group], new Set(['/card/001.jpg', '/card/015.jpg']), false)
    ).toMatchObject([
      {
        files: [
          { sourcePath: '/card/001.jpg', fileName: '001.jpg' },
          { sourcePath: '/card/015.jpg', fileName: '015.jpg' }
        ]
      }
    ])
  })

  it('omits groups without a selected photo', () => {
    expect(selectedExportPlan([group], new Set(), false)).toEqual([])
  })
})
