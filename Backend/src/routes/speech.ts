// src/routes/speech.ts
import { Router, Response } from 'express'
import multer from 'multer'
import authMiddleware, { AuthRequest } from '../middleware/auth'
import { midLimiter, genLimiter } from '../utils/ratelimitHelper'
import { AiProvider } from '../models/aiProvider'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

router.use(authMiddleware)

const AI_API = process.env.AI_API || 'http://localhost:8000/agent'
const SPEECH_TIMEOUT_MS = 120_000

// ── GET /api/speech/status — is a Speech (ASR) provider configured? ──────────
router.get('/status', genLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const count = await AiProvider.countDocuments({ tier: 'speechllm', enabled: true })
    res.json({ configured: count > 0, count })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to determine speech config status' })
  }
})

// ── POST /api/speech/stt — forward audio for ASR transcription ───────────────
router.post('/stt', upload.single('file'), midLimiter, async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' })

  // ── Pre-flight: Speech (ASR) provider must be configured ──────────────────
  try {
    const speechLlmCount = await AiProvider.countDocuments({ tier: 'speechllm', enabled: true })
    if (speechLlmCount === 0) {
      return res.status(503).json({
        error: 'Speech-to-text is not configured yet. Ask an administrator to add a Speech (ASR) provider under Admin → AI APIs.',
      })
    }
  } catch (err) {
    console.error('[speech.stt] Failed to check speech provider config:', err)
    return res.status(500).json({ error: 'Failed to check AI provider configuration.' })
  }

  const startTime = Date.now()

  try {
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype })
    const filename = req.file.originalname || `speech_${Date.now()}.webm`
    formData.append('file', blob, filename)

    const response = await fetch(`${AI_API}/stt`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
    })

    if (!response.ok) {
      const rawText = await response.text()
      let detail = rawText
      try {
        const parsed = JSON.parse(rawText)
        detail = parsed.detail || parsed.error || rawText
      } catch { }
      return res.status(response.status).json({ error: detail || `Speech service returned ${response.status}` })
    }

    const json = (await response.json()) as { text?: string }
    res.json({ success: true, text: json.text || '' })
  } catch (err) {
    console.error('[speech.stt]', err)
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) })
  } finally {
    console.log(`[speech.stt] ${req.file.originalname} (${req.file.size} bytes) → ${Date.now() - startTime}ms`)
  }
})

export default router