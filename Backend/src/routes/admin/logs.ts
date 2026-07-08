// src/routes/admin/logs.ts
import { Router, Response } from 'express'
import mongoose from 'mongoose'
import { Log } from '../../models/log'
import { adminAuthMiddleware, AdminRequest } from '../../middleware/auth'
import { midLimiter } from '../../utils/ratelimitHelper'

const router = Router()
router.use(adminAuthMiddleware)


// ── GET /api/admin/logs ───────────────────────────────────────────────────────
router.get('/', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const search   = (req.query.search   as string) || ''
    const status   = (req.query.status   as string) || ''
    const action   = (req.query.action   as string) || ''
    const userId   = (req.query.userId   as string) || ''
    const dateFrom = (req.query.dateFrom as string) || ''
    const dateTo   = (req.query.dateTo   as string) || ''
    const page     = parseInt(req.query.page  as string) || 1
    const limit    = parseInt(req.query.limit as string) || 20
    const skip     = (page - 1) * limit

    const query: any = {}
    if (status) query.status = status
    if (action) query.action = action
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.userId = new mongoose.Types.ObjectId(userId)
    }
    if (dateFrom || dateTo) {
      query.createdAt = {}
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom)
      if (dateTo)   query.createdAt.$lte = new Date(dateTo)
    }
    if (search) {
      query.$or = [
        { action:  { $regex: search, $options: 'i' } },
        { path:    { $regex: search, $options: 'i' } },
        { method:  { $regex: search, $options: 'i' } },
      ]
    }

    const [total, logs] = await Promise.all([
      Log.countDocuments(query),
      Log.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email'),
    ])

    res.json({ total, page, limit, logs })
  } catch {
    res.status(500).json({ error: 'Failed to fetch activity logs' })
  }
})


// ── GET /api/admin/logs/user/:userId — all logs for a specific user ───────────
router.get('/user/:userId', midLimiter, async (req: AdminRequest<{ userId: string }>, res: Response) => {
  try {
    const { userId } = req.params
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid userId' })
    }

    const page     = parseInt(req.query.page  as string) || 1
    const limit    = parseInt(req.query.limit as string) || 50
    const skip     = (page - 1) * limit
    const action   = (req.query.action as string) || ''
    const status   = (req.query.status as string) || ''
    const dateFrom = (req.query.dateFrom as string) || ''
    const dateTo   = (req.query.dateTo   as string) || ''

    const query: any = { userId: new mongoose.Types.ObjectId(userId) }
    if (action) query.action = action
    if (status) query.status = status
    if (dateFrom || dateTo) {
      query.createdAt = {}
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom)
      if (dateTo)   query.createdAt.$lte = new Date(dateTo)
    }

    const [total, logs] = await Promise.all([
      Log.countDocuments(query),
      Log.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email'),
    ])

    res.json({ total, page, limit, logs, userId })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch user logs' })
  }
})


// ── GET /api/admin/logs/metrics ───────────────────────────────────────────────
router.get('/metrics', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const [dailyRequests, actionTypes, topUsers] = await Promise.all([
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
      // Top 10 most active users by request count
      Log.aggregate([
        { $match: { userId: { $exists: true, $ne: null }, createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id:         '$userId',
            total:       { $sum: 1 },
            ai_requests: { $sum: { $cond: [{ $eq: ['$action', 'AI_CHAT'] }, 1, 0] } },
            failures:    { $sum: { $cond: [{ $eq: ['$status', 'failed']  }, 1, 0] } },
          }
        },
        { $sort: { total: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      ]),
    ])

    res.json({
      dailyRequests,
      actionTypes,
      topUsers: topUsers.map((u: any) => ({
        userId:      String(u._id),
        name:        u.user?.name  || 'Unknown',
        email:       u.user?.email || '',
        total:       u.total,
        ai_requests: u.ai_requests,
        failures:    u.failures,
      })),
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch admin metrics' })
  }
})


// ── DELETE /api/admin/logs/:id ────────────────────────────────────────────────
router.delete('/:id', midLimiter, async (req: AdminRequest<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params
    const result = await Log.findByIdAndDelete(id)
    if (!result) return res.status(404).json({ error: 'Activity log not found' })
    res.json({ success: true, message: 'Activity log deleted successfully' })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete activity log' })
  }
})


// ── DELETE /api/admin/logs ────────────────────────────────────────────────────
router.delete('/', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const search = (req.query.search as string) || ''
    const status = (req.query.status as string) || ''
    const action = (req.query.action as string) || ''
    const userId = (req.query.userId as string) || ''

    const query: any = {}
    if (status) query.status = status
    if (action) query.action = action
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.userId = new mongoose.Types.ObjectId(userId)
    }
    if (search) {
      query.$or = [
        { action: { $regex: search, $options: 'i' } },
        { path:   { $regex: search, $options: 'i' } },
        { method: { $regex: search, $options: 'i' } },
      ]
    }

    const result = await Log.deleteMany(query)
    res.json({ success: true, message: `${result.deletedCount} activity logs cleared successfully` })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to clear activity logs' })
  }
})

export default router