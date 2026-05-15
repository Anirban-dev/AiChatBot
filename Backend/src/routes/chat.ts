import { Router, Response } from 'express'
import { Chat } from '../models/chat'
import { Message } from '../models/msg'
import authMiddleware, { AuthRequest } from '../middleware/auth'
import { genLimiter, midLimiter, strictLimiter, vgenLimiter } from '../utils/ratelimitHelper'

const router = Router()

router.use(authMiddleware)

// Rate limit helper

// Create chat
router.post('/', strictLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const count = await Chat.countDocuments({ userId: req.userId })
    const chat = await Chat.create({
      title: `Chat ${count}`,
      userId: req.userId
    })
    res.json({ id: chat.id, title: chat.title })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create chat' })
  }
})

// Get all chats
router.get('/allchats', genLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const chats = await Chat.find({ userId: req.userId }).sort({ createdAt: -1 })
    res.json(chats.map(c => ({ id: c.id, title: c.title })))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chats' })
  }
})

// Get chat
router.get('/:id', vgenLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const chat = await Chat.findById((req.params as { id: string }).id,)
    if (!chat) return res.status(404).json({ error: 'Chat not found' })
    res.json({ id: chat.id, title: chat.title })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chat' })
  }
})

router.delete('/:id', midLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const chat = await Chat.findOneAndDelete({ _id: (req.params as { id: string }).id, userId: req.userId })
    if (!chat) return res.status(404).json({ error: 'Chat not found' })

    // Delete all messages of this chat too
    await Message.deleteMany({ chatId: (req.params as { id: string }).id, })

    res.json({ message: 'Chat deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete chat' })
  }
})

export default router