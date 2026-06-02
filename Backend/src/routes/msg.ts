// src/routes/msg.ts
import { Router, Request, Response } from 'express'
import { Message }    from '../models/msg'
import { Chat }       from '../models/chat'
import authMiddleware, { AuthRequest } from '../middleware/auth'
import { midLimiter } from '../utils/ratelimitHelper'
import { writeLog }   from '../utils/logger'
import { redis }      from '../utils/redis' // 🌟 Added Redis client import
import { TIER_DEFAULTS } from './admin/users' // 🌟 Added Tier Defaults sync import

const router = Router({ mergeParams: true })
router.use(authMiddleware)

// ─── GET / — fetch all messages for a chat ────────────────────────────────────
router.get('/', midLimiter, async (req: Request<{ chatId: string }>, res: Response) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId }).sort({ createdAt: 1 })
    res.json(messages)
  } catch {
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

// ─── POST / — send a message and stream the AI response ──────────────────────
router.post('/', midLimiter, async (req: AuthRequest<{ chatId: string }>, res: Response) => {
  const { content, model = 'small' } = req.body
  const { chatId } = req.params

  if (!content) return res.status(400).json({ error: 'Content is required' })

  // Map incoming model strings to the four valid system tiers
  const validTiers = ['small', 'large', 'thinking', 'critiq']
  const targetTier = validTiers.includes(model) ? model : 'small'

  const userTier  = (req as any).userTier ?? 'free'
  const userId    = req.userId!
  const startTime = Date.now()

  try {
    const chat = await Chat.findOne({ _id: chatId, userId })
    if (!chat) return res.status(404).json({ error: 'Chat not found' })

    // ─── 🌟 REDIS HOURLY LIMIT PRE-CHECK ──────────────────────────────────────
    const now = new Date()
    const stamp = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
      String(now.getUTCHours()).padStart(2, '0'),
    ].join('-')

    const tphKey = `usage:tph:${userId}:${stamp}`
    const rphKey = `usage:rph:${userId}:${stamp}`

    // Pull custom manual limits and current hourly tracking aggregates
    const [rawLimits, tphRaw, rphRaw] = await Promise.all([
      redis.get(`user_limits:${userId}`),
      redis.get(tphKey),
      redis.get(rphKey),
    ])

    let limits = TIER_DEFAULTS[userTier] ?? TIER_DEFAULTS.free
    if (rawLimits) {
      try { limits = JSON.parse(rawLimits) } catch { /* fallback to defaults */ }
    }

    const tokensUsedThisHour = parseInt(tphRaw ?? '0', 10)
    const requestsUsedThisHour = parseInt(rphRaw ?? '0', 10)

    if (requestsUsedThisHour >= limits.rpm) {
      return res.status(429).json({ error: 'Hourly request limit reached. Please wait until the next hour.' })
    }
    if (tokensUsedThisHour >= limits.tpm) {
      return res.status(429).json({ error: 'Hourly token quota consumed. Please wait until the next hour.' })
    }
    // ──────────────────────────────────────────────────────────────────────────

    // 1. Save user message
    const userMessage = await Message.create({ chatId, role: 'user', content })

    // 2. Set streaming headers
    res.setHeader('Content-Type',  'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection',    'keep-alive')
    if (res.flushHeaders) res.flushHeaders()

    res.write(`event: userMessage\ndata: ${JSON.stringify(userMessage)}\n\n`)

    // 3. Fetch recent context
    const previousMessages = await Message.find({ chatId })
      .sort({ createdAt: 1 })
      .limit(10)

    // 4. Call the Python AI service
    const response = await fetch(`${process.env.AI_API}/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
      body: JSON.stringify({
        message:   content,
        chat_id:   chatId,
        mode:      targetTier,
        user_id:   userId,
        user_tier: userTier,
        history:   previousMessages.map(m => ({ role: m.role, content: m.content })),
      }),
    })

    // ── 429: quota exhausted (from our RateLimitExceeded raise in litellm_router.py)
    if (response.status === 429) {
      let quotaMessage = `Rate limit reached for the '${targetTier}' model. Please wait a moment before retrying.`
      try {
        const body = await response.json()
        if (body?.detail)  quotaMessage = body.detail
        if (body?.message) quotaMessage = body.message
      } catch { /* not JSON */ }

      await writeLog({
        userId,
        action:    'AI_CHAT',
        status:    'failed',
        method:    'POST',
        path:      `/api/chats/${chatId}/msgs`,
        ipAddress: req.ip ?? req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        latency:   Date.now() - startTime,
        details:   { chatId, stage: 'quota_exhausted', userTier, targetTier },
      })

      res.write(`event: error\ndata: ${JSON.stringify({ type: 'QUOTA_EXHAUSTED', message: quotaMessage })}\n\n`)
      return res.end()
    }

    // ── Any other non-2xx error
    if (!response.ok) {
      let pythonError = `Python API ${response.status}`
      try {
        const body = await response.json()
        pythonError = body?.detail ?? body?.error ?? pythonError
      } catch { /* not JSON */ }

      await writeLog({
        userId,
        action:    'AI_CHAT',
        status:    'failed',
        method:    'POST',
        path:      `/api/chats/${chatId}/msgs`,
        ipAddress: req.ip ?? req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        latency:   Date.now() - startTime,
        details:   { chatId, stage: 'python_api_error', httpStatus: response.status, pythonMessage: pythonError },
      })

      res.write(`event: error\ndata: ${JSON.stringify({ message: 'AI service currently unavailable' })}\n\n`)
      return res.end()
    }

    if (!response.body) throw new Error('AI API returned an empty body')

    // 5. Stream the response
    const reader  = response.body.getReader()
    const decoder = new TextDecoder()

    let fullContent    = ''
    let buffer         = ''
    let activeToolCalls: Record<string, unknown>[] = []

    function parsePythonEvent(raw: string): { event?: string; data?: string } {
      const lines  = raw.split('\n')
      const result: { event?: string; data?: string } = {}
      for (const line of lines) {
        if (line.startsWith('event:')) result.event = line.slice(6).trim()
        if (line.startsWith('data:'))  result.data  = line.slice(5).trim()
      }
      return result
    }

    function isToolCallPayload(data: string): boolean {
      try {
        const parsed = JSON.parse(data)
        return !!(parsed?.tool_call || parsed?.type === 'tool_call' || parsed?.functionCall)
      } catch { return false }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        if (!part.trim()) continue
        const { event, data } = parsePythonEvent(part)

        if (event === 'error') {
          let pythonErrMsg        = data ?? 'Unknown stream error'
          let isMidpointQuotaLeak = false
          try {
            const parsed = JSON.parse(data ?? '{}')
            pythonErrMsg = parsed?.message ?? pythonErrMsg
            if (parsed?.type === 'QUOTA_EXHAUSTED' || pythonErrMsg.toLowerCase().includes('quota')) {
              isMidpointQuotaLeak = true
            }
          } catch { /* ok */ }

          await writeLog({
            userId,
            action:    'AI_CHAT',
            status:    'failed',
            method:    'POST',
            path:      `/api/chats/${chatId}/msgs`,
            ipAddress: req.ip ?? req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            latency:   Date.now() - startTime,
            details:   { chatId, stage: 'python_stream_error', pythonMessage: pythonErrMsg, targetTier },
          })

          res.write(`event: error\ndata: ${JSON.stringify({
            type:    isMidpointQuotaLeak ? 'QUOTA_EXHAUSTED' : 'STREAM_INTERRUPTED',
            message: isMidpointQuotaLeak ? pythonErrMsg : 'Stream was unexpectedly interrupted.',
          })}\n\n`)
          continue
        }

        if (data && isToolCallPayload(data)) {
          try {
            const toolPayload = JSON.parse(data)
            const tc          = toolPayload.tool_call ?? toolPayload.functionCall ?? toolPayload
            const toolName    = tc.name ?? tc.functionName ?? 'unknown'
            const toolStatus  = toolPayload.status ?? 'running'
            activeToolCalls.push(tc)

            writeLog({
              userId,
              action:    'AI_TOOL_CALL',
              status:    'success',
              method:    'POST',
              path:      `/api/chats/${chatId}/msgs`,
              ipAddress: req.ip ?? req.socket.remoteAddress,
              userAgent: req.headers['user-agent'],
              latency:   Date.now() - startTime,
              details:   { chatId, toolName, toolStatus },
            }).catch(e => console.error('Tool call log error:', e))

            res.write(`event: tool\ndata: ${JSON.stringify({ tool: toolName, status: toolStatus })}\n\n`)
          } catch (e) {
            console.error('Failed to parse tool call payload:', e)
          }
          continue
        }

        if (data) {
          let token = data
          try {
            const parsed = JSON.parse(data)
            if (typeof parsed?.token === 'string') token = parsed.token
          } catch { /* raw text */ }

          fullContent += token
          res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`)
        }
      }
    }

    // 6. Persist completed response
    if (!fullContent.trim()) {
      res.write(`event: error\ndata: ${JSON.stringify({
        type:    'EMPTY_RESPONSE',
        message: 'The AI returned an empty response. Please try again.',
      })}\n\n`)
      return res.end()
    }

    const assistantMessage = await Message.create({
      chatId: req.params.chatId,
      role:    'assistant',
      content: fullContent,
    })

    // ─── 🌟 REDIS HOURLY TRACKING COMMIT (Post-Stream) ────────────────────────
    // Generate character-to-token metric estimation rules (approx. 4 chars per token)
    const totalEstimatedTokens = Math.ceil((content.length + fullContent.length) / 4)
    
    // Compute total seconds remaining until the turn of the next UTC hour boundary
    const secondsUntilNextHour = 3600 - (now.getUTCMinutes() * 60 + now.getUTCSeconds())
    const redisTTL = secondsUntilNextHour + 600 // Adding a safe 10-minute historical viewing window buffer

    await redis.multi()
      .incrby(tphKey, totalEstimatedTokens)
      .incr(rphKey)
      .expire(tphKey, redisTTL)
      .expire(rphKey, redisTTL)
      .exec()
    // ──────────────────────────────────────────────────────────────────────────

    res.write(`event: done\ndata: ${JSON.stringify(assistantMessage)}\n\n`)
    res.end()

    await writeLog({
      userId,
      action:    'AI_CHAT',
      status:    'success',
      method:    'POST',
      path:      `/api/chats/${chatId}/msgs`,
      ipAddress: req.ip ?? req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      latency:   Date.now() - startTime,
      details:   {
        chatId,
        promptLength:   content.length,
        responseLength: fullContent.length,
        toolCallCount:  activeToolCalls.length,
        toolsUsed:      activeToolCalls.map((tc: any) => tc.name ?? tc.functionName ?? 'unknown'),
      },
    })

  } catch (err) {
    const latency = Date.now() - startTime
    console.error('Core Streaming Loop Exception:', err)

    await writeLog({
      userId:    req.userId,
      action:    'AI_CHAT',
      status:    'failed',
      method:    'POST',
      path:      `/api/chats/${chatId}/msgs`,
      ipAddress: req.ip ?? req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      latency,
      details:   {
        chatId,
        stage: 'middleware_exception',
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
    })

    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal Server Error' })
    }
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Stream interrupted' })}\n\n`)
    res.end()
  }
})

// ─── POST /stop ───────────────────────────────────────────────────────────────
router.post('/stop', midLimiter, async (req: AuthRequest<{ chatId: string }>, res: Response) => {
  const { chatId } = req.params
  try {
    const response = await fetch(`${process.env.AI_API}/stop`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId }),
    })
    if (!response.ok) return res.status(500).json({ error: 'Failed to terminate the engine stream thread' })
    res.json({ success: true, message: 'Stream stop signal sent' })
  } catch (err) {
    console.error('Stop Endpoint Error:', err)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

export default router