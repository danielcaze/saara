export type MediaType = 'photo' | 'raw' | 'video' | 'unsupported'

export interface FileMeta {
  path: string
  fileName: string
  mediaType: MediaType
  timestamp: string | null // ISO string; null = no date found
  timestampSource: 'DateTimeOriginal' | 'CreateDate' | 'MediaCreateDate' | null
  metadataError: string | null
}

export interface PhotoGroup {
  id: string
  name: string
  files: FileMeta[]
  startDate: string | null // ISO string
  endDate: string | null
  isNoDateGroup: boolean
}

export interface AnalyzeProgress {
  phase: 'scanning' | 'reading-metadata' | 'clustering'
  current: number
  total: number
}

export interface CopyPlanGroup {
  id: string
  name: string
  files: { sourcePath: string; fileName: string }[]
}

export interface LocalOrderManifestGroup {
  id: string
  name: string
  groupOrder: number
  folderName: string
  files: string[]
}

export interface CopyProgressEvent {
  groupId: string
  groupName: string
  fileName: string
  filesCopiedSoFar: number
  totalFiles: number
  status?: 'uploading' | 'paused' | 'done'
}

export interface DriveStatus {
  connected: boolean
  email: string | null
}

export interface CopySummary {
  totalFiles: number
  copiedFiles: number
  skippedFiles: number
  conflicts: { originalName: string; resolvedName: string }[]
  errors: { path: string; message: string }[]
  driveGroups?: {
    groupId: string
    groupName: string
    folderId: string
    webViewLink: string | null
  }[]
}
