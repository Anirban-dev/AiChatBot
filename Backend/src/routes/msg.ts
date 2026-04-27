// src/routes/message.ts
import { Router, Request, Response } from 'express'
import { Message } from '../models/msg'
import { Chat } from '../models/chat'
import authMiddleware, { AuthRequest } from '../middleware/auth'

const router = Router({ mergeParams: true }) // to access :chatId from parent router
router.use(authMiddleware)

// Get all messages for a chat
router.get('/', async (req: Request<{ chatId: string }>, res: Response) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId }).sort({ createdAt: 1 })
    res.json(messages)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

// Send a message
router.post('/', async (req: AuthRequest<{ chatId: string }>, res: Response) => {
  const { content } = req.body

  if (!content) {
    return res.status(400).json({ error: 'content and role are required' })
  }

  try {
    const chat = await Chat.findOne({ _id: req.params.chatId, userId: req.userId })
    if (!chat) return res.status(404).json({ error: 'Chat not found' })

    // Save user message
    const userMessage = await Message.create({
      chatId: req.params.chatId,
      role: 'user',
      content,
    })

    // TODO: replace with real AI API call later
    const aiContent = 'This is a placeholder response.'

    // Save AI response
    const assistantMessage = await Message.create({
      chatId: req.params.chatId,
      role: 'assistant',
      content: aiContent,
    })

    res.json({ userMessage, assistantMessage })
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' })
  }
})

export default router