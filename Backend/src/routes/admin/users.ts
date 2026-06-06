// src/routes/admin/users.ts
import { Router, Response } from 'express'
import { User }    from '../../models/user'
import { Chat }    from '../../models/chat'
import { Message } from '../../models/msg'
import { adminAuthMiddleware, AdminRequest } from '../../middleware/auth'
import { writeLog } from '../../utils/logger'
import { midLimiter } from '../../utils/ratelimitHelper'
import { redis } from '../../utils/redis'

const router = Router()
router.use(adminAuthMiddleware)

// ─── Tier definitions (single source of truth) ────────────────────────────────
export const TIER_DEFAULTS: Record<string, { tpm: number; rpm: number }> = {
  free:       { tpm: 15_000,  rpm: 10  },
  premium:    { tpm: 90_000,  rpm: 40  },
  enterprise: { tpm: 500_000, rpm: 200 },
}

/**
 * Returns the effective limits for a user.
 * Manual overrides are stored in Redis under:  user_limits:{userId}  →  JSON { tpm, rpm }
 * Also returns whether an override is active so callers avoid a second Redis round-trip.
 */
async function getEffectiveLimits(
  userId: string,
  tier: string
): Promise<{ tpm: number; rpm: number; isOverridden: boolean }> {
  const user = await User.findById(userId).select('tpm rpm tier')
  const defaults = TIER_DEFAULTS[tier] ?? TIER_DEFAULTS.free
  if (user) {
    const tpm = (user as any).tpm !== undefined ? (user as any).tpm : defaults.tpm
    const rpm = (user as any).rpm !== undefined ? (user as any).rpm : defaults.rpm
    const isOverridden = (tpm !== defaults.tpm || rpm !== defaults.rpm)
    return { tpm, rpm, isOverridden }
  }
  return { ...defaults, isOverridden: false }
}

