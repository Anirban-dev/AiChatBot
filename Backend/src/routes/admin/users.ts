// src/routes/admin/users.ts
import { Router, Response } from 'express'
import { User }       from '../../models/user'
import { Chat }       from '../../models/chat'
import { Message }    from '../../models/msg'
import { TierConfig, ITierConfig } from '../../models/tier'
import { adminAuthMiddleware, AdminRequest } from '../../middleware/auth'
import { writeLog } from '../../utils/logger'
import { midLimiter } from '../../utils/ratelimitHelper'
import { redis } from '../../utils/redis'

const router = Router()
router.use(adminAuthMiddleware)

// // ─── DB-backed Tier Config Helpers ────────────────────────────────────────────
import { getWindowStamp, WindowPeriod } from '../../utils/windowHelper'

export interface ModelLimitConfig {
  rpm: number
  tpm: number
  period?: WindowPeriod
}

export interface UploadLimitConfig {
  max: number
  windowSec: number
  label: string
  period?: WindowPeriod
}

export interface TierFullConfig {
  models: {
    small:    ModelLimitConfig
    large:    ModelLimitConfig
    thinking: ModelLimitConfig
    critiq:   ModelLimitConfig
  }
  uploads: {
    image: UploadLimitConfig
    video: UploadLimitConfig
    other: UploadLimitConfig
  }
}

/** Fetch tier config from DB with a short Redis cache (60 s). Falls back to free tier. */
export async function getTierConfig(tierName: string): Promise<TierFullConfig> {
  const cacheKey = `tier_config:${tierName}`
  const cached = await redis.get(cacheKey)
  if (cached) {
    try { return JSON.parse(cached) } catch {}
  }

  const doc = await TierConfig.findOne({ name: tierName }).lean() as ITierConfig | null
  if (doc) {
    const config: TierFullConfig = {
      models:  doc.models  as any,
      uploads: doc.uploads as any,
    }
    await redis.set(cacheKey, JSON.stringify(config), 'EX', 60)
    return config
  }

  // Fallback: fetch the free tier from DB
  const free = await TierConfig.findOne({ name: 'free' }).lean() as ITierConfig | null
  const fallback: TierFullConfig = free
    ? { models: free.models as any, uploads: free.uploads as any }
    : {
        models: {
          small:    { rpm: 30,  tpm: 40_000, period: 'hourly' },
          large:    { rpm: 10,  tpm: 15_000, period: 'hourly' },
          thinking: { rpm: 5,   tpm: 10_000, period: 'hourly' },
          critiq:   { rpm: 5,   tpm: 10_000, period: 'hourly' },
        },
        uploads: {
          image: { max: 10, windowSec: 3600,  label: 'image', period: 'hourly' },
          video: { max: 1,  windowSec: 86400, label: 'video', period: 'daily'  },
          other: { max: 5,  windowSec: 3600,  label: 'file',  period: 'hourly' },
        },
      }
  await redis.set(cacheKey, JSON.stringify(fallback), 'EX', 60)
  return fallback
}

/**
 * Returns full effective multi-dimensional limits for a user (models + uploads).
 */
export async function getEffectiveUserLimits(
  userId: string,
  tier: string
): Promise<{
  models: {
    small: ModelLimitConfig
    large: ModelLimitConfig
    thinking: ModelLimitConfig
    critiq: ModelLimitConfig
  }
  uploads: {
    image: UploadLimitConfig
    video: UploadLimitConfig
    other: UploadLimitConfig
  }
  isOverridden: boolean
}> {
  const user = await User.findById(userId).select('tier modelLimits uploadLimits')
  const defaultTierConfig = await getTierConfig(tier)

  if (!user) {
    return {
      models: defaultTierConfig.models,
      uploads: defaultTierConfig.uploads,
      isOverridden: false,
    }
  }

  const u = user as any
  let isOverridden = false

  const models = {
    small: {
      rpm:    u.modelLimits?.small?.rpm ?? defaultTierConfig.models.small.rpm,
      tpm:    u.modelLimits?.small?.tpm ?? defaultTierConfig.models.small.tpm,
      period: u.modelLimits?.small?.period ?? defaultTierConfig.models.small.period ?? 'hourly',
    },
    large: {
      rpm:    u.modelLimits?.large?.rpm ?? defaultTierConfig.models.large.rpm,
      tpm:    u.modelLimits?.large?.tpm ?? defaultTierConfig.models.large.tpm,
      period: u.modelLimits?.large?.period ?? defaultTierConfig.models.large.period ?? 'hourly',
    },
    thinking: {
      rpm:    u.modelLimits?.thinking?.rpm ?? defaultTierConfig.models.thinking.rpm,
      tpm:    u.modelLimits?.thinking?.tpm ?? defaultTierConfig.models.thinking.tpm,
      period: u.modelLimits?.thinking?.period ?? defaultTierConfig.models.thinking.period ?? 'hourly',
    },
    critiq: {
      rpm:    u.modelLimits?.critiq?.rpm ?? defaultTierConfig.models.critiq.rpm,
      tpm:    u.modelLimits?.critiq?.tpm ?? defaultTierConfig.models.critiq.tpm,
      period: u.modelLimits?.critiq?.period ?? defaultTierConfig.models.critiq.period ?? 'hourly',
    },
  }

  for (const m of ['small', 'large', 'thinking', 'critiq'] as const) {
    if (
      models[m].rpm !== defaultTierConfig.models[m].rpm ||
      models[m].tpm !== defaultTierConfig.models[m].tpm ||
      models[m].period !== defaultTierConfig.models[m].period
    ) isOverridden = true
  }

  const uploads = {
    image: {
      max:       u.uploadLimits?.image?.max ?? defaultTierConfig.uploads.image.max,
      windowSec: defaultTierConfig.uploads.image.windowSec,
      label:     defaultTierConfig.uploads.image.label,
      period:    u.uploadLimits?.image?.period ?? defaultTierConfig.uploads.image.period ?? 'hourly',
    },
    video: {
      max:       u.uploadLimits?.video?.max ?? defaultTierConfig.uploads.video.max,
      windowSec: defaultTierConfig.uploads.video.windowSec,
      label:     defaultTierConfig.uploads.video.label,
      period:    u.uploadLimits?.video?.period ?? defaultTierConfig.uploads.video.period ?? 'daily',
    },
    other: {
      max:       u.uploadLimits?.other?.max ?? defaultTierConfig.uploads.other.max,
      windowSec: defaultTierConfig.uploads.other.windowSec,
      label:     defaultTierConfig.uploads.other.label,
      period:    u.uploadLimits?.other?.period ?? defaultTierConfig.uploads.other.period ?? 'hourly',
    },
  }

  for (const cat of ['image', 'video', 'other'] as const) {
    if (
      uploads[cat].max !== defaultTierConfig.uploads[cat].max ||
      uploads[cat].period !== defaultTierConfig.uploads[cat].period
    ) isOverridden = true
  }

  return { models, uploads, isOverridden }
}

/**
 * Returns real-time usage stats for a user across all models and upload categories based on their effective period.
 */
