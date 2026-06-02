// src/routes/admin/litellm.ts
import { Router, Response } from 'express'
import { adminAuthMiddleware, AdminRequest } from '../../middleware/auth'
import { midLimiter } from '../../utils/ratelimitHelper'

const router = Router()
router.use(adminAuthMiddleware)

const getBackendUrl = (): string => {
  if (!process.env.AI_API) throw new Error('AI_API environment variable is not defined')
  return process.env.AI_API
}

// GET /api/admin/llm/status
router.get('/status', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const r = await fetch(`${getBackendUrl()}/status`)
    if (!r.ok) throw new Error(`Python service returned status ${r.status}`)
    res.json(await r.json())
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Upstream service unavailable' })
  }
})

// GET /api/admin/llm/events
router.get('/events', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const params: Record<string, string> = {
      since_hours: String(req.query.since_hours || 24),
      limit:       String(req.query.limit || 100),
    }
    if (req.query.type) params.type = String(req.query.type)
    if (req.query.tier) params.tier = String(req.query.tier)

    const qs = new URLSearchParams(params).toString()
    const r  = await fetch(`${getBackendUrl()}/events?${qs}`)
    if (!r.ok) throw new Error(`Python service returned status ${r.status}`)
    res.json(await r.json())
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Upstream service unavailable' })
  }
})

export default router