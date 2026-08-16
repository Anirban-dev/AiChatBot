// src/utils/ratelimitHelper.ts
import { Request, Response, NextFunction } from 'express'
import { createRateLimiter } from '../middleware/rateLimiter'

// ─── Key extractor ────────────────────────────────────────────────────────────
// authMiddleware sets req.userId directly on the request object.
// We must cast to any to access it because express-rate-limit's keyGenerator
// receives a plain Request, not our AuthRequest extension.
// Falls back to IP for unauthenticated routes (login, google-login, etc.)
const userOrIp = (req: any): string => req.userId ?? req.ip

// ─── Tier multipliers ─────────────────────────────────────────────────────────
// Free is the base tier (multiplier 1). Custom tiers fall back to free rate limiter.
const TIER_MULTIPLIERS: Record<string, number> = {
  free: 1,
}

type ExpressMiddleware = (req: Request, res: Response, next: NextFunction) => void

/**
 * Creates a tier-aware rate limiter that dispatches to pre-built
 * express-rate-limit instances based on req.userTier.
 *
 * Falls back to the 'free' limiter for unauthenticated requests or
 * dynamic tiers without a custom multiplier.
 */
function createTieredLimiter(opts: {
  keyPrefix: string
  windowSec: number
  max: number          // base (free-tier) max
  message?: string
  keyFn?: (req: any) => string
}): ExpressMiddleware {
  const { keyPrefix, windowSec, max, message, keyFn } = opts

  const instances: Record<string, ExpressMiddleware> = {}

  for (const [tier, multiplier] of Object.entries(TIER_MULTIPLIERS)) {
    instances[tier] = createRateLimiter({
      keyPrefix:  `${keyPrefix}:${tier}`,
      windowSec,
      max:        Math.ceil(max * multiplier),
      message,
      keyFn:      keyFn ?? userOrIp,
    })
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const tier: string = (req as any).userTier ?? 'free'
    const limiter = instances[tier] ?? instances.free
    return limiter(req, res, next)
  }
}

// ─── Route-level tiered limiters ──────────────────────────────────────────────
//
//  Tier     │  vgen   │  gen   │  mid   │  strict
//  ─────────┼─────────┼────────┼────────┼────────
//  free     │  60/min │ 40/min │ 20/min │ 10/min
//  premium  │ 120/min │ 80/min │ 40/min │ 20/min
//  enterprise│ 300/min│200/min │100/min │ 60/min  (5× base)
//

/** Light: UI interactions, chat switches — 60/120/300 req/min by tier */
export const vgenLimiter = createTieredLimiter({
  keyPrefix: 'chat_switch',
  windowSec: 60,
  max:       60,
  keyFn:     userOrIp,
})

/** Medium-high: general DB-backed reads — 40/80/200 req/min by tier */
export const genLimiter = createTieredLimiter({
  keyPrefix: 'gen_db_calls',
  windowSec: 60,
  max:       40,
  keyFn:     userOrIp,
})

/** Medium: standard DB mutation calls — 20/40/100 req/min by tier */
export const midLimiter = createTieredLimiter({
  keyPrefix: 'db_calls',
  windowSec: 60,
  max:       20,
  keyFn:     userOrIp,
})

/** Strict: chat/message creation — 10/20/60 req/min by tier */
export const strictLimiter = createTieredLimiter({
  keyPrefix: 'ai_calls',
  windowSec: 60,
  max:       10,
  keyFn:     userOrIp,
})

// ─── Non-tiered auth limiters (IP-based, no auth context yet) ─────────────────

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