export async function getDetailedUserUsage(
  userId: string,
  userTier: string = 'free',
  effective?: Awaited<ReturnType<typeof getEffectiveUserLimits>>
): Promise<{
  models: Record<string, { rpmUsed: number; tpmUsed: number }>
  uploads: Record<string, { used: number }>
  totalTpmUsed: number
  totalRpmUsed: number
}> {
  const limits = effective ?? (await getEffectiveUserLimits(userId, userTier))
  const now = new Date()

  const modelKeys = ['small', 'large', 'thinking', 'critiq'] as const
  const uploadKeys = ['image', 'video', 'other'] as const

  const modelUsagePromises = modelKeys.map(async m => {
    const period = limits.models[m].period || 'hourly'
    const stamp = getWindowStamp(now, period)
    const [tpmRaw, rpmRaw] = await Promise.all([
      redis.get(`usage:tpm:${userId}:${m}:${stamp}`),
      redis.get(`usage:rpm:${userId}:${m}:${stamp}`),
    ])
    return {
      key: m,
      tpmUsed: parseInt(tpmRaw ?? '0', 10) || 0,
      rpmUsed: parseInt(rpmRaw ?? '0', 10) || 0,
    }
  })

  const uploadUsagePromises = uploadKeys.map(async cat => {
    const period = limits.uploads[cat].period || (cat === 'video' ? 'daily' : 'hourly')
    const stamp = getWindowStamp(now, period)
    const usedRaw = await redis.get(`rl:upload:${cat}:${userId}:${stamp}`)
    return {
      key: cat,
      used: parseInt(usedRaw ?? '0', 10) || 0,
    }
  })

  const [modelResults, uploadResults] = await Promise.all([
    Promise.all(modelUsagePromises),
    Promise.all(uploadUsagePromises),
  ])

  const modelsUsage: Record<string, { rpmUsed: number; tpmUsed: number }> = {}
  for (const r of modelResults) {
    modelsUsage[r.key] = { rpmUsed: r.rpmUsed, tpmUsed: r.tpmUsed }
  }

  const uploadsUsage: Record<string, { used: number }> = {}
  for (const r of uploadResults) {
    uploadsUsage[r.key] = { used: r.used }
  }

  const sumModelTpm = Object.values(modelsUsage).reduce((a, b) => a + b.tpmUsed, 0)
  const sumModelRpm = Object.values(modelsUsage).reduce((a, b) => a + b.rpmUsed, 0)

  return {
    models: modelsUsage,
    uploads: uploadsUsage,
    totalTpmUsed: sumModelTpm,
    totalRpmUsed: sumModelRpm,
  }
}

// ─── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const search = (req.query.search as string) || ''
    const page   = parseInt(req.query.page  as string) || 1
    const limit  = parseInt(req.query.limit as string) || 10
    const skip   = (page - 1) * limit

    const query: any = {}
    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ]
    }

    const total = await User.countDocuments(query)
    const users = await User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)

    // Fetch chat/message counts and Redis data for all users in parallel
    const augmentedUsers = await Promise.all(users.map(async (u) => {
      const userId = String(u._id)
      const tier   = (u as any).tier || 'free'

      const [
        chatsCount,
        userChats,
        effectiveLimits,
        usage,
      ] = await Promise.all([
        Chat.countDocuments({ userId: u._id }),
        Chat.find({ userId: u._id }).select('_id'),
        getEffectiveUserLimits(userId, tier),
        getDetailedUserUsage(userId),
      ])

      const messagesCount = await Message.countDocuments({
        chatId: { $in: userChats.map(c => c._id.toString()) },
      })

      return {
        id:           u._id,
        name:         u.name,
        email:        u.email,
        role:         (u as any).role || 'user',
        tier,
        googleAuth:   (u as any).googleAuth || false,
        createdAt:    (u as any).createdAt,
        chatsCount,
        messagesCount,
        limits: {
          tpmUsed:      usage.totalTpmUsed,
          rpmUsed:      usage.totalRpmUsed,
          models:       effectiveLimits.models,
          uploads:      effectiveLimits.uploads,
          modelsUsage:  usage.models,
          uploadsUsage: usage.uploads,
          isOverridden: effectiveLimits.isOverridden,
        },
      }
    }))

    res.json({ total, page, limit, users: augmentedUsers })
  } catch (err) {
    console.error('Error fetching admin users:', err)
    res.status(500).json({ error: 'Failed to fetch users list' })
  }
})

