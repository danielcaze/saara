import { z } from 'zod'

const thresholdHoursSchema = z
  .number({ error: 'Enter a number.' })
  .positive('The interval must be greater than zero.')
  .max(24 * 30, 'The maximum interval is 720 hours (30 days).')

export function validateThresholdHours(
  value: number
): { ok: true } | { ok: false; message: string } {
  const result = thresholdHoursSchema.safeParse(value)
  if (result.success) return { ok: true }
  return { ok: false, message: result.error.issues[0]?.message ?? 'Invalid value.' }
}
