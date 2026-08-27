import { z } from 'zod'

export const settingsSchema = z.object({
  thresholdHours: z
    .number()
    .positive()
    .max(24 * 30),
  prefixCopiedFileNames: z.boolean().default(false)
})

export type Settings = z.infer<typeof settingsSchema>
