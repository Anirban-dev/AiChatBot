// src/routes/config.ts
/**
 * Server configuration status endpoints.
 *
 * AUTH: `authMiddleware` is applied to the whole router below, so every route
 * in this file requires an authenticated user. No secrets are ever returned.
 * The admin-only provider listing additionally requires `adminAuthMiddleware`.
 *
 * PURPOSE:
 *   The frontend polls GET / (a.k.a. `/api/config-status`) on chat open to decide
 *   whether to show a proactive "AI APIs not configured" notice instead of
 *   letting the user hit a confusing litellm failure when no provider is enabled.
 */
import { Router, Response } from 'express'
import {
  authMiddleware,
  AuthRequest,
  adminAuthMiddleware,
} from '../middleware/auth'
import { AiProvider } from '../models/aiProvider'

const router = Router()
router.use(authMiddleware) // authenticated users only

/** GET /api/config-status — is at least one AI provider enabled? */
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const enabledCount = await AiProvider.countDocuments({ enabled: true })
    const providerCount = await AiProvider.estimatedDocumentCount()
    res.json({ configured: enabledCount > 0, enabledCount, providerCount })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to determine config status' })
  }
})

/** GET /api/config-status/providers — admin-only provider summary (no API keys) */
router.get('/providers', adminAuthMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const providers = await AiProvider.find({}).sort({ createdAt: -1 }).select('-apiKey')
    res.json({ providers, enabledCount: providers.filter((p) => p.enabled).length })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list providers' })
  }
})

export default router
