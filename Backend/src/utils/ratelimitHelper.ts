// src/utils/ratelimitHelper.ts
import { createRateLimiter } from '../middleware/rateLimiter'

// ─── Key extractor ────────────────────────────────────────────────────────────
// authMiddleware sets req.userId directly on the request object.
// We must cast to any to access it because express-rate-limit's keyGenerator
// receives a plain Request, not our AuthRequest extension.
// Falls back to IP for unauthenticated routes (login, google-login, etc.)
const userOrIp = (req: any): string => req.userId ?? req.ip

/** Light: UI interactions, chat switches — 60 req/min per user */
export const vgenLimiter = createRateLimiter({
  keyPrefix: 'chat_switch',
  windowSec: 60,
  max:       60,
  keyFn:     userOrIp,
})

/** Medium-high: general DB-backed reads — 40 req/min per user */
export const genLimiter = createRateLimiter({
  keyPrefix: 'gen_db_calls',
  windowSec: 60,
  max:       40,
  keyFn:     userOrIp,
})

/** Medium: standard DB mutation calls — 20 req/min per user */
export const midLimiter = createRateLimiter({
  keyPrefix: 'db_calls',
  windowSec: 60,
  max:       20,
  keyFn:     userOrIp,
})

/** Strict: chat creation — 10 req/min per user */
export const strictLimiter = createRateLimiter({
  keyPrefix: 'ai_calls',
  windowSec: 60,
  max:       10,
  keyFn:     userOrIp,
})

/** Google Login: IP-based, user is not authenticated yet */
export const googleLoginLimiter = createRateLimiter({
  keyPrefix: 'google_login',
  windowSec: 15 * 60,
  max:       10,
  message:   'Too many login attempts. Try again later.',
  // No keyFn → falls back to ipKeyGenerator inside createRateLimiter
})

/** Refresh Token: keyed on the tail of the token, falls back to IP */
export const refreshLimiter = createRateLimiter({
  keyPrefix: 'refresh',
  windowSec: 15 * 60,
  max:       30,
  keyFn:     (req: any) => req.body?.refreshToken?.slice(-16) ?? req.ip,
})