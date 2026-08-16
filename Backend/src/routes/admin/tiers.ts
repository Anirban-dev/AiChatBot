// src/routes/admin/tiers.ts
import { Router, Response } from 'express'
import { TierConfig } from '../../models/tier'
import { User } from '../../models/user'
import { adminAuthMiddleware, AdminRequest } from '../../middleware/auth'
import { writeLog } from '../../utils/logger'
import { midLimiter } from '../../utils/ratelimitHelper'
import { redis } from '../../utils/redis'

const router = Router()
router.use(adminAuthMiddleware)

// ─── GET /api/admin/tiers ─────────────────────────────────────────────────────
// List all tiers from DB
router.get('/', midLimiter, async (_req: AdminRequest, res: Response) => {
  try {
    const tiers = await TierConfig.find({}).sort({ createdAt: 1 }).lean()
    res.json({ tiers })
  } catch (err) {
    console.error('Error fetching tiers:', err)
    res.status(500).json({ error: 'Failed to fetch tiers' })
  }
})

// ─── POST /api/admin/tiers ────────────────────────────────────────────────────
// Create a new tier
router.post('/', midLimiter, async (req: AdminRequest, res: Response) => {
  const { name, models, uploads } = req.body

  if (!name || typeof name !== 'string' || !/^[a-z0-9_-]+$/i.test(name.trim())) {
    return res.status(400).json({ error: 'Invalid tier name. Use lowercase letters, numbers, hyphens, or underscores.' })
  }

  const slug = name.trim().toLowerCase()

  if (!models || !uploads) {
    return res.status(400).json({ error: 'models and uploads are required.' })
  }

  const modelKeys = ['small', 'large', 'thinking', 'critiq'] as const
  const uploadKeys = ['image', 'video', 'other'] as const
  const validPeriods = ['hourly', 'daily', 'weekly', 'monthly']

  for (const k of modelKeys) {
    if (!models[k]?.rpm || !models[k]?.tpm) {
      return res.status(400).json({ error: `Missing rpm/tpm for model: ${k}` })
    }
    if (models[k].period && !validPeriods.includes(models[k].period)) {
      return res.status(400).json({ error: `Invalid period for model ${k}. Must be hourly, daily, weekly, or monthly.` })
    }
  }
  for (const k of uploadKeys) {
    if (!uploads[k]?.max || !uploads[k]?.windowSec || !uploads[k]?.label) {
      return res.status(400).json({ error: `Missing max/windowSec/label for upload: ${k}` })
    }
    if (uploads[k].period && !validPeriods.includes(uploads[k].period)) {
      return res.status(400).json({ error: `Invalid period for upload ${k}. Must be hourly, daily, weekly, or monthly.` })
    }
  }

  try {
    const existing = await TierConfig.findOne({ name: slug })
    if (existing) return res.status(409).json({ error: `Tier "${slug}" already exists.` })

    const tier = await TierConfig.create({ name: slug, models, uploads })

    await writeLog({
      action:    'CREATE_TIER',
      status:    'success',
      method:    'POST',
      path:      '/api/admin/tiers',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details:   { name: slug, performedBy: req.userId },
    })

    res.status(201).json({ message: `Tier "${slug}" created.`, tier })
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `Tier "${slug}" already exists.` })
    }
    console.error('Error creating tier:', err)
    res.status(500).json({ error: 'Failed to create tier' })
  }
})

// ─── PUT /api/admin/tiers/:name ───────────────────────────────────────────────
// Update an existing tier's limits
router.put('/:name', midLimiter, async (req: AdminRequest & { params: { name: string } }, res: Response) => {
  const slug = req.params.name.toLowerCase()
  const { models, uploads } = req.body
  const validPeriods = ['hourly', 'daily', 'weekly', 'monthly']

  try {
    const tier = await TierConfig.findOne({ name: slug })
    if (!tier) return res.status(404).json({ error: `Tier "${slug}" not found.` })

    if (models) {
      const modelKeys = ['small', 'large', 'thinking', 'critiq'] as const
      for (const k of modelKeys) {
        if (models[k]?.rpm !== undefined) tier.models[k].rpm = Math.max(1, Number(models[k].rpm))
        if (models[k]?.tpm !== undefined) tier.models[k].tpm = Math.max(1, Number(models[k].tpm))
        if (models[k]?.period !== undefined && validPeriods.includes(models[k].period)) {
          tier.models[k].period = models[k].period
        }
      }
    }

    if (uploads) {
      const uploadKeys = ['image', 'video', 'other'] as const
      for (const k of uploadKeys) {
        if (uploads[k]?.max !== undefined) tier.uploads[k].max = Math.max(1, Number(uploads[k].max))
        if (uploads[k]?.windowSec !== undefined) tier.uploads[k].windowSec = Math.max(1, Number(uploads[k].windowSec))
        if (uploads[k]?.label !== undefined) tier.uploads[k].label = String(uploads[k].label)
        if (uploads[k]?.period !== undefined && validPeriods.includes(uploads[k].period)) {
          tier.uploads[k].period = uploads[k].period
        }
      }
    }

    await tier.save()

    // Bust all cached user limits so they pick up the new tier defaults
    const keys = await redis.keys('tier_config:*')
    if (keys.length > 0) await redis.del(...keys)

    await writeLog({
      action:    'UPDATE_TIER',
      status:    'success',
      method:    'PUT',
      path:      `/api/admin/tiers/${slug}`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details:   { name: slug, performedBy: req.userId },
    })

    res.json({ message: `Tier "${slug}" updated.`, tier })
  } catch (err) {
    console.error('Error updating tier:', err)
    res.status(500).json({ error: 'Failed to update tier' })
  }
})

// ─── DELETE /api/admin/tiers/:name ────────────────────────────────────────────
// Delete a tier (free is protected); users on deleted tier are reverted to free
router.delete('/:name', midLimiter, async (req: AdminRequest & { params: { name: string } }, res: Response) => {
  const slug = req.params.name.toLowerCase()

  if (slug === 'free') {
    return res.status(403).json({ error: 'The "free" tier is protected and cannot be deleted.' })
  }

  try {
    const tier = await TierConfig.findOneAndDelete({ name: slug })
    if (!tier) return res.status(404).json({ error: `Tier "${slug}" not found.` })

    // Revert all users on this tier back to free
    const freeTier = await TierConfig.findOne({ name: 'free' })
    const freeTpm = freeTier?.models.large.tpm ?? 15_000
    const freeRpm = freeTier?.models.large.rpm ?? 10

    const result = await User.updateMany(
      { tier: slug },
      {
        tier: 'free',
        $unset: { modelLimits: 1, uploadLimits: 1 },
      }
    )

    // Bust tier cache
    const keys = await redis.keys('tier_config:*')
    if (keys.length > 0) await redis.del(...keys)

    await writeLog({
      action:    'DELETE_TIER',
      status:    'success',
      method:    'DELETE',
      path:      `/api/admin/tiers/${slug}`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details:   { name: slug, usersReverted: result.modifiedCount, performedBy: req.userId },
    })

    res.json({
      message: `Tier "${slug}" deleted. ${result.modifiedCount} user(s) reverted to free.`,
    })
  } catch (err) {
    console.error('Error deleting tier:', err)
    res.status(500).json({ error: 'Failed to delete tier' })
  }
})

export default router
