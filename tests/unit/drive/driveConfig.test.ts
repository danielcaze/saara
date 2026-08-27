import { describe, it, expect } from 'vitest'
import { getDriveOAuthConfig } from '../../../src/main/drive/driveConfig'

describe('getDriveOAuthConfig', () => {
  it('returns null when both env vars are missing', () => {
    expect(getDriveOAuthConfig({})).toBeNull()
  })

  it('returns null when only the client ID is set', () => {
    expect(getDriveOAuthConfig({ clientId: 'abc' })).toBeNull()
  })

  it('returns null when only the client secret is set', () => {
    expect(getDriveOAuthConfig({ clientSecret: 'xyz' })).toBeNull()
  })

  it('returns the config when both are set', () => {
    expect(getDriveOAuthConfig({ clientId: 'abc', clientSecret: 'xyz' })).toEqual({
      clientId: 'abc',
      clientSecret: 'xyz'
    })
  })
})
