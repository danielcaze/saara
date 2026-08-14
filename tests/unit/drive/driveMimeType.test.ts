import { describe, it, expect } from 'vitest'
import { mimeTypeForFile } from '../../../src/main/drive/driveMimeType'

describe('mimeTypeForFile', () => {
  it('maps common photo extensions', () => {
    expect(mimeTypeForFile('IMG_001.JPG')).toBe('image/jpeg')
    expect(mimeTypeForFile('photo.jpeg')).toBe('image/jpeg')
    expect(mimeTypeForFile('photo.png')).toBe('image/png')
    expect(mimeTypeForFile('photo.heic')).toBe('image/heic')
  })

  it('maps common video extensions', () => {
    expect(mimeTypeForFile('clip.MP4')).toBe('video/mp4')
    expect(mimeTypeForFile('clip.mov')).toBe('video/quicktime')
  })

  it('falls back to application/octet-stream for unknown extensions', () => {
    expect(mimeTypeForFile('raw.cr2')).toBe('application/octet-stream')
  })

  it('falls back to application/octet-stream when there is no extension', () => {
    expect(mimeTypeForFile('README')).toBe('application/octet-stream')
  })
})
