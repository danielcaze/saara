import { z } from 'zod'

export const thresholdHoursSchema = z
  .number({ invalid_type_error: 'Informe um número.' })
  .positive('O intervalo deve ser maior que zero.')
  .max(24 * 30, 'O intervalo máximo é 720 horas (30 dias).')

export function validateThresholdHours(value: number): { ok: true } | { ok: false; message: string } {
  const result = thresholdHoursSchema.safeParse(value)
  if (result.success) return { ok: true }
  return { ok: false, message: result.error.issues[0]?.message ?? 'Valor inválido.' }
}
