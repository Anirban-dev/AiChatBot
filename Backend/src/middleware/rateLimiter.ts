import { rateLimit, Options, ipKeyGenerator } from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import { Request, Response } from 'express'
import { redis } from '../utils/redis'

interface RateLimiterOptions {
  keyPrefix: string
  windowSec: number
  max: number
  message?: string
  keyFn?: (req: Request) => string
}

export const createRateLimiter = ({
  keyPrefix,
  windowSec,
  max,
  message,
  keyFn,
}: RateLimiterOptions) =>
  rateLimit({
    windowMs: windowSec * 1000,
    max,

    // Fix 1: Properly type the sendCommand function to match SendCommandFn
    store: new RedisStore({
      // @ts-expect-error - ioredis types can be overly strict with RedisReply
      sendCommand: (...args: [string, ...string[]]) => redis.call(...args),
      prefix: `rl:${keyPrefix}:`,
    }),

    // Fix 2: Properly handle the keyGenerator signature
    keyGenerator: (req: Request, res: Response): string => {
      if (keyFn) {
        return keyFn(req)
      }
      return (ipKeyGenerator as any)(req, res)
    },

    standardHeaders: 'draft-7',
    legacyHeaders: false,

    message: { error: message ?? 'Too many requests. Please slow down.' },

    handler: (req, res, _next, options) => {
      res.status(options.statusCode).json({
        error: typeof options.message === 'object'
          ? (options.message as any).error
          : options.message,
        retryAfter: Math.ceil(options.windowMs / 1000),
      })
    },
  } satisfies Partial<Options>)