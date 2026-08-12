import fs from 'node:fs/promises'
import path from 'node:path'
import { settingsSchema, type Settings } from '../../shared/settingsSchema'

const DEFAULT_SETTINGS: Settings = { thresholdHours: 24 }

function settingsFilePath(userDataDir: string): string {
  return path.join(userDataDir, 'settings.json')
}

export async function getSettings(userDataDir: string): Promise<Settings> {
  try {
    const raw = await fs.readFile(settingsFilePath(userDataDir), 'utf-8')
    const parsed = settingsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function setSettings(userDataDir: string, settings: Settings): Promise<void> {
  const validated = settingsSchema.parse(settings)
  await fs.mkdir(userDataDir, { recursive: true })
  await fs.writeFile(settingsFilePath(userDataDir), JSON.stringify(validated, null, 2), 'utf-8')
}