// ─── GET /api/admin/users/:userId/limits ──────────────────────────────────────
router.get('/:userId/limits', midLimiter, async (req: AdminRequest & { params: { userId: string } }, res: Response) => {
  const { userId } = req.params
  try {
    const user = await User.findById(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const tier            = (user as any).tier || 'free'
    const tierDefaults    = await getTierConfig(tier)
    const effectiveLimits = await getEffectiveUserLimits(userId, tier)
    const usage           = await getDetailedUserUsage(userId)

    // Fetch all tier configs for the modal's "reset to tier defaults" feature
    const allTierDocs  = await TierConfig.find({}).lean()
    const allTierDefaults: Record<string, TierFullConfig> = {}
    for (const t of allTierDocs) {
      allTierDefaults[t.name] = { models: t.models as any, uploads: t.uploads as any }
    }

    res.json({
      userId,
      tier,
      tierDefaults,
      allTierDefaults,
      effective: effectiveLimits,
      isOverridden: effectiveLimits.isOverridden,
      usage,
    })
  } catch (err) {
    console.error('Error fetching user limits details:', err)
    res.status(500).json({ error: 'Failed to fetch user limits' })
  }
})

// ─── PUT /api/admin/users/:userId/limits ──────────────────────────────────────
// Update limits with support for fine-grained models, uploads, or full reset
router.put('/:userId/limits', midLimiter, async (req: AdminRequest & { params: { userId: string } }, res: Response) => {
  const { userId } = req.params
  const {
    clear,
    tpm,
    rpm,
    modelLimits,
    uploadLimits
  } = req.body

  try {
    const user = await User.findById(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    // ── Clear all overrides → revert entirely to tier defaults ────────────
    if (clear === true) {
      await User.findByIdAndUpdate(userId, {
        $unset: { modelLimits: 1, uploadLimits: 1 },
      })
      await redis.del(`user_limits:${userId}`)

      await writeLog({
        action: 'CLEAR_USER_LIMIT_OVERRIDE',
        status: 'success',
        method: 'PUT',
        path:   `/api/admin/users/${userId}/limits`,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        details: { targetUserId: userId, performedBy: req.userId },
      })

      return res.json({ message: 'All custom limit overrides cleared. User reverted to tier defaults.' })
    }

    // ── Prepare updates ───────────────────────────────────────────────────
    const updateQuery: any = {}

    if (modelLimits && typeof modelLimits === 'object') {
      for (const m of ['small', 'large', 'thinking', 'critiq'] as const) {
        if (modelLimits[m]) {
          if (modelLimits[m].rpm !== undefined) {
            updateQuery[`modelLimits.${m}.rpm`] = Math.max(1, Number(modelLimits[m].rpm))
          }
          if (modelLimits[m].tpm !== undefined) {
            updateQuery[`modelLimits.${m}.tpm`] = Math.max(1, Number(modelLimits[m].tpm))
          }
          if (modelLimits[m].period !== undefined && ['hourly', 'daily', 'weekly', 'monthly'].includes(modelLimits[m].period)) {
            updateQuery[`modelLimits.${m}.period`] = modelLimits[m].period
          }
        }
      }
    }

    if (uploadLimits && typeof uploadLimits === 'object') {
      for (const cat of ['image', 'video', 'other'] as const) {
        if (uploadLimits[cat]) {
          if (uploadLimits[cat].max !== undefined) {
            updateQuery[`uploadLimits.${cat}.max`] = Math.max(1, Number(uploadLimits[cat].max))
          }
          if (uploadLimits[cat].period !== undefined && ['hourly', 'daily', 'weekly', 'monthly'].includes(uploadLimits[cat].period)) {
            updateQuery[`uploadLimits.${cat}.period`] = uploadLimits[cat].period
          }
        }
      }
    }

    if (Object.keys(updateQuery).length === 0) {
      return res.status(400).json({ error: 'No valid limit fields provided to update.' })
    }

    await User.findByIdAndUpdate(userId, { $set: updateQuery })
    await redis.del(`user_limits:${userId}`)

    const effective = await getEffectiveUserLimits(userId, (user as any).tier || 'free')

    await writeLog({
      action: 'UPDATE_USER_LIMITS',
      status: 'success',
      method: 'PUT',
      path:   `/api/admin/users/${userId}/limits`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { targetUserId: userId, performedBy: req.userId, updated: updateQuery },
    })

    res.json({ message: 'User limits updated successfully', effective })
  } catch (err) {
    console.error('Error updating user limits:', err)
    await writeLog({
      action: 'UPDATE_USER_LIMITS',
      status: 'failed',
      method: 'PUT',
      path:   `/api/admin/users/${userId}/limits`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { userId, error: err instanceof Error ? err.message : String(err) },
    })
    res.status(500).json({ error: 'Failed to update user limits' })
  }
})

// ─── PUT /api/admin/users/:userId/tier ────────────────────────────────────────
router.put('/:userId/tier', midLimiter, async (req: AdminRequest & { params: { userId: string } }, res: Response) => {
  const { userId } = req.params
  const { tier } = req.body

  try {
    if (!tier || typeof tier !== 'string') {
      return res.status(400).json({ error: 'tier is required.' })
    }

    // Validate against DB
    const tierDoc = await TierConfig.findOne({ name: tier.toLowerCase() })
    if (!tierDoc) {
      return res.status(400).json({ error: `Tier "${tier}" does not exist. Create it first in the Tiers management page.` })
    }

    const slug = tier.toLowerCase()
    const updatedUser = await User.findByIdAndUpdate(userId, {
      tier: slug,
      $unset: { modelLimits: 1, uploadLimits: 1 },
    }, { returnDocument: 'after' })
    if (!updatedUser) return res.status(404).json({ error: 'User not found' })

    // Clear manual limit override and refresh tokens
    await Promise.all([
      redis.del(`user_limits:${userId}`),
      redis.del(`refresh:${userId}`),
    ])

    await writeLog({
      action: 'UPDATE_USER_TIER',
      status: 'success',
      method: 'PUT',
      path:   `/api/admin/users/${userId}/tier`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { targetUserId: userId, newTier: slug, performedBy: req.userId },
    })

    res.json({ message: `User tier updated to ${slug}. User will need to re-login for the new tier to take effect in their token.` })
  } catch (err) {
    await writeLog({
      action: 'UPDATE_USER_TIER',
      status: 'failed',
      method: 'PUT',
      path:   `/api/admin/users/${userId}/tier`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { userId, error: err instanceof Error ? err.message : String(err) },
    })
    res.status(500).json({ error: 'Failed to update user tier' })
  }
})

// ─── PUT /api/admin/users/:userId/role ────────────────────────────────────────
router.put('/:userId/role', midLimiter, async (req: AdminRequest & { params: { userId: string } }, res: Response) => {
  const { userId } = req.params
  const { role } = req.body

  try {
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be user or admin.' })
    }
    if (req.userId === userId && role !== 'admin') {
      return res.status(403).json({ error: 'Security constraint: You cannot revoke your own admin rights.' })
    }

    const updatedUser = await User.findByIdAndUpdate(userId, { role }, { returnDocument: 'after' })
    if (!updatedUser) return res.status(404).json({ error: 'User not found' })

    // Invalidate refresh token so the role change is reflected on next login
    await redis.del(`refresh:${userId}`)

    await writeLog({
      action: 'UPDATE_USER_ROLE',
      status: 'success',
      method: 'PUT',
      path:   `/api/admin/users/${userId}/role`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { updatedUserId: userId, targetRole: role },
    })

    res.json({ message: `User role updated to ${role}. User will need to re-login for the change to take effect.` })
  } catch (err) {
    await writeLog({
      action: 'UPDATE_USER_ROLE',
      status: 'failed',
      method: 'PUT',
      path:   `/api/admin/users/${userId}/role`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { userId, error: err instanceof Error ? err.message : String(err) },
    })
    res.status(500).json({ error: 'Failed to update user role' })
  }
})

// ─── DELETE /api/admin/users/:userId ──────────────────────────────────────────
router.delete('/:userId', midLimiter, async (req: AdminRequest & { params: { userId: string } }, res: Response) => {
  const { userId } = req.params
  try {
    const user = await User.findByIdAndDelete(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const chats   = await Chat.find({ userId }).select('_id')
    const chatIds = chats.map(c => c._id.toString())
    await Message.deleteMany({ chatId: { $in: chatIds } })
    await Chat.deleteMany({ userId })

    await Promise.all([
      redis.del(`refresh:${userId}`),
      redis.del(`user_limits:${userId}`),
    ])

    await writeLog({
      action: 'DELETE_USER',
      status: 'success',
      method: 'DELETE',
      path:   `/api/admin/users/${userId}`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { deletedUserId: userId, deletedEmail: (user as any).email },
    })

    res.json({ message: 'User and all associated data deleted successfully' })
  } catch (err) {
    await writeLog({
      action: 'DELETE_USER',
      status: 'failed',
      method: 'DELETE',
      path:   `/api/admin/users/${userId}`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { userId, error: err instanceof Error ? err.message : String(err) },
    })
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

export default router