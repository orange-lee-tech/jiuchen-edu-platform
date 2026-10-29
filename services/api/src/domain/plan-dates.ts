import { z } from 'zod'

/** A calendar date, never a timezone-dependent timestamp or a free-text target. */
export const planDueDateSchema = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'invalid_calendar_date')

export function upcomingTaskWindow(now = new Date()) {
  const from = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const to = new Date(Date.parse(`${from}T00:00:00.000Z`) + 2 * 86400000).toISOString().slice(0, 10)
  return { from, to }
}
