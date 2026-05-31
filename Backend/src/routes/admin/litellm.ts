// src/routes/admin/llm.ts
import { Router, Response } from 'express'
import { adminAuthMiddleware, AdminRequest } from './middleware'
import { midLimiter } from '../../utils/ratelimitHelper'

const router = Router()
router.use(adminAuthMiddleware)

const PY = process.env.AI_API

router.get('/status', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const r = await fetch(`${PY}/status`)
    if (!r.ok) throw new Error(`Python returned ${r.status}`)
    res.json(await r.json())
  } catch (err: any) {
    res.status(502).json({ error: err.message })
  }
})

router.get('/events', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const qs = new URLSearchParams({
      since_hours: String(req.query.since_hours || 24),
      type:        String(req.query.type        || ''),
      tier:        String(req.query.tier        || ''),
      limit:       String(req.query.limit       || 100),
    })
    const r = await fetch(`${PY}/events?${qs}`)
    if (!r.ok) throw new Error(`Python returned ${r.status}`)
    res.json(await r.json())
  } catch (err: any) {
    res.status(502).json({ error: err.message })
  }
})

export default router