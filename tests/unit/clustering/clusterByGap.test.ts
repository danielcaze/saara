import { describe, it, expect } from 'vitest'
import { clusterByGap, type TimestampedFile } from '../../../src/shared/clustering/clusterByGap'

const DAY = 24 * 60 * 60 * 1000
const d = (iso: string): Date => new Date(iso)

describe('clusterByGap', () => {
  it('returns empty array for empty input', () => {
    expect(clusterByGap([], DAY)).toEqual([])
  })

  it('puts a single dated file in its own group', () => {
    const files: TimestampedFile[] = [{ path: 'a.jpg', timestamp: d('2026-08-01T10:00:00Z') }]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(1)
    expect(groups[0].files).toHaveLength(1)
    expect(groups[0].isNoDateGroup).toBe(false)
  })

  it('puts a single undated file in a no-date group', () => {
    const files: TimestampedFile[] = [{ path: 'a.jpg', timestamp: null }]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(1)
    expect(groups[0].isNoDateGroup).toBe(true)
    expect(groups[0].files).toHaveLength(1)
  })

  it('keeps files in the same group when gap exactly equals the threshold', () => {
    const t0 = d('2026-08-01T00:00:00Z')
    const t1 = new Date(t0.getTime() + DAY) // exactly 24h later
    const files: TimestampedFile[] = [
      { path: 'a.jpg', timestamp: t0 },
      { path: 'b.jpg', timestamp: t1 }
    ]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(1)
    expect(groups[0].files.map((f) => f.path)).toEqual(['a.jpg', 'b.jpg'])
  })

  it('starts a new group when gap exceeds the threshold by 1ms', () => {
    const t0 = d('2026-08-01T00:00:00Z')
    const t1 = new Date(t0.getTime() + DAY + 1)
    const files: TimestampedFile[] = [
      { path: 'a.jpg', timestamp: t0 },
      { path: 'b.jpg', timestamp: t1 }
    ]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(2)
    expect(groups[0].files.map((f) => f.path)).toEqual(['a.jpg'])
    expect(groups[1].files.map((f) => f.path)).toEqual(['b.jpg'])
  })

  it('sorts out-of-order input chronologically before clustering', () => {
    const t0 = d('2026-08-01T10:00:00Z')
    const t1 = d('2026-08-01T11:00:00Z')
    const t2 = d('2026-08-01T12:00:00Z')
    const files: TimestampedFile[] = [
      { path: 'c.jpg', timestamp: t2 },
      { path: 'a.jpg', timestamp: t0 },
      { path: 'b.jpg', timestamp: t1 }
    ]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(1)
    expect(groups[0].files.map((f) => f.path)).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
  })

  it('groups identical timestamps together (RAW+JPEG same shutter click)', () => {
    const t0 = d('2026-08-01T10:00:00Z')
    const files: TimestampedFile[] = [
      { path: 'IMG_0001.CR2', timestamp: t0 },
      { path: 'IMG_0001.JPG', timestamp: t0 }
    ]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(1)
    expect(groups[0].files).toHaveLength(2)
  })

  it('keeps undated files out of gap math and puts them in a trailing group', () => {
    const t0 = d('2026-08-01T10:00:00Z')
    const t1 = new Date(t0.getTime() + DAY + 1) // forces a new dated group
    const files: TimestampedFile[] = [
      { path: 'a.jpg', timestamp: t0 },
      { path: 'nodate1.jpg', timestamp: null },
      { path: 'b.jpg', timestamp: t1 },
      { path: 'nodate2.jpg', timestamp: null }
    ]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(3)
    expect(groups[0].isNoDateGroup).toBe(false)
    expect(groups[0].files.map((f) => f.path)).toEqual(['a.jpg'])
    expect(groups[1].isNoDateGroup).toBe(false)
    expect(groups[1].files.map((f) => f.path)).toEqual(['b.jpg'])
    expect(groups[2].isNoDateGroup).toBe(true)
    expect(groups[2].files.map((f) => f.path).sort()).toEqual(['nodate1.jpg', 'nodate2.jpg'])
  })

  it('handles all-undated input as a single no-date group, no crash', () => {
    const files: TimestampedFile[] = [
      { path: 'b.jpg', timestamp: null },
      { path: 'a.jpg', timestamp: null }
    ]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(1)
    expect(groups[0].isNoDateGroup).toBe(true)
    expect(groups[0].files.map((f) => f.path)).toEqual(['a.jpg', 'b.jpg']) // sorted by path
  })

  it('is deterministic for identical input', () => {
    const files: TimestampedFile[] = [
      { path: 'a.jpg', timestamp: d('2026-08-01T10:00:00Z') },
      { path: 'b.jpg', timestamp: d('2026-08-03T10:00:00Z') }
    ]
    const run1 = clusterByGap(files, DAY)
    const run2 = clusterByGap(files, DAY)
    expect(run1.map((g) => g.id)).toEqual(run2.map((g) => g.id))
  })

  it('treats an invalid Date the same as a missing timestamp', () => {
    const t0 = d('2026-08-01T10:00:00Z')
    const invalidDate = new Date('not-a-real-date')
    const files: TimestampedFile[] = [
      { path: 'a.jpg', timestamp: t0 },
      { path: 'corrupt.jpg', timestamp: invalidDate }
    ]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(2)
    expect(groups[0].isNoDateGroup).toBe(false)
    expect(groups[0].files.map((f) => f.path)).toEqual(['a.jpg'])
    expect(groups[1].isNoDateGroup).toBe(true)
    expect(groups[1].files.map((f) => f.path)).toEqual(['corrupt.jpg'])
  })
})
