export type DriveCallbackResult = { ok: true; code: string } | { ok: false; error: string }

export function parseDriveCallback(requestUrl: string): DriveCallbackResult {
  const url = new URL(requestUrl, 'http://127.0.0.1')
  const error = url.searchParams.get('error')
  if (error) return { ok: false, error }
  const code = url.searchParams.get('code')
  if (!code) return { ok: false, error: 'missing_code' }
  return { ok: true, code }
}
