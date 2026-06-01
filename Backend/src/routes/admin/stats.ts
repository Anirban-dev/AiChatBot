import { Router, Response } from 'express'
import { User } from '../../models/user'
import { Chat } from '../../models/chat'
import { Message } from '../../models/msg'
import { Log } from '../../models/log'
import { adminAuthMiddleware, AdminRequest } from './middleware'
import { midLimiter } from '../../utils/ratelimitHelper'

const router = Router()

router.use(adminAuthMiddleware)

router.get('/stats', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const totalUsers = await User.countDocuments()
    const totalChats = await Chat.countDocuments()
    const totalMessages = await Message.countDocuments()
    const totalLogs = await Log.countDocuments()

    // Average AI latency
    const aiLogs = await Log.find({ action: 'AI_CHAT', status: 'success', latency: { $exists: true } })
    const avgLatency = aiLogs.length > 0 
      ? Math.round(aiLogs.reduce((acc, curr) => acc + (curr.latency || 0), 0) / aiLogs.length)
      : 0

    // Success Rate (failed vs success)
    const successLogsCount = await Log.countDocuments({ status: 'success' })
    const failedLogsCount = await Log.countDocuments({ status: 'failed' })
    const totalStatusLogs = successLogsCount + failedLogsCount
    const successRate = totalStatusLogs > 0
      ? Math.round((successLogsCount / totalStatusLogs) * 100)
      : 100

    res.json({
      totalUsers,
      totalChats,
      totalMessages,
      totalLogs,
      avgLatency,
      successRate
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin stats' })
  }
})

export default router
