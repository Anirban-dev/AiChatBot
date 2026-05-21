import { rateLimit, Options } from 'express-rate-limit'
import { RedisStore }          from 'rate-limit-redis'
import { Request }             from 'express'
import { redis }               from '../utils/redis'

interface RateLimiterOptions {
  keyPrefix : string
  windowSec : number
  max       : number
  message?  : string
  keyFn?    : (req: Request) => string
}

export const createRateLimiter = ({
  keyPrefix,
  windowSec,
  max,
  message,
  keyFn,
}: RateLimiterOptions) =>
  rateLimit({
    windowMs : windowSec * 1000,
    max,

    // Atomic increment via the library's Lua script — no split-command race
    store: new RedisStore({
      // rate-limit-redis expects the raw send-command interface
      sendCommand: (...args: string[]) => (redis as any).sendCommand(args),
      prefix: `rl:${keyPrefix}:`,
    }),

    // Custom key (user id, token slice, email…) or fall back to IP
    keyGenerator: keyFn ?? ((req) => req.ip ?? 'unknown'),

    // Standard headers: RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
    standardHeaders: 'draft-7',
    legacyHeaders  : false,

    message: { error: message ?? 'Too many requests. Please slow down.' },

    // ✅ Fail open: if Redis is down, let the request through
    // rather than crashing your whole API
    skip: (_req, _res) => false,
    handler: (req, res, _next, options) => {
      res.status(options.statusCode).json({
        error     : typeof options.message === 'object'
          ? (options.message as any).error
          : options.message,
        retryAfter: Math.ceil(options.windowMs / 1000),
      })
    },
  } satisfies Partial<Options>)