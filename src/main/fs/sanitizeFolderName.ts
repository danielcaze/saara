export function sanitizeFolderName(name: string): string {
  const replaced = name.replace(/[\\/:*?"<>|]/g, ' ')
  const collapsed = replaced.replace(/\s+/g, ' ').trim()
  return collapsed.replace(/[. ]+$/, '')
}
