export interface DriveOAuthConfig {
  clientId: string
  clientSecret: string
}

export function getDriveOAuthConfig(env: NodeJS.ProcessEnv = process.env): DriveOAuthConfig | null {
  const clientId = env.GOOGLE_DRIVE_CLIENT_ID
  const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}
