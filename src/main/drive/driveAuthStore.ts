import fs from 'node:fs/promises'
import path from 'node:path'

export interface TokenCipher {
  encrypt(plainText: string): Buffer
  decrypt(encrypted: Buffer): string
}

export interface DriveTokens {
  refreshToken: string
  email: string
}

function tokenFilePath(userDataDir: string): string {
  return path.join(userDataDir, 'driveAuth.json')
}

function isDriveTokens(value: unknown): value is DriveTokens {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as DriveTokens).refreshToken === 'string' &&
    typeof (value as DriveTokens).email === 'string'
  )
}

export async function getDriveTokens(
  userDataDir: string,
  cipher: TokenCipher
): Promise<DriveTokens | null> {
  try {
    const encrypted = await fs.readFile(tokenFilePath(userDataDir))
    const decrypted = cipher.decrypt(encrypted)
    const parsed: unknown = JSON.parse(decrypted)
    return isDriveTokens(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function setDriveTokens(
  userDataDir: string,
  cipher: TokenCipher,
  tokens: DriveTokens
): Promise<void> {
  await fs.mkdir(userDataDir, { recursive: true })
  const encrypted = cipher.encrypt(JSON.stringify(tokens))
  await fs.writeFile(tokenFilePath(userDataDir), encrypted)
}

export async function clearDriveTokens(userDataDir: string): Promise<void> {
  await fs.rm(tokenFilePath(userDataDir), { force: true })
}
