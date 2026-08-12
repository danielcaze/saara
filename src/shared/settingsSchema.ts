import { z } from 'zod'

export const settingsSchema = z.object({
  thresholdHours: z
    .number()
    .positive()
    .max(24 * 30)
})

export type Settings = z.infer<typeof settingsSchema>
