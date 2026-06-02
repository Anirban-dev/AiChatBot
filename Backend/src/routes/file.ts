import { Router, Response } from 'express'
import multer from 'multer'
import authMiddleware, { AuthRequest } from '../middleware/auth'
import { Message } from '../models/msg'
import path from 'path'
import { uploadLimiter } from '../utils/ratelimitHelper'
import { writeLog } from '../utils/logger'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.use(authMiddleware)

router.post('/upload', uploadLimiter, upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }
  if (!req.body.chatId) {
    return res.status(400).json({ error: 'chatId is required' })
  }

  const startTime = Date.now()
  const { chatId } = req.body

  try {
    const AI_API = process.env.AI_API || 'http://localhost:8000/agent'

    const formData = new FormData()
    const blob = new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype })
    formData.append('file', blob, req.file.originalname)
    formData.append('chat_id', chatId)

    const response = await fetch(`${AI_API}/upload`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      // Read the real error for logging only — never forward to frontend
      const rawText = await response.text()
      let pythonDetail = rawText
      try {
        const parsed = JSON.parse(rawText)
        pythonDetail = parsed.detail || parsed.error || rawText
      } catch { /* not JSON, use raw text */ }

      await writeLog({
        userId: req.userId,
        action: 'FILE_UPLOAD',
        status: 'failed',
        method: 'POST',
        path: '/api/files/upload',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        latency: Date.now() - startTime,
        details: {
          chatId,
          filename: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          stage: 'python_api_error',
          httpStatus: response.status,
          pythonMessage: pythonDetail,  // admin only
        }
      })

      // Generic message to frontend — no Python internals
      return res.status(502).json({ error: 'File could not be processed by AI service' })
    }

    const fileMsg = await Message.create({
      chatId,
      role: 'user',
      content: `Uploaded file: ${req.file.originalname}`,
      fileInfo: {
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        extension: path.extname(req.file.originalname).toLowerCase()
      }
    })

    await writeLog({
      userId: req.userId,
      action: 'FILE_UPLOAD',
      status: 'success',
      method: 'POST',
      path: '/api/files/upload',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      latency: Date.now() - startTime,
      details: {
        chatId,
        filename: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        extension: path.extname(req.file.originalname).toLowerCase(),
      }
    })

    res.json({
      success: true,
      message: 'File uploaded and indexed successfully',
      data: fileMsg
    })
  } catch (err) {
    console.error('File Upload Proxy Error:', err)

    await writeLog({
      userId: req.userId,
      action: 'FILE_UPLOAD',
      status: 'failed',
      method: 'POST',
      path: '/api/files/upload',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      latency: Date.now() - startTime,
      details: {
        chatId,
        filename: req.file.originalname,
        stage: 'middleware_exception',
        error: err instanceof Error ? err.message : String(err),  // admin only
      }
    })

    // Generic message to frontend
    res.status(500).json({ error: 'File upload failed' })
  }
})

router.post('/delete', uploadLimiter, async (req: AuthRequest, res: Response) => {
  const { filename, chatId } = req.body

  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' })
  }

  if (!chatId) {
    return res.status(400).json({ error: 'chatId is required' })
  }

  const startTime = Date.now()

  try {
    const AI_API = process.env.AI_API || 'http://localhost:8000/agent'

    const response = await fetch(`${AI_API}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, chat_id: chatId })
    })

    if (!response.ok) {
      // Read Python error for logging only
      const rawText = await response.text()
      let pythonDetail = rawText
      try {
        const parsed = JSON.parse(rawText)
        pythonDetail = parsed.detail || parsed.error || rawText
      } catch { /* not JSON */ }

      await writeLog({
        userId: req.userId,
        action: 'FILE_DELETE',
        status: 'failed',
        method: 'POST',
        path: '/api/files/delete',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        latency: Date.now() - startTime,
        details: {
          chatId,
          filename,
          stage: 'python_api_error',
          httpStatus: response.status,
          pythonMessage: pythonDetail,  // admin only
        }
      })

      return res.status(502).json({ error: 'Failed to remove file from AI service' })
    }

    await writeLog({
      userId: req.userId,
      action: 'FILE_DELETE',
      status: 'success',
      method: 'POST',
      path: '/api/files/delete',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      latency: Date.now() - startTime,
      details: { chatId, filename }
    })

    res.json({ success: true, message: 'File removed from RAG' })
  } catch (err) {
    console.error('File Delete Error:', err)

    await writeLog({
      userId: req.userId,
      action: 'FILE_DELETE',
      status: 'failed',
      method: 'POST',
      path: '/api/files/delete',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      latency: Date.now() - startTime,
      details: {
        chatId,
        filename,
        stage: 'middleware_exception',
        error: err instanceof Error ? err.message : String(err),  // admin only
      }
    })

    res.status(500).json({ error: 'File deletion failed' })
  }
})

export default router