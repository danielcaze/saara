import { describe, it, expect, afterAll } from 'vitest'
import path from 'node:path'
import { extractFileMetadata } from '../../../src/main/metadata/extractMetadata'
import { shutdownExiftool } from '../../../src/main/metadata/exiftoolClient'

const fixture = (name: string): string => path.join(__dirname, '../../fixtures', name)

describe('extractFileMetadata', () => {
  afterAll(async () => {
    await shutdownExiftool()
  })

  it('extracts DateTimeOriginal from a JPEG', async () => {
    const result = await extractFileMetadata(fixture('sample-photo.jpg'), 'photo')
    expect(result.timestamp).not.toBeNull()
    expect(result.timestampSource).toBe('DateTimeOriginal')
    expect(result.error).toBeUndefined()
  })

  it('extracts a creation date from a video', async () => {
    const result = await extractFileMetadata(fixture('sample-video.avi'), 'video')
    expect(result.timestamp).not.toBeNull()
    expect(['DateTimeOriginal', 'CreateDate', 'MediaCreateDate']).toContain(result.timestampSource)
  })

  it('returns null timestamp for a file with no date tags, without throwing', async () => {
    const result = await extractFileMetadata(fixture('sample-no-date.jpg'), 'photo')
    expect(result.timestamp).toBeNull()
    expect(result.timestampSource).toBeNull()
  })

  it('returns an error for a corrupt file, without throwing', async () => {
    const result = await extractFileMetadata(fixture('corrupt.jpg'), 'photo')
    expect(result.timestamp).toBeNull()
    expect(result.error).toBeDefined()
  })
})
