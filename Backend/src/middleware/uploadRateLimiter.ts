// src/middleware/uploadRateLimiter.ts
import { Response, NextFunction } from 'express'
import { redis } from '../utils/redis'
import { AuthRequest } from './auth'

type LimitedCategory = 'image' | 'video' | 'other'

const TEXT_EXTS = new Set(['.txt', '.md', '.json', '.js', '.ts', '.py', '.cpp', '.c', '.h', '.html', '.css', '.csv'])

function classify(mimetype: string, ext: string): 'text' | LimitedCategory {
  if (TEXT_EXTS.has(ext)) return 'text'
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype.startsWith('video/')) return 'video'
  return 'other'
}

// max uploads, window length, and the label used in the user-facing message
const LIMITS: Record<LimitedCategory, { max: number; windowSec: number; label: string }> = {
  image: { max: 20, windowSec: 60 * 60,       label: 'image' },
  video: { max: 2,  windowSec: 60 * 60 * 24,  label: 'video' },
  other: { max: 5,  windowSec: 60 * 60,       label: 'file' },
}

function formatWait(seconds: number): string {
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

  const { max, windowSec, label } = LIMITS[category]
  const key = `rl:upload:${category}:${req.userId}`

  try {
    const current = await redis.incr(key)
    if (current === 1) await redis.expire(key, windowSec)

    if (current > max) {
      const ttl = await redis.ttl(key)
      const retryAfter = ttl > 0 ? ttl : windowSec
      const period = windowSec >= 86400 ? 'day' : 'hour'

      return res.status(429).json({
        error: `You've reached your ${label} upload limit (${max} per ${period}). Try again in about ${formatWait(retryAfter)}.`,
        retryAfter,
        category,
      })
    }

    return next()
  } catch (err) {
    // Redis hiccup shouldn't block uploads entirely — fail open
    console.error('[categoryUploadLimiter] Redis error, failing open:', err)
    return next()
  }
}