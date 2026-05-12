import { Router, Response } from 'express'
import multer from 'multer'
import authMiddleware, { AuthRequest } from '../middleware/auth'
import { Message } from '../models/msg'
import path from 'path'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.use(authMiddleware)

router.post('/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }
  if (!req.body.chatId) {
    return res.status(400).json({ error: 'chatId is required' })
  }

  try {
    const AI_API = process.env.AI_API || 'http://localhost:8000/agent'
    
    // Use FormData to send file to Python
    const formData = new FormData()
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype })
    formData.append('file', blob, req.file.originalname)
    formData.append('chat_id', req.body.chatId || '')

    const response = await fetch(`${AI_API}/index`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      // Safely read the body as text first, then try to parse it as JSON
      const rawText = await response.text()
      let detail = rawText
      try {
        const parsed = JSON.parse(rawText)
        detail = parsed.detail || parsed.error || rawText
      } catch {
        // body wasn't JSON — use raw text as-is
      }
      throw new Error(detail || `AI backend returned ${response.status}`)
    }

    const fileMsg = await Message.create({
      chatId: req.body.chatId,
      role: 'user',
      content: `Uploaded file: ${req.file.originalname}`,
      fileInfo: {
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        extension: path.extname(req.file.originalname).toLowerCase()
      }
    })

    res.json({ 
      success: true, 
      message: 'File uploaded and indexed successfully',
      data: fileMsg
    })
  } catch (err: any) {
    console.error('File Upload Proxy Error:', err)
    res.status(500).json({ error: err.message || 'Internal Server Error' })
  }
})

router.post('/delete', async (req: AuthRequest, res: Response) => {
  const { filename } = req.body
  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' })
  }

  try {
    const AI_API = process.env.AI_API || 'http://localhost:8000/agent'
    const response = await fetch(`${AI_API}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename })
    })

    if (!response.ok) {
      throw new Error('Failed to delete from AI service')
    }

    res.json({ success: true, message: 'File removed from RAG' })
  } catch (err: any) {
    console.error('File Delete Error:', err)
    res.status(500).json({ error: err.message || 'Internal Server Error' })
  }
})

export default router
