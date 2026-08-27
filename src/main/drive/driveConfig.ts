export interface DriveOAuthConfig {
  clientId: string
  clientSecret: string
}

interface DriveOAuthEnv {
  clientId?: string
  clientSecret?: string
}

// import.meta.env.MAIN_VITE_* is statically replaced by electron-vite at
// build time (see electron.vite.config.ts). A plain process.env read here
// would only ever see the CI build process's environment, not the packaged
// binary's - end users never have these secrets set on their machine, so
// the value has to be baked into the bundle instead of read at runtime.
export function getDriveOAuthConfig(
  env: DriveOAuthEnv = {
    clientId: import.meta.env.MAIN_VITE_GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: import.meta.env.MAIN_VITE_GOOGLE_DRIVE_CLIENT_SECRET
  }
): DriveOAuthConfig | null {
  const { clientId, clientSecret } = env
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}
