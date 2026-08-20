// src/routes/file.ts
import { Router, Response } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import authMiddleware, { AuthRequest } from '../middleware/auth'
import path from 'path'
import { categoryUploadLimiter } from '../middleware/uploadRateLimiter'
import { writeLog } from '../utils/logger'
import { AiProvider } from '../models/aiProvider'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

const AI_UPLOAD_TIMEOUT_MS = 300_000
const IMAGE_MAX_WIDTH = 480
const IMAGE_WEBP_QUALITY = 35

router.use(authMiddleware)

router.post('/upload', upload.single('file'), categoryUploadLimiter, async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  if (!req.body.chatId) return res.status(400).json({ error: 'chatId is required' })

  // ── Pre-flight: AI must be configured to index/process attachments ─────────
  try {
    const enabledCount = await AiProvider.countDocuments({ enabled: true })
    if (enabledCount === 0) {
      await writeLog({
        userId: req.userId, action: 'FILE_UPLOAD', status: 'failed', method: 'POST',
        path: '/api/files/upload',
        ipAddress: req.ip || req.socket.remoteAddress, userAgent: req.headers['user-agent'],
        latency: 0,
        details: { chatId: req.body.chatId, filename: req.file.originalname, stage: 'ai_not_configured' },
      })
      return res.status(503).json({
        error: 'AI APIs are not configured yet. Ask an administrator to add API keys in the Admin Dashboard → AI APIs.',
      })
    }
  } catch (err) {
    console.error('[file.upload] Failed to check AI provider config:', err)
    return res.status(500).json({ error: 'Failed to check AI provider configuration.' })
  }

  const startTime = Date.now()
  const { chatId } = req.body

  const originalExt = path.extname(req.file.originalname).toLowerCase()
  const isTextOrCode = ['.txt', '.md', '.json', '.js', '.ts', '.py', '.cpp', '.c', '.h', '.html', '.css', '.csv'].includes(originalExt)
  const isImage = req.file.mimetype.startsWith('image/')
  const category: 'text' | 'image' | 'other' = isTextOrCode ? 'text' : isImage ? 'image' : 'other'

  // ── Build what gets PERSISTED (Mongo `file` string / frontend) ─────────
  // Only ever READS req.file.buffer, never mutates it. The AI/RAG call
  // below always uses the original, untouched buffer — compression here,
  // or skipping "other" file data entirely, can never affect what the
  // embedding model receives.
  let file: string | undefined = undefined
  let storedMimeType = req.file.mimetype
  let storedExt = originalExt

  if (category === 'text') {
    file = req.file.buffer.toString('utf8')
  } else if (category === 'image') {
    try {
      const compressed = await sharp(req.file.buffer)
        .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: IMAGE_WEBP_QUALITY })
        .toBuffer()
      file = `data:image/webp;base64,${compressed.toString('base64')}`
      storedMimeType = 'image/webp'
      storedExt = '.webp'
    } catch (err) {
      // Compression failing must NEVER drop the upload — degrade to
      // metadata-only, same as an "other" file. fileInfo below still
      // reflects the ORIGINAL type in that case, not webp.
      console.error('[file.upload] Image compression failed, keeping metadata only:', err)
      file = undefined
      storedMimeType = req.file.mimetype
      storedExt = originalExt
    }
  }
  // category === 'other' → file stays undefined on purpose. No pdf/doc/
  // xlsx/video bytes are ever persisted — just fileInfo metadata below.

  const fileInfo = {
    name: req.file.originalname,
    size: req.file.size,
    mimeType: file !== undefined ? storedMimeType : req.file.mimetype,
    extension: file !== undefined ? storedExt : originalExt,
  }

  // ── AI/RAG indexing — ALWAYS the original, unmodified buffer ───────────
  let indexed = true
  let indexWarning: string | undefined

  try {
    const AI_API = process.env.AI_API || 'http://localhost:8000/agent'
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype })
    formData.append('file', blob, req.file.originalname)
    formData.append('chat_id', chatId)

    const response = await fetch(`${AI_API}/upload`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(AI_UPLOAD_TIMEOUT_MS),
    })

    if (!response.ok) {
      const rawText = await response.text()
      let pythonDetail = rawText
      try {
        const parsed = JSON.parse(rawText)
        pythonDetail = parsed.detail || parsed.error || rawText
      } catch { }
      indexed = false
      indexWarning = `AI indexing service returned ${response.status}: ${pythonDetail}`
    }
  } catch (err) {
    indexed = false
    indexWarning = err instanceof Error ? err.message : String(err)
  }

  if (!indexed) {
    console.warn(`[file.upload] RAG indexing failed for ${req.file.originalname} (chat ${chatId}): ${indexWarning}`)
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
    details: { chatId, filename: req.file.originalname, fileSize: req.file.size, mimeType: req.file.mimetype, extension: originalExt, category, indexed, indexWarning },
  })

  res.json({
    success: true,
    message: indexed ? 'File uploaded and indexed successfully' : 'File saved, but AI indexing is currently unavailable',
    fileInfo,     // metadata only
    file,         // full text | compressed webp data-URI | undefined
    indexed,
    indexWarning,
  })
})

router.post('/upload', upload.single('file'), categoryUploadLimiter, async (req: AuthRequest, res: Response) => {
  const { filename, chatId } = req.body
  if (!filename) return res.status(400).json({ error: 'Filename is required' })
  if (!chatId) return res.status(400).json({ error: 'chatId is required' })

  const startTime = Date.now()

  try {
    const AI_API = process.env.AI_API || 'http://localhost:8000/agent'
    const response = await fetch(`${AI_API}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, chat_id: chatId }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      const rawText = await response.text()
      let pythonDetail = rawText
      try {
        const parsed = JSON.parse(rawText)
        pythonDetail = parsed.detail || parsed.error || rawText
      } catch { }

      await writeLog({
        userId: req.userId, action: 'FILE_DELETE', status: 'failed', method: 'POST',
        path: '/api/files/delete',
        ipAddress: req.ip || req.socket.remoteAddress, userAgent: req.headers['user-agent'],
        latency: Date.now() - startTime,
        details: { chatId, filename, stage: 'python_api_error', httpStatus: response.status, pythonMessage: pythonDetail },
      })
      return res.json({ success: true, message: 'File removed (RAG cleanup may be incomplete)' })
    }

    await writeLog({
      userId: req.userId, action: 'FILE_DELETE', status: 'success', method: 'POST',
      path: '/api/files/delete',
      ipAddress: req.ip || req.socket.remoteAddress, userAgent: req.headers['user-agent'],
      latency: Date.now() - startTime,
      details: { chatId, filename },
    })

    res.json({ success: true, message: 'File removed from RAG' })
  } catch (err) {
    console.error('File Delete Error:', err)
    await writeLog({
      userId: req.userId, action: 'FILE_DELETE', status: 'failed', method: 'POST',
      path: '/api/files/delete',
      ipAddress: req.ip || req.socket.remoteAddress, userAgent: req.headers['user-agent'],
      latency: Date.now() - startTime,
      details: { chatId, filename, stage: 'middleware_exception', error: err instanceof Error ? err.message : String(err) },
    })
    res.json({ success: true, message: 'File removed (RAG cleanup may be incomplete)' })
  }
})

export default router