async function getCurrentUsage(userId: string): Promise<{ tpmUsed: number; rpmUsed: number }> {
  const now = new Date()
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'), // 🌟 Truncated to the hour boundary
  ].join('-')

  // Read from the newly updated hourly keys
  const [tphRaw, rphRaw] = await Promise.all([
    redis.get(`usage:tph:${userId}:${stamp}`),
    redis.get(`usage:rph:${userId}:${stamp}`),
  ])

  return {
    // Mapped directly to existing variables to ensure the Admin frontend doesn't break
    tpmUsed: parseInt(tphRaw ?? '0', 10) || 0,
    rpmUsed: parseInt(rphRaw ?? '0', 10) || 0,
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

      // Run all async lookups concurrently per user — no sequential awaits
      const [
        chatsCount,
        userChats,
        effectiveLimits,
        usage,
      ] = await Promise.all([
        Chat.countDocuments({ userId: u._id }),
        Chat.find({ userId: u._id }).select('_id'),
        getEffectiveLimits(userId, tier),
        getCurrentUsage(userId),
      ])

      const messagesCount = await Message.countDocuments({
        chatId: { $in: userChats.map(c => c._id) },
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
          tpm:          effectiveLimits.tpm,
          rpm:          effectiveLimits.rpm,
          tpmUsed:      usage.tpmUsed,
          rpmUsed:      usage.rpmUsed,
          tpmRemaining: Math.max(0, effectiveLimits.tpm - usage.tpmUsed),
          rpmRemaining: Math.max(0, effectiveLimits.rpm - usage.rpmUsed),
          isOverridden: effectiveLimits.isOverridden,
        },
      }
    }))

    res.json({ total, page, limit, users: augmentedUsers })
  } catch (err) {
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
    const tierDefaults    = TIER_DEFAULTS[tier] ?? TIER_DEFAULTS.free
    const effectiveLimits = await getEffectiveLimits(userId, tier)
    const usage           = await getCurrentUsage(userId)

    // Reconstruct override separately for the detailed view
    const isOverridden = (user as any).tpm !== undefined && (user as any).rpm !== undefined &&
      ((user as any).tpm !== tierDefaults.tpm || (user as any).rpm !== tierDefaults.rpm)
    const override = isOverridden ? { tpm: (user as any).tpm, rpm: (user as any).rpm } : null

    res.json({
      userId,
      tier,
      tierDefaults,
      override,                              // null if no manual override exists
      effective: {
        tpm: effectiveLimits.tpm,
        rpm: effectiveLimits.rpm,
      },
      isOverridden: effectiveLimits.isOverridden,
      currentMinuteUsage: {
        tpmUsed:      usage.tpmUsed,
        rpmUsed:      usage.rpmUsed,
        tpmRemaining: Math.max(0, effectiveLimits.tpm - usage.tpmUsed),
        rpmRemaining: Math.max(0, effectiveLimits.rpm - usage.rpmUsed),
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user limits' })
  }
})

// ─── PUT /api/admin/users/:userId/limits ──────────────────────────────────────
// Send { tpm, rpm } to set an override. Send { clear: true } to remove it.
router.put('/:userId/limits', midLimiter, async (req: AdminRequest & { params: { userId: string } }, res: Response) => {
  const { userId } = req.params
  const { tpm, rpm, clear } = req.body

  try {
    const user = await User.findById(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    // ── Clear override → revert to tier defaults ───────────────────────────
    if (clear === true) {
      const defaults = TIER_DEFAULTS[(user as any).tier] ?? TIER_DEFAULTS.free
      await User.findByIdAndUpdate(userId, {
        tpm: defaults.tpm,
        rpm: defaults.rpm
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

      return res.json({ message: 'Limit override cleared. User reverted to tier defaults.' })
    }

    // ── Validate ───────────────────────────────────────────────────────────
    if (tpm !== undefined && (typeof tpm !== 'number' || tpm < 1)) {
      return res.status(400).json({ error: 'tpm must be a positive integer' })
    }
    if (rpm !== undefined && (typeof rpm !== 'number' || rpm < 1)) {
      return res.status(400).json({ error: 'rpm must be a positive integer' })
    }
    if (tpm === undefined && rpm === undefined) {
      return res.status(400).json({ error: 'Provide at least one of: tpm, rpm, or clear: true' })
    }

    // ── Merge with existing limits in DB ───────────────────────────────────
    const updated = {
      tpm: tpm ?? (user as any).tpm ?? (TIER_DEFAULTS[(user as any).tier] ?? TIER_DEFAULTS.free).tpm,
      rpm: rpm ?? (user as any).rpm ?? (TIER_DEFAULTS[(user as any).tier] ?? TIER_DEFAULTS.free).rpm,
    }

    await User.findByIdAndUpdate(userId, {
      tpm: updated.tpm,
      rpm: updated.rpm
    })
    await redis.del(`user_limits:${userId}`)

    await writeLog({
      action: 'UPDATE_USER_LIMITS',
      status: 'success',
      method: 'PUT',
      path:   `/api/admin/users/${userId}/limits`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { targetUserId: userId, performedBy: req.userId, updated },
    })

    res.json({ message: 'User limits updated successfully', effective: updated })
  } catch (err) {
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
    if (!['free', 'premium', 'enterprise'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be free, premium, or enterprise.' })
    }

    const defaults = TIER_DEFAULTS[tier] ?? TIER_DEFAULTS.free
    const updatedUser = await User.findByIdAndUpdate(userId, { 
      tier,
      tpm: defaults.tpm,
      rpm: defaults.rpm
    }, { returnDocument: 'after' })
    if (!updatedUser) return res.status(404).json({ error: 'User not found' })

    // Clear manual limit override and refresh tokens
    await Promise.all([
      redis.del(`user_limits:${userId}`),
      redis.del(`refresh:${userId}`),       // forces re-login with new tier in token
    ])

    await writeLog({
      action: 'UPDATE_USER_TIER',
      status: 'success',
      method: 'PUT',
      path:   `/api/admin/users/${userId}/tier`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { targetUserId: userId, newTier: tier, performedBy: req.userId },
    })

    res.json({ message: `User tier updated to ${tier}. User will need to re-login for the new tier to take effect in their token.` })
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
    const chatIds = chats.map(c => c._id)
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