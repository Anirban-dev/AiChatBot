// src/routes/admin/stats.ts
import { Router, Response } from 'express'
import { User }    from '../../models/user'
import { Chat }    from '../../models/chat'
import { Message } from '../../models/msg'
import { Log }     from '../../models/log'
import { adminAuthMiddleware, AdminRequest } from '../../middleware/auth'
import { midLimiter } from '../../utils/ratelimitHelper'

const router = Router()
router.use(adminAuthMiddleware)

// GET /api/admin/stats
router.get('/stats', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const [totalUsers, totalChats, totalMessages, totalLogs] = await Promise.all([
      User.countDocuments(),
      Chat.countDocuments(),
      Message.countDocuments(),
      Log.countDocuments(),
    ])

    const latencyAggregation = await Log.aggregate([
      { $match: { action: 'AI_CHAT', status: 'success', latency: { $exists: true } } },
      { $group: { _id: null, avgLatency: { $avg: '$latency' } } },
    ])
    const avgLatency = latencyAggregation.length > 0
      ? Math.round(latencyAggregation[0].avgLatency)
      : 0

    const [successLogsCount, failedLogsCount] = await Promise.all([
      Log.countDocuments({ status: 'success' }),
      Log.countDocuments({ status: 'failed' }),
    ])
    const totalStatusLogs = successLogsCount + failedLogsCount
    const successRate = totalStatusLogs > 0
      ? Math.round((successLogsCount / totalStatusLogs) * 100)
      : 100

    res.json({ totalUsers, totalChats, totalMessages, totalLogs, avgLatency, successRate })
  } catch {
    res.status(500).json({ error: 'Failed to fetch admin stats' })
  }
})

export default router