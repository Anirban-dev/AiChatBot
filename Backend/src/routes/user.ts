// src/routes/user.ts
import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { User } from '../models/user'
import { getEffectiveUserLimits, getDetailedUserUsage } from '../routes/admin/users'
import { getWindowStamp } from '../utils/windowHelper'
import { redis } from '../utils/redis'
import { genLimiter } from '../utils/ratelimitHelper'

/**
 * Returns the exact Date when the current usage window for `period` ends (UTC).
 */
export function getWindowResetAt(date: Date = new Date(), period: string = 'hourly'): Date {
  switch (period) {
    case 'hourly':
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours() + 1, 0, 0, 0))
    case 'daily':
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0))
    case 'weekly': {
      const day = date.getUTCDay()
      const daysUntilMonday = ((8 - day) % 7) || 7
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + daysUntilMonday, 0, 0, 0, 0))
    }
    case 'monthly':
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0))
    default:
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours() + 1, 0, 0, 0))
  }
}

const router = Router()

router.get('/', authMiddleware, genLimiter, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
    const userTier = (req as any).userTier || 'free'

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' })
    }

    // Get effective limits for the user's tier
    const effectiveLimits = await getEffectiveUserLimits(userId, userTier)

    // Get detailed usage stats
    const usage = await getDetailedUserUsage(userId, userTier, effectiveLimits)

    // Get user basic info from DB
    const user = await User.findById(userId).select('name email tier role googleAuth')

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Calculate usage percentages for UI
    const calculatePercentage = (used: number, limit: number) => {
      if (limit <= 0) return 0
      return Math.min(Math.round((used / limit) * 100), 100)
    }

    const modelLimits = effectiveLimits.models
    const uploadLimits = effectiveLimits.uploads

    // Build model usage info with percentages
    const modelUsageInfo: Record<string, { used: number; limit: number; percentage: number }> = {}
    for (const [modelName, modelUsage] of Object.entries(usage.models)) {
      const limitConfig = modelLimits[modelName as keyof typeof modelLimits]
      if (limitConfig) {
        const limit = { rpm: limitConfig.rpm ?? 0, tpm: limitConfig.tpm ?? 0 }
        modelUsageInfo[modelName] = {
          used: modelUsage.rpmUsed + modelUsage.tpmUsed,
          limit: limit.rpm + limit.tpm,
          percentage: calculatePercentage(modelUsage.rpmUsed + modelUsage.tpmUsed, limit.rpm + limit.tpm),
        }
      }
    }

    // Build upload usage info with percentages
    const uploadUsageInfo: Record<string, { used: number; limit: number; percentage: number }> = {}
    for (const [cat, uploadUsage] of Object.entries(usage.uploads)) {
      const limitConfig = uploadLimits[cat as keyof typeof uploadLimits]
      if (limitConfig) {
        uploadUsageInfo[cat] = {
          used: uploadUsage.used,
          limit: limitConfig.max,
          percentage: calculatePercentage(uploadUsage.used, limitConfig.max),
        }
      }
    }

    // Get current window info
    const now = new Date()
    const hourlyStamp = getWindowStamp(now, 'hourly')
    const dailyStamp = getWindowStamp(now, 'daily')

    // Reset timestamps for each model / upload window
    const modelResets: Record<string, string> = {}
    for (const [name, cfg] of Object.entries(effectiveLimits.models)) {
      modelResets[name] = getWindowResetAt(now, (cfg as any).period || 'hourly').toISOString()
    }
    const uploadResets: Record<string, string> = {}
    for (const [cat, cfg] of Object.entries(effectiveLimits.uploads)) {
      uploadResets[cat] = getWindowResetAt(now, (cfg as any).period || 'hourly').toISOString()
    }

    // Get current hour/day usage from Redis directly for display
    const currentHourlyTpm = parseInt(await redis.get(`usage:tpm:${userId}:thinking:${hourlyStamp}`) || '0', 10) + parseInt(await redis.get(`usage:tpm:${userId}:small:${hourlyStamp}`) || '0', 10) + parseInt(await redis.get(`usage:tpm:${userId}:large:${hourlyStamp}`) || '0', 10) + parseInt(await redis.get(`usage:tpm:${userId}:critiq:${hourlyStamp}`) || '0', 10)
    const currentDailyTpm = parseInt(await redis.get(`usage:tpm:${userId}:thinking:${dailyStamp}`) || '0', 10) + parseInt(await redis.get(`usage:tpm:${userId}:small:${dailyStamp}`) || '0', 10) + parseInt(await redis.get(`usage:tpm:${userId}:large:${dailyStamp}`) || '0', 10) + parseInt(await redis.get(`usage:tpm:${userId}:critiq:${dailyStamp}`) || '0', 10)

    const currentHourlyRpm = parseInt(await redis.get(`usage:rpm:${userId}:thinking:${hourlyStamp}`) || '0', 10) + parseInt(await redis.get(`usage:rpm:${userId}:small:${hourlyStamp}`) || '0', 10) + parseInt(await redis.get(`usage:rpm:${userId}:large:${hourlyStamp}`) || '0', 10) + parseInt(await redis.get(`usage:rpm:${userId}:critiq:${hourlyStamp}`) || '0', 10)
    const currentDailyRpm = parseInt(await redis.get(`usage:rpm:${userId}:thinking:${dailyStamp}`) || '0', 10) + parseInt(await redis.get(`usage:rpm:${userId}:small:${dailyStamp}`) || '0', 10) + parseInt(await redis.get(`usage:rpm:${userId}:large:${dailyStamp}`) || '0', 10) + parseInt(await redis.get(`usage:rpm:${userId}:critiq:${dailyStamp}`) || '0', 10)

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        tier: user.tier,
        role: user.role,
        googleAuth: user.googleAuth,
      },
      effectiveLimits: {
        models: effectiveLimits.models,
        uploads: effectiveLimits.uploads,
        isOverridden: effectiveLimits.isOverridden,
      },
      usage: {
        models: usage.models,
        uploads: usage.uploads,
        totalTpmUsed: usage.totalTpmUsed,
        totalRpmUsed: usage.totalRpmUsed,
      },
      modelUsageInfo,
      uploadUsageInfo,
      currentWindow: {
        hourly: {
          stamp: hourlyStamp,
          tpmUsed: currentHourlyTpm,
          rpmUsed: currentHourlyRpm,
          resetAt: getWindowResetAt(now, 'hourly').toISOString(),
        },
        daily: {
          stamp: dailyStamp,
          tpmUsed: currentDailyTpm,
          rpmUsed: currentDailyRpm,
          resetAt: getWindowResetAt(now, 'daily').toISOString(),
        },
      },
      resets: {
        models: modelResets,
        uploads: uploadResets,
      },
      status: 'success',
    })
  } catch (err) {
    console.error('Get user usage error:', err)
    return res.status(500).json({ error: 'Failed to fetch user usage data' })
  }
})

export default router