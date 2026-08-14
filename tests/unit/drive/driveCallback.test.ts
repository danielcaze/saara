import { describe, it, expect } from 'vitest'
import { parseDriveCallback } from '../../../src/main/drive/driveCallback'

describe('parseDriveCallback', () => {
  it('extracts the code from a successful callback', () => {
    expect(parseDriveCallback('/callback?code=abc123&scope=drive.file')).toEqual({
      ok: true,
      code: 'abc123'
    })
  })

  it('surfaces an error param (e.g. user denied consent)', () => {
    expect(parseDriveCallback('/callback?error=access_denied')).toEqual({
      ok: false,
      error: 'access_denied'
    })
  })

  it('reports missing_code when neither code nor error is present', () => {
    expect(parseDriveCallback('/callback')).toEqual({ ok: false, error: 'missing_code' })
  })

  it('ignores requests to other paths the same way (no path filtering here)', () => {
    expect(parseDriveCallback('/favicon.ico')).toEqual({ ok: false, error: 'missing_code' })
  })
})
