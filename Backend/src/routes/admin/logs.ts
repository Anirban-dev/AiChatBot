// src/routes/admin/logs.ts
import { Router, Response } from 'express'
import { Log } from '../../models/log'
import { adminAuthMiddleware, AdminRequest } from '../../middleware/auth'
import { midLimiter } from '../../utils/ratelimitHelper'

const router = Router()
router.use(adminAuthMiddleware)

// GET /api/admin/logs
router.get('/', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const search = (req.query.search as string) || ''
    const status = (req.query.status as string) || ''
    const action = (req.query.action as string) || ''
    const page   = parseInt(req.query.page  as string) || 1
    const limit  = parseInt(req.query.limit as string) || 20
    const skip   = (page - 1) * limit

    const query: any = {}
    if (status) query.status = status
    if (action) query.action = action
    if (search) {
      query.$or = [
        { action: { $regex: search, $options: 'i' } },
        { path:   { $regex: search, $options: 'i' } },
        { method: { $regex: search, $options: 'i' } },
      ]
    }

    const total = await Log.countDocuments(query)
    const logs  = await Log.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email')

    res.json({ total, page, limit, logs })
  } catch {
    res.status(500).json({ error: 'Failed to fetch activity logs' })
  }
})

// GET /api/admin/logs/metrics
router.get('/metrics', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const [dailyRequests, actionTypes] = await Promise.all([
      Log.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id:     { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count:   { $sum: 1 },
            success: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
            failed:  { $sum: { $cond: [{ $eq: ['$status', 'failed']  }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Log.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ])

    res.json({ dailyRequests, actionTypes })
  } catch {
    res.status(500).json({ error: 'Failed to fetch admin metrics' })
  }
})

export default router