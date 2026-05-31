import { Router, Response } from 'express'
import { User } from '../../models/user'
import { Chat } from '../../models/chat'
import { Message } from '../../models/msg'
import { adminAuthMiddleware, AdminRequest } from './middleware'
import { writeLog } from '../../utils/logger'
import { midLimiter } from '../../utils/ratelimitHelper'

const router = Router()

router.use(adminAuthMiddleware)

// GET /api/admin/users
router.get('/', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const search = req.query.search as string || ''
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const skip = (page - 1) * limit

    const query: any = {}
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]
    }

    const total = await User.countDocuments(query)
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    // Augment users with their chat and message counts
    const augmentedUsers = await Promise.all(users.map(async (u) => {
      const chatsCount = await Chat.countDocuments({ userId: u._id })
      
      const userChats = await Chat.find({ userId: u._id }).select('_id')
      const chatIds = userChats.map(c => c._id)
      const messagesCount = await Message.countDocuments({ chatId: { $in: chatIds } })

      return {
        id: u._id,
        name: u.name,
        email: u.email,
        role: (u as any).role || 'user',
        googleAuth: (u as any).googleAuth || false,
        createdAt: u.createdAt,
        chatsCount,
        messagesCount
      }
    }))

    res.json({
      total,
      page,
      limit,
      users: augmentedUsers
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users list' })
  }
})

// PUT /api/admin/users/:userId/role
router.put('/:userId/role', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const { userId } = req.params
    const { role } = req.body

    if (!role || !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' })
    }

    const user = await User.findByIdAndUpdate(userId, { role }, { new: true })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    await writeLog({
      action: 'UPDATE_USER_ROLE',
      status: 'success',
      method: 'PUT',
      path: `/api/admin/users/${userId}/role`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { targetUserId: userId, newRole: role }
    })

    res.json({ 
      message: 'User role updated successfully', 
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: (user as any).role 
      } 
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user role' })
  }
})

// DELETE /api/admin/users/:userId
router.delete('/:userId', async (req: AdminRequest, res: Response) => {
  try {
    const { userId } = req.params

    const user = await User.findByIdAndDelete(userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Delete all chats & messages belonging to this user
    const chats = await Chat.find({ userId: userId }).select('_id')
    const chatIds = chats.map(c => c._id)
    
    await Message.deleteMany({ chatId: { $in: chatIds } })
    await Chat.deleteMany({ userId: userId })

    await writeLog({
      action: 'DELETE_USER',
      status: 'success',
      method: 'DELETE',
      path: `/api/admin/users/${userId}`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { deletedUserId: userId, deletedEmail: user.email }
    })

    res.json({ message: 'User and all associated data deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

export default router
