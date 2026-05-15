// utils/rateLimiter.ts
import { Request, Response, NextFunction } from 'express'
import { redis } from '../utils/redis'

interface RateLimitOptions {
  windowSec: number
  max: number
  keyPrefix: string
  message?: string
  keyFn?: (req: Request) => string   // custom key — defaults to IP
}

export const createRateLimiter = ({ windowSec, max, keyPrefix, message, keyFn }: RateLimitOptions) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier = keyFn ? keyFn(req) : (req.ip ?? 'unknown')
    const key = `rl:${keyPrefix}:${identifier}`

    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, windowSec)

    // Set headers so frontend knows the limits
    res.setHeader('X-RateLimit-Limit', max)
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count))

    if (count > max) {
      const ttl = await redis.ttl(key)
      res.setHeader('Retry-After', ttl)
      return res.status(429).json({
        error: message ?? 'Too many requests. Please slow down.',
        retryAfter: ttl
      })
    }

    next()
  }
}