// src/middleware/uploadRateLimiter.ts
import { Response, NextFunction } from 'express'
import { redis } from '../utils/redis'
import { AuthRequest } from './auth'
import { getEffectiveUserLimits } from '../routes/admin/users'
import { getWindowStamp, getWindowTTLSeconds, formatPeriodLabel, WindowPeriod } from '../utils/windowHelper'

type LimitedCategory = 'image' | 'video' | 'other'

const TEXT_EXTS = new Set(['.txt', '.md', '.json', '.js', '.ts', '.py', '.cpp', '.c', '.h', '.html', '.css', '.csv'])

function classify(mimetype: string, ext: string): 'text' | LimitedCategory {
  if (TEXT_EXTS.has(ext)) return 'text'
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype.startsWith('video/')) return 'video'
  return 'other'
}

function formatWait(seconds: number): string {
  if (seconds >= 86400) {
    const days = Math.ceil(seconds / 86400)
    return `${days} day${days === 1 ? '' : 's'}`
  }
  if (seconds >= 3600) {
    const hrs = Math.ceil(seconds / 3600)
    return `${hrs} hour${hrs === 1 ? '' : 's'}`
  }
  const mins = Math.max(1, Math.ceil(seconds / 60))
  return `${mins} minute${mins === 1 ? '' : 's'}`
}

export const categoryUploadLimiter = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // No file yet (or route doesn't need one) — let the route handler's own
  // "No file uploaded" check handle it.
  if (!req.file) return next()

  const ext = ('.' + (req.file.originalname.split('.').pop() || '')).toLowerCase()
  const category = classify(req.file.mimetype, ext)

  // Text/code files: unlimited, skip straight through
  if (category === 'text') return next()

  const userId = req.userId!
  const userTier = (req as any).userTier ?? 'free'

  try {
    const effectiveLimits = await getEffectiveUserLimits(userId, userTier)
    const limitConfig = effectiveLimits.uploads[category]
    const max = limitConfig.max
    const period: WindowPeriod = limitConfig.period || (category === 'video' ? 'daily' : 'hourly')
    const label = limitConfig.label

    const now = new Date()
    const stamp = getWindowStamp(now, period)
    const key = `rl:upload:${category}:${userId}:${stamp}`
    const ttlSeconds = getWindowTTLSeconds(now, period)

    const current = await redis.incr(key)
    if (current === 1) await redis.expire(key, ttlSeconds)

    if (current > max) {
      const ttl = await redis.ttl(key)
      const retryAfter = ttl > 0 ? ttl : ttlSeconds
      const periodLabel = formatPeriodLabel(period)

      return res.status(429).json({
        error: `You've reached your ${label} upload limit (${max} per ${periodLabel}). Try again in about ${formatWait(retryAfter)}.`,
        retryAfter,
        category,
      })
    }

    return next()
  } catch (err) {
    // Redis hiccup shouldn't block uploads entirely — fail open
    console.error('[categoryUploadLimiter] Redis/Limits error, failing open:', err)
    return next()
  }
}