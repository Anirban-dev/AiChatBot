// src/utils/windowHelper.ts
export type WindowPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly'

/**
 * Returns a time-based stamp key for Redis keys based on period:
 * - hourly:  YYYY-MM-DD-HH
 * - daily:   YYYY-MM-DD
 * - weekly:  YYYY-Www (ISO week)
 * - monthly: YYYY-MM
 */
export function getWindowStamp(date: Date = new Date(), period: WindowPeriod = 'hourly'): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const h = String(date.getUTCHours()).padStart(2, '0')

  switch (period) {
    case 'hourly':
      return `${y}-${m}-${d}-${h}`
    case 'daily':
      return `${y}-${m}-${d}`
    case 'weekly': {
      // Calculate ISO week number
      const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
      const dayNr = (target.getUTCDay() + 6) % 7
      target.setUTCDate(target.getUTCDate() - dayNr + 3)
      const firstThursday = target.valueOf()
      target.setUTCMonth(0, 1)
      if (target.getUTCDay() !== 4) {
        target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7)
      }
      const weekNr = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
      return `${y}-W${String(weekNr).padStart(2, '0')}`
    }
    case 'monthly':
      return `${y}-${m}`
    default:
      return `${y}-${m}-${d}-${h}`
  }
}

/**
 * Returns remaining seconds until the end of the current window + padding (10 min).
 */
export function getWindowTTLSeconds(date: Date = new Date(), period: WindowPeriod = 'hourly'): number {
  const nowMs = date.getTime()

  let nextWindowDate: Date

  switch (period) {
    case 'hourly': {
      nextWindowDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours() + 1, 0, 0, 0))
      break
    }
    case 'daily': {
      nextWindowDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0))
      break
    }
    case 'weekly': {
      // Next Monday 00:00 UTC
      const day = date.getUTCDay()
      const daysUntilMonday = ((8 - day) % 7) || 7
      nextWindowDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + daysUntilMonday, 0, 0, 0, 0))
      break
    }
    case 'monthly': {
      nextWindowDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0))
      break
    }
    default: {
      nextWindowDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours() + 1, 0, 0, 0))
    }
  }

  const diffSec = Math.max(60, Math.ceil((nextWindowDate.getTime() - nowMs) / 1000))
  return diffSec + 600 // add 10 min buffer
}

export function formatPeriodLabel(period: WindowPeriod = 'hourly'): string {
  switch (period) {
    case 'hourly': return 'hr'
    case 'daily': return 'day'
    case 'weekly': return 'week'
    case 'monthly': return 'month'
  }
}
