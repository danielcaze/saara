import { ExifTool } from 'exiftool-vendored'

export const exiftool = new ExifTool({ maxProcs: 2 })

export async function shutdownExiftool(): Promise<void> {
  await exiftool.end()
}
