
import { createRateLimiter } from '../middleware/rateLimiter'

// Helper functions
export const vgenLimiter = createRateLimiter({
  keyPrefix: 'chat_switch',
  windowSec: 60,
  max: 60,
  keyFn: (req) => (req as any).user?.id ?? req.ip
})

export const genLimiter = createRateLimiter({
  keyPrefix: 'gen_db_calls',
  windowSec: 60,
  max: 40,
  keyFn: (req) => (req as any).user?.id ?? req.ip
})

export const midLimiter = createRateLimiter({
  keyPrefix: 'db_calls',
  windowSec: 60,
  max: 20,
  keyFn: (req) => (req as any).user?.id ?? req.ip
})

export const strictLimiter = createRateLimiter({
  keyPrefix: 'ai_calls',
  windowSec: 60,
  max: 10,
  keyFn: (req) => (req as any).user?.id ?? req.ip
})


export const uploadLimiter = createRateLimiter({
  keyPrefix: 'upload',
  windowSec: 60 * 60 * 24,
  max: 20,
  keyFn: (req: { ip: any }) => (req as any).user?.id ?? req.ip
})