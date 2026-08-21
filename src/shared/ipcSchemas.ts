import { z } from 'zod'
import { settingsSchema } from './settingsSchema'

export const selectFolderRequestSchema = z.object({
  role: z.enum(['source', 'destination'])
})

export const analyzeRequestSchema = z.object({
  sourcePath: z.string().min(1),
  thresholdMs: z.number().positive()
})

export const reclusterRequestSchema = z.object({
  thresholdMs: z.number().positive()
})

export const getThumbnailRequestSchema = z.object({
  path: z.string().min(1),
  mediaType: z.enum(['photo', 'raw', 'video', 'unsupported'])
})

export const getLightboxPreviewRequestSchema = getThumbnailRequestSchema

const copyPlanFileSchema = z.object({
  sourcePath: z.string().min(1),
  fileName: z.string().min(1)
})

const copyPlanGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  files: z.array(copyPlanFileSchema)
})

export const copyStartRequestSchema = z.object({
  destinationRoot: z.string().min(1),
  groups: z.array(copyPlanGroupSchema)
})

export const openPathRequestSchema = z.object({
  path: z.string().min(1)
})

export const settingsSetRequestSchema = settingsSchema

export const driveUploadStartRequestSchema = z.object({
  groups: z.array(copyPlanGroupSchema)
})

export const driveShareGroupRequestSchema = z.object({
  folderId: z.string().min(1)
})
