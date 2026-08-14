import http from 'node:http'
import { shell } from 'electron'
import { OAuth2Client } from 'google-auth-library'
import { parseDriveCallback } from './driveCallback'
import type { DriveOAuthConfig } from './driveConfig'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'

export interface DriveConnectResult {
  refreshToken: string
  email: string
}

async function fetchConnectedEmail(oauth2Client: OAuth2Client): Promise<string> {
  const { token } = await oauth2Client.getAccessToken()
  if (!token) throw new Error('Failed to obtain a Google access token.')
  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Failed to fetch the connected Google account (${res.status}).`)
  const data = (await res.json()) as { user?: { emailAddress?: string } }
  const email = data.user?.emailAddress
  if (!email) throw new Error('Could not determine the connected Google account.')
  return email
}

export async function connectDrive(config: DriveOAuthConfig): Promise<DriveConnectResult> {
  const server = http.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Failed to start the local Google sign-in listener.')
  }
  const redirectUri = `http://127.0.0.1:${address.port}/callback`
  const oauth2Client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri
  })

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [SCOPE]
  })

  const codePromise = new Promise<string>((resolve, reject) => {
    server.on('request', (req, res) => {
      const result = parseDriveCallback(req.url ?? '')
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      if (result.ok) {
        res.end('Saara is connected to Google Drive. You can close this tab.')
        resolve(result.code)
      } else {
        res.end(`Google Drive connection failed (${result.error}). You can close this tab.`)
        reject(new Error(`Google sign-in failed: ${result.error}`))
      }
    })
  })

  await shell.openExternal(authUrl)

  let code: string
  try {
    code = await codePromise
  } finally {
    server.close()
  }

  const { tokens } = await oauth2Client.getToken(code)
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a long-lived connection. Disconnect and try connecting again.'
    )
  }
  oauth2Client.setCredentials(tokens)

  const email = await fetchConnectedEmail(oauth2Client)
  return { refreshToken: tokens.refresh_token, email }
}

export function createAuthorizedClient(
  config: DriveOAuthConfig,
  refreshToken: string
): OAuth2Client {
  const client = new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret })
  client.setCredentials({ refresh_token: refreshToken })
  return client
}
