import { Router, Response } from 'express'
import multer from 'multer'
import authMiddleware, { AuthRequest } from '../middleware/auth'
import path from 'path'
import { uploadLimiter } from '../utils/ratelimitHelper'
import { writeLog } from '../utils/logger'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// 5-minute timeout for heavy RAG indexing — use AbortSignal.timeout() per-request
// (avoids the undici Agent constructor option mismatch that caused UND_ERR_INVALID_ARG)
const AI_UPLOAD_TIMEOUT_MS = 300_000

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
      body: formData,
      signal: AbortSignal.timeout(AI_UPLOAD_TIMEOUT_MS)
    })

    if (!response.ok) {
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
          pythonMessage: pythonDetail,
        }
      })

      return res.status(502).json({ error: 'File could not be processed by AI service' })
    }

    const ext = path.extname(req.file.originalname).toLowerCase()
    const isTextOrCode = ['.txt', '.md', '.json', '.js', '.ts', '.py', '.cpp', '.c', '.h', '.html', '.css', '.csv'].includes(ext)
    const isImage = req.file.mimetype.startsWith('image/')
    
    let content = `Uploaded file: ${req.file.originalname}`
    if (isTextOrCode) {
      content = req.file.buffer.toString('utf8')
    } else if (isImage) {
      content = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    }

    const fileInfo = {
      name: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      extension: ext
    }

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
      fileInfo,
      content
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
        error: err instanceof Error ? err.message : String(err),
      }
    })

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
      body: JSON.stringify({ filename, chat_id: chatId }),
      signal: AbortSignal.timeout(30_000)
    })

    if (!response.ok) {
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
          pythonMessage: pythonDetail,
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
        error: err instanceof Error ? err.message : String(err),
      }
    })

    res.status(500).json({ error: 'File deletion failed' })
  }
})

export default router