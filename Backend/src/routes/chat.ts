import { Router, Response } from 'express'
import { Chat } from '../models/chat'
import { Message } from '../models/msg'
import authMiddleware, { AuthRequest } from '../middleware/auth'
import { genLimiter, midLimiter, strictLimiter, vgenLimiter } from '../utils/ratelimitHelper'

const router = Router()

router.use(authMiddleware)

// Create chat
router.post('/', strictLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const count = await Chat.countDocuments({ userId: req.userId })
    const chat = await Chat.create({
      title: `New Chat`,
      userId: req.userId
    })
    res.json({ id: chat.id, title: chat.title })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create chat' })
  }
})

// Get all chats — FIXED: Now includes createdAt
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
  try {
    const { title } = req.body as { title: string }
    
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' })
    }

    const chat = await Chat.findOneAndUpdate(
      { _id: (req.params as { id: string }).id, userId: req.userId },
      { title: title.trim() },
      { new: true } // returns the updated document
    )

    if (!chat) return res.status(404).json({ error: 'Chat not found' })

    res.json({ id: chat.id, title: chat.title })
  } catch (err) {
    res.status(500).json({ error: 'Failed to rename chat' })
  }
})

// Delete chat
router.delete('/:id', midLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const chat = await Chat.findOneAndDelete({ _id: (req.params as { id: string }).id, userId: req.userId })
    if (!chat) return res.status(404).json({ error: 'Chat not found' })

    // Delete all messages of this chat too
    await Message.deleteMany({ chatId: (req.params as { id: string }).id })

    res.json({ message: 'Chat deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete chat' })
  }
})

router.get('/search/query', genLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query as { q: string }
    if (!q || !q.trim()) return res.json([])

    // 1. Get all chats belonging to this user first (for security)
    const userChats = await Chat.find({ userId: req.userId })
    const chatIds = userChats.map(c => c._id)

    // 2. Find messages matching the query inside the user's chats
    const messages = await Message.find({
      chatId: { $in: chatIds },
      content: { $regex: q.trim(), $options: 'i' } // Case-insensitive exact text fragment matching
    })

    // 3. Map results to include the chat name and matching message content region
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