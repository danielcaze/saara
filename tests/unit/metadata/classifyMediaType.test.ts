import { describe, it, expect } from 'vitest'
import { classifyMediaType } from '../../../src/main/metadata/classifyMediaType'

describe('classifyMediaType', () => {
  it('classifies common photo extensions', () => {
    expect(classifyMediaType('a.jpg')).toBe('photo')
    expect(classifyMediaType('a.JPEG')).toBe('photo')
    expect(classifyMediaType('a.png')).toBe('photo')
  })

  it('classifies common RAW extensions', () => {
    expect(classifyMediaType('a.CR2')).toBe('raw')
    expect(classifyMediaType('a.nef')).toBe('raw')
    expect(classifyMediaType('a.ARW')).toBe('raw')
    expect(classifyMediaType('a.dng')).toBe('raw')
  })

  it('classifies common video extensions', () => {
    expect(classifyMediaType('a.mp4')).toBe('video')
    expect(classifyMediaType('a.MOV')).toBe('video')
  })

  it('classifies unknown extensions as unsupported', () => {
    expect(classifyMediaType('a.txt')).toBe('unsupported')
    expect(classifyMediaType('a')).toBe('unsupported')
  })
})
