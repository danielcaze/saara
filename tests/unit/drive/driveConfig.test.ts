import { describe, it, expect } from 'vitest'
import { getDriveOAuthConfig } from '../../../src/main/drive/driveConfig'

describe('getDriveOAuthConfig', () => {
  it('returns null when both env vars are missing', () => {
    expect(getDriveOAuthConfig({})).toBeNull()
  })

  it('returns null when only the client ID is set', () => {
    expect(getDriveOAuthConfig({ GOOGLE_DRIVE_CLIENT_ID: 'abc' })).toBeNull()
  })

  it('returns null when only the client secret is set', () => {
    expect(getDriveOAuthConfig({ GOOGLE_DRIVE_CLIENT_SECRET: 'xyz' })).toBeNull()
  })

  it('returns the config when both are set', () => {
    expect(
      getDriveOAuthConfig({ GOOGLE_DRIVE_CLIENT_ID: 'abc', GOOGLE_DRIVE_CLIENT_SECRET: 'xyz' })
    ).toEqual({ clientId: 'abc', clientSecret: 'xyz' })
  })
})
