// src/routes/message.ts
import { Router, Request, Response } from 'express'
import { Message } from '../models/msg'
import { Chat } from '../models/chat'

const router = Router({ mergeParams: true }) // to access :chatId from parent router

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
router.post('/', async (req: Request<{ chatId: string }>, res: Response) => {
  const { content, role } = req.body

  if (!content || !role) {
    return res.status(400).json({ error: 'content and role are required' })
  }

  try {
    const chat = await Chat.findById(req.params.chatId)
    if (!chat) return res.status(404).json({ error: 'Chat not found' })

    const message = await Message.create({
      chatId: req.params.chatId,
      userId: chat.userId,
      role,
      content,
    })

    res.json(message)
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' })
  }
})

export default router