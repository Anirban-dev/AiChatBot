// src/routes/message.ts
import { Router, Request, Response } from 'express'
import { Message } from '../models/msg'
import { Chat } from '../models/chat'
import authMiddleware, { AuthRequest } from '../middleware/auth'
import OpenAI from 'openai'

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

  const client = new OpenAI({
    baseURL: process.env.AI_API, // http://localhost:12434/engines/v1
    apiKey: 'not-needed',
  })

  try {
    const chat = await Chat.findOne({ _id: req.params.chatId, userId: req.userId })
    if (!chat) return res.status(404).json({ error: 'Chat not found' })

    // Save user message
    const userMessage = await Message.create({
      chatId: req.params.chatId,
      role: 'user',
      content,
    })

    // Set streaming headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // Send user message first so frontend can display it
    res.write(`event: userMessage\ndata: ${JSON.stringify(userMessage)}\n\n`)

    const stream = await client.chat.completions.create({
      model: 'ai/gemma3:1B-Q4_K_M',
      messages: [{ role: 'user', content }],
      stream: true,
    })
    let fullContent = ''
    
    // SDK handles all parsing — just iterate
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || ''
      if (token) {
        fullContent += token
        res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`)
      }
    }

    // Save complete AI response to DB
    const assistantMessage = await Message.create({
      chatId: req.params.chatId,
      role: 'assistant',
      content: fullContent,
    })

    // Tell frontend stream is done
    res.write(`event: done\ndata: ${JSON.stringify(assistantMessage)}\n\n`)
    res.end()

  } catch (err) {
    console.error(err)
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed' })}\n\n`)
    res.end()
  }
})

export default router