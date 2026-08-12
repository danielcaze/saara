import { describe, it, expect } from 'vitest'
import { suggestGroupName } from '../../../src/shared/clustering/suggestGroupName'
import type { PhotoGroupResult } from '../../../src/shared/clustering/clusterByGap'

describe('suggestGroupName', () => {
  it('suggests a single date for a same-day group', () => {
    const group: PhotoGroupResult = {
      id: 'group-0',
      files: [],
      startDate: new Date('2026-08-11T09:00:00Z'),
      endDate: new Date('2026-08-11T18:00:00Z'),
      isNoDateGroup: false,
    }
    expect(suggestGroupName(group)).toBe('2026-08-11')
  })

  it('suggests a date range for a multi-day group', () => {
    const group: PhotoGroupResult = {
      id: 'group-0',
      files: [],
      startDate: new Date('2026-08-09T09:00:00Z'),
      endDate: new Date('2026-08-11T18:00:00Z'),
      isNoDateGroup: false,
    }
    expect(suggestGroupName(group)).toBe('2026-08-09_a_2026-08-11')
  })

  it('suggests "Sem data" for the no-date group', () => {
    const group: PhotoGroupResult = {
      id: 'group-nodate',
      files: [],
      startDate: null,
      endDate: null,
      isNoDateGroup: true,
    }
    expect(suggestGroupName(group)).toBe('Sem data')
  })
})
