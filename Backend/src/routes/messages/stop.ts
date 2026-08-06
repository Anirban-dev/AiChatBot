// src/routes/messages/stop.ts
import { Router, Response } from 'express'
import authMiddleware, { AuthRequest } from '../../middleware/auth'
import { midLimiter } from '../../utils/ratelimitHelper'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

// ─── POST /stop: signal the AI engine to stop generation ─────────────────────
router.post('/', midLimiter, async (req: AuthRequest<{ chatId: string }>, res: Response) => {
  const { chatId } = req.params
  try {
    const response = await fetch(`${process.env.AI_API}/stop`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId }),
    })
    if (!response.ok) return res.status(500).json({ error: 'Failed to terminate the engine stream thread' })
    res.json({ success: true, message: 'Stream stop signal sent' })
  } catch (err) {
    console.error('Stop Endpoint Error:', err)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

export default router
