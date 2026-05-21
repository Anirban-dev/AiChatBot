import { createRateLimiter } from '../middleware/rateLimiter'

/** Light: UI interactions, chat switches — 60 req/min per user */
export const vgenLimiter = createRateLimiter({
  keyPrefix : 'chat_switch',
  windowSec : 60,
  max       : 60,
  keyFn     : (req) => (req as any).user?.id ?? req.ip,
})

/** Medium-high: general DB-backed generation — 40 req/min per user */
export const genLimiter = createRateLimiter({
  keyPrefix : 'gen_db_calls',
  windowSec : 60,
  max       : 40,
  keyFn     : (req) => (req as any).user?.id ?? req.ip,
})

/** Medium: standard DB calls — 20 req/min per user */
export const midLimiter = createRateLimiter({
  keyPrefix : 'db_calls',
  windowSec : 60,
  max       : 20,
  keyFn     : (req) => (req as any).user?.id ?? req.ip,
})

/** Strict: AI/LLM calls — 10 req/min per user */
export const strictLimiter = createRateLimiter({
  keyPrefix : 'ai_calls',
  windowSec : 60,
  max       : 10,
  keyFn     : (req) => (req as any).user?.id ?? req.ip,
})

/** Uploads: 20 per day per user */
export const uploadLimiter = createRateLimiter({
  keyPrefix : 'upload',
  windowSec : 60 * 60 * 24,
  max       : 20,
  keyFn     : (req) => (req as any).user?.id ?? req.ip,
})

// ── Google Login Rate Limiter ──────────────────────────────────────────
export const googleLoginLimiter = createRateLimiter({
  keyPrefix : 'google_login',
  windowSec : 15 * 60,
  max       : 10,
  message   : 'Too many login attempts. Try again later.',
  // IP-based is correct here — user isn't authenticated yet
})

// ── Refresh Token Rate Limiter ─────────────────────────────────────────
export const refreshLimiter = createRateLimiter({
  keyPrefix : 'refresh',
  windowSec : 15 * 60,
  max       : 30,
  // Per-token tail slice, falls back to IP if body is missing
  keyFn     : (req) => req.body?.refreshToken?.slice(-16) ?? req.ip,
})