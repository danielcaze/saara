import { describe, it, expect } from 'vitest'
import { validateThresholdHours } from '../../../src/shared/schemas'

describe('validateThresholdHours', () => {
  it('accepts a normal positive value', () => {
    expect(validateThresholdHours(24)).toEqual({ ok: true })
  })

  it('rejects zero', () => {
    expect(validateThresholdHours(0).ok).toBe(false)
  })

  it('rejects negative values', () => {
    expect(validateThresholdHours(-5).ok).toBe(false)
  })

  it('rejects values above the 720h (30 day) cap', () => {
    expect(validateThresholdHours(721).ok).toBe(false)
  })

  it('accepts the cap value itself', () => {
    expect(validateThresholdHours(720)).toEqual({ ok: true })
  })

  it('returns an English error message on failure', () => {
    const result = validateThresholdHours(0)
    if (result.ok) throw new Error('expected failure')
    expect(result.message).toMatch(/greater than zero/)
  })
})
