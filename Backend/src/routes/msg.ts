// src/routes/message.ts
import { Router, Request, Response } from 'express'
import { Message } from '../models/msg'
import { Chat } from '../models/chat'
import authMiddleware, { AuthRequest } from '../middleware/auth'
import { midLimiter, strictLimiter } from '../utils/ratelimitHelper'

const router = Router({ mergeParams: true }) 
router.use(authMiddleware)


// Get all messages for a chat
router.get('/', midLimiter, async (req: Request<{ chatId: string }>, res: Response) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId }).sort({ createdAt: 1 })
    res.json(messages)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})


// Send a message
router.post('/', strictLimiter, async (req: AuthRequest<{ chatId: string }>, res: Response) => {
  const { content } = req.body
  const { chatId } = req.params

  if (!content) {
    return res.status(400).json({ error: 'Content is required' })
  }

  try {
    const chat = await Chat.findOne({ _id: chatId, userId: req.userId })
    if (!chat) return res.status(404).json({ error: 'Chat not found' })

    // 1. Save user message immediately
    const userMessage = await Message.create({
      chatId,
      role: 'user',
      content,
    })

    // 2. Set streaming headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    if (res.flushHeaders) res.flushHeaders(); 

    // 3. Inform frontend the user message was saved
    res.write(`event: userMessage\ndata: ${JSON.stringify(userMessage)}\n\n`)

    // Get last 10 messages
    const previousMessages = await Message.find({ chatId: chatId })
      .sort({ createdAt: 1 })
      .limit(10);

    // 4. Call Python RAG API
    const response = await fetch(`${process.env.AI_API}/chat`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Connection': 'keep-alive' // Tell Python to keep the door open
      },
      body: JSON.stringify({ 
        message: content,
        chat_id: chatId,
        history: previousMessages.map(m => ({
          role: m.role,
          content: m.content
        }))
      }),
    });

    // Safety check: ensure the body exists
    if (!response.body) {
      throw new Error('AI API returned an empty body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    // 5. The Streaming Loop
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode current chunk
      const chunk = decoder.decode(value, { stream: true });
      fullContent += chunk;

      // Send the token to the frontend
      res.write(`event: token\ndata: ${JSON.stringify({ token: chunk })}\n\n`);
    }

    // 6. Save complete AI response to DB
    const assistantMessage = await Message.create({
      chatId: req.params.chatId,
      role: 'assistant',
      content: fullContent,
    })

    // 7. Tell frontend stream is done
    res.write(`event: done\ndata: ${JSON.stringify(assistantMessage)}\n\n`)
    res.end()

  } catch (err) {
    console.error("Streaming Error:", err);
    if (!res.headersSent) {
        return res.status(500).json({ error: 'Internal Server Error' });
    }
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Stream interrupted' })}\n\n`)
    res.end()
  }
})



// Stop a running AI generation
router.post('/stop', midLimiter, async (req: AuthRequest<{ chatId: string }>, res: Response) => {
  const { chatId } = req.params;

  try {
    // 1. Tell Python to stop the specific task    
    const response = await fetch(`${process.env.AI_API}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId })
    });

    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to stop the AI' });
    }

    res.json({ success: true, message: 'Stream stop signal sent' });
  } catch (err) {
    console.error("Stop Error:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router