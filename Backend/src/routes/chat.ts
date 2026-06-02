import { Router, Response } from 'express'
import { Chat } from '../models/chat'
import { Message } from '../models/msg'
import authMiddleware, { AuthRequest } from '../middleware/auth'
import { genLimiter, midLimiter, strictLimiter, vgenLimiter } from '../utils/ratelimitHelper'
import { writeLog } from '../utils/logger'

const router = Router()

router.use(authMiddleware)

// Create chat
router.post('/', strictLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const chat = await Chat.create({
      title: `New Chat`,
      userId: req.userId
    })

    await writeLog({
      userId: req.userId,
      action: 'CREATE_CHAT',
      status: 'success',
      method: 'POST',
      path: '/api/chats',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { chatId: chat.id }
    })

    res.json({ id: chat.id, title: chat.title })
  } catch (err) {
    await writeLog({
      userId: req.userId,
      action: 'CREATE_CHAT',
      status: 'failed',
      method: 'POST',
      path: '/api/chats',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { error: err instanceof Error ? err.message : String(err) }
    })
    res.status(500).json({ error: 'Failed to create chat' })
  }
})

// Get all chats
router.get('/allchats', genLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const chats = await Chat.find({ userId: req.userId }).sort({ createdAt: -1 })
    res.json(chats.map(c => ({ id: c.id, title: c.title, createdAt: c.createdAt })))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chats' })
  }
})

// Get chat
router.get('/:id', vgenLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const chat = await Chat.findById((req.params as { id: string }).id)
    if (!chat) return res.status(404).json({ error: 'Chat not found' })
    res.json({ id: chat.id, title: chat.title })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chat' })
  }
})

// Rename chat
router.put('/:id', midLimiter, async (req: AuthRequest, res: Response) => {
  const { id } = req.params as { id: string }

  try {
    const { title } = req.body as { title: string }

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' })
    }

    const chat = await Chat.findOneAndUpdate(
      { _id: id, userId: req.userId },
      { title: title.trim() },
      { new: true }
    )

    if (!chat) return res.status(404).json({ error: 'Chat not found' })

    await writeLog({
      userId: req.userId,
      action: 'RENAME_CHAT',
      status: 'success',
      method: 'PUT',
      path: `/api/chats/${id}`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { chatId: id, newTitle: title.trim() }
    })

    res.json({ id: chat.id, title: chat.title })
  } catch (err) {
    await writeLog({
      userId: req.userId,
      action: 'RENAME_CHAT',
      status: 'failed',
      method: 'PUT',
      path: `/api/chats/${id}`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { chatId: id, error: err instanceof Error ? err.message : String(err) }
    })
    res.status(500).json({ error: 'Failed to rename chat' })
  }
})

// Delete chat
router.delete('/:id', midLimiter, async (req: AuthRequest, res: Response) => {
  const { id } = req.params as { id: string }

  try {
    const chat = await Chat.findOneAndDelete({ _id: id, userId: req.userId })
    if (!chat) return res.status(404).json({ error: 'Chat not found' })

    await Message.deleteMany({ chatId: id })

    await writeLog({
      userId: req.userId,
      action: 'DELETE_CHAT',
      status: 'success',
      method: 'DELETE',
      path: `/api/chats/${id}`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { chatId: id, title: chat.title }
    })

    res.json({ message: 'Chat deleted' })
  } catch (err) {
    await writeLog({
      userId: req.userId,
      action: 'DELETE_CHAT',
      status: 'failed',
      method: 'DELETE',
      path: `/api/chats/${id}`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { chatId: id, error: err instanceof Error ? err.message : String(err) }
    })
    res.status(500).json({ error: 'Failed to delete chat' })
  }
})

// Search
router.get('/search/query', genLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query as { q: string }
    if (!q || !q.trim()) return res.json([])

    const userChats = await Chat.find({ userId: req.userId })
    const chatIds = userChats.map(c => c._id)

    const messages = await Message.find({
      chatId: { $in: chatIds },
      content: { $regex: q.trim(), $options: 'i' }
    })

    const results = messages.map(msg => {
      const parentChat = userChats.find(c => c._id.toString() === msg.chatId.toString())
      return {
        chatId: msg.chatId,
        chatTitle: parentChat ? parentChat.title : 'Untitled Chat',
        messageId: msg._id,
        content: msg.content,
        createdAt: msg.createdAt
      }
    })

    res.json(results)
  } catch (err) {
    res.status(500).json({ error: 'Search execution failed' })
  }
})

export default router