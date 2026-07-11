// src/routes/msg.ts
import { Router, Request, Response } from 'express'
import { Message }    from '../models/msg'
import { Chat }       from '../models/chat'
import { User }       from '../models/user'
import authMiddleware, { AuthRequest } from '../middleware/auth'
import { midLimiter } from '../utils/ratelimitHelper'
import { writeLog }   from '../utils/logger'
import { redis }      from '../utils/redis' // 🌟 Added Redis client import
import { TIER_DEFAULTS } from './admin/users' // 🌟 Added Tier Defaults sync import
import { LlmLog } from '../models/llmLog'


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
  const { content, model = 'small', fileInfo, fileContent } = req.body
  const { chatId } = req.params

  if (!content && !fileContent) return res.status(400).json({ error: 'Content is required' })

  const validTiers = ['small', 'large', 'thinking', 'critiq']
  const targetTier = validTiers.includes(model) ? model : 'small'

  const userTier  = (req as any).userTier ?? 'free'
  const userId    = req.userId!
  const startTime = Date.now()
  let isFinished = false

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

    // Fetch user limits from MongoDB and current hourly tracking from Redis
    const [userDoc, tphRaw, rphRaw] = await Promise.all([
      User.findById(userId).select('tpm rpm'),
      redis.get(tphKey),
      redis.get(rphKey),
    ])

    const limits = {
      tpm: (userDoc as any)?.tpm ?? TIER_DEFAULTS[userTier]?.tpm ?? TIER_DEFAULTS.free.tpm,
      rpm: (userDoc as any)?.rpm ?? TIER_DEFAULTS[userTier]?.rpm ?? TIER_DEFAULTS.free.rpm,
    }

    const tokensUsedThisHour = parseInt(tphRaw ?? '0', 10)
    const requestsUsedThisHour = parseInt(rphRaw ?? '0', 10)

    if (requestsUsedThisHour >= limits.rpm) {
      await writeLog({
        userId,
        action: 'AI_CHAT',
        status: 'failed',
        method: 'POST',
        path: `/api/chats/${chatId}/msgs`,
        ipAddress: req.ip ?? req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        latency: Date.now() - startTime,
        details: { chatId, reason: 'RPM limit reached', stage: 'rate_limiting_pre_check', limit: limits.rpm, used: requestsUsedThisHour }
      })
      return res.status(429).json({ error: 'Hourly request limit reached. Please wait until the next hour.' })
    }
    if (tokensUsedThisHour >= limits.tpm) {
      await writeLog({
        userId,
        action: 'AI_CHAT',
        status: 'failed',
        method: 'POST',
        path: `/api/chats/${chatId}/msgs`,
        ipAddress: req.ip ?? req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        latency: Date.now() - startTime,
        details: { chatId, reason: 'TPM limit reached', stage: 'rate_limiting_pre_check', limit: limits.tpm, used: tokensUsedThisHour }
      })
      return res.status(429).json({ error: 'Hourly token quota consumed. Please wait until the next hour.' })
    }
    // ──────────────────────────────────────────────────────────────────────────

    // 1. Fetch recent context (retrieve last 10 messages in reverse chronological order)
    const previousMessages = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .limit(10)
    // Reverse them to restore correct chronological order for the LLM context
    previousMessages.reverse()

    // 2. Save user message
    const userMessage = await Message.create({
      chatId,
      role: 'user',
      content: fileContent || content,
      text: fileContent ? content : undefined,
      fileInfo: fileInfo
    })

    // 3. Set streaming headers
    res.setHeader('Content-Type',  'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection',    'keep-alive')
    if (res.flushHeaders) res.flushHeaders()

    res.write(`event: userMessage\ndata: ${JSON.stringify(userMessage)}\n\n`)

    // 4. Call the Python AI service — pass user context so Python can attribute logs
    const aiCallStart = Date.now()
    const response = await fetch(`${process.env.AI_API}/chat`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connection':   'keep-alive',
        'X-User-Id':    userId,
        'X-Chat-Id':    chatId,
      },
      body: JSON.stringify({
        message:   fileContent || content,
        text:      fileContent ? content : undefined,
        fileInfo:  fileInfo,
        chat_id:   chatId,
        mode:      targetTier,
        history:   previousMessages.map(m => ({
          role: m.role,
          content: m.content,
          text: (m as any).text,
          fileInfo: m.fileInfo
        })),
      }),
    })

    // ── RateLimitExceeded raise in litellm
    if (response.status === 429) {
      let quotaMessage = `Rate limit reached for the '${targetTier}' model. Please wait a moment before retrying.`
      try {
        const body = await response.json()
        if (body?.detail)  quotaMessage = body.detail
        if (body?.message) quotaMessage = body.message
      } catch { }

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

      isFinished = true
      res.write(`event: error\ndata: ${JSON.stringify({ type: 'QUOTA_EXHAUSTED', message: quotaMessage })}\n\n`)
      return res.end()
    }

    // ── Any other error
    if (!response.ok) {
      let pythonError = `Python API ${response.status}`
      try {
        const body = await response.json()
        pythonError = body?.detail ?? body?.error ?? pythonError
      } catch { }

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

      const failMsg = `FAILURE tier=${targetTier} user=${userId} chat=${chatId} stage=python_api_error error=${pythonError}`
      LlmLog.create({
        type:          'failure',
        userId:        new (require('mongoose').Types.ObjectId)(userId),
        chatId:        new (require('mongoose').Types.ObjectId)(chatId),
        virtual_model: targetTier,
        mode:          targetTier,
        latency_ms:    Date.now() - startTime,
        error:         failMsg,
        timestamp:     new Date(),
      }).catch((e: any) => console.error('[LlmLog] Failed to write lifecycle failure log:', e))

      isFinished = true
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'AI service currently unavailable' })}\n\n`)
      return res.end()
    }

    if (!response.body) throw new Error('AI API returned an empty body')

    // 5. Stream the response
    const reader  = response.body.getReader()
    const decoder = new TextDecoder()

    let fullContent     = ''
    let reasoningContent = ''
    let buffer          = ''
    let activeToolCalls: Record<string, unknown>[] = []
    let hasSeenActivity = false
    let isAborted       = false
    let ttftMs: number | null = null

    res.on('close', () => {
      if (!isFinished) {
        isAborted = true
        // Call Python stop API to cancel LLM generation thread
        fetch(`${process.env.AI_API}/stop`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ chat_id: chatId }),
        }).catch(err => console.error('Failed to call stop on client disconnect:', err))
      }
    })

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
      if (isAborted || res.destroyed) {
        try {
          await reader.cancel()
        } catch {}
        break
      }

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        if (!part.trim()) continue
        const { event, data } = parsePythonEvent(part)

        if (event === 'error') {
          hasSeenActivity = true
          let pythonErrMsg        = data ?? 'Unknown stream error'
          let isMidpointQuotaLeak = false
          try {
            const parsed = JSON.parse(data ?? '{}')
            pythonErrMsg = parsed?.message ?? pythonErrMsg
            if (parsed?.type === 'QUOTA_EXHAUSTED' || pythonErrMsg.toLowerCase().includes('quota')) {
              isMidpointQuotaLeak = true
            }
          } catch { }

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
          hasSeenActivity = true
          try {
            const toolPayload = JSON.parse(data)
            const tc          = toolPayload.tool_call ?? toolPayload.functionCall ?? toolPayload
            const toolId      = tc?.id ?? 'unknown'
            const toolName    = tc?.name ?? tc?.functionName ?? 'unknown'
            const toolStatus  = toolPayload.status ?? 'running'
            const toolResult  = toolPayload.result ?? ''
            const toolError   = toolPayload.error ?? ''

            // Add or update in activeToolCalls
            const existingIdx = activeToolCalls.findIndex((item: any) => item.id === toolId)
            if (existingIdx > -1) {
              activeToolCalls[existingIdx] = { 
                id: toolId, 
                name: toolName, 
                status: toolStatus, 
                result: toolResult, 
                error: toolError 
              }
            } else {
              activeToolCalls.push({ 
                id: toolId, 
                name: toolName, 
                status: toolStatus, 
                result: toolResult, 
                error: toolError 
              })
            }

            writeLog({
              userId,
              action:    'AI_TOOL_CALL',
              status:    toolStatus === 'failed' ? 'failed' : 'success',
              method:    'POST',
              path:      `/api/chats/${chatId}/msgs`,
              ipAddress: req.ip ?? req.socket.remoteAddress,
              userAgent: req.headers['user-agent'],
              latency:   Date.now() - startTime,
              details:   { chatId, toolName, toolStatus, toolResult, toolError },
            }).catch(e => console.error('Tool call log error:', e))

            // Log tool_call event to MongoDB llmlogs collection
            if (toolStatus !== 'running') {
              LlmLog.create({
                type: 'tool_call',
                userId,
                chatId,
                tool_name: toolName,
                tool_status: toolStatus,
                tool_result: toolStatus === 'completed' ? toolResult : undefined,
                error: toolStatus === 'failed' ? toolError : undefined,
                timestamp: new Date()
              }).catch(e => console.error('Failed to save tool call log:', e))
            }

            res.write(`event: tool\ndata: ${JSON.stringify({ 
              tool: toolName, 
              id: toolId, 
              status: toolStatus, 
              result: toolResult, 
              error: toolError 
              })}\n\n`)
          } catch (e) {
            console.error('Failed to parse tool call payload:', e)
          }
          continue
        }

        if (data) {
          hasSeenActivity = true
          // Track time-to-first-token
          if (ttftMs === null) {
            ttftMs = Date.now() - aiCallStart
          }
          try {
            const parsed = JSON.parse(data)
            if (typeof parsed?.reasoning_token === 'string') {
              reasoningContent += parsed.reasoning_token
              res.write(`event: reasoning\ndata: ${JSON.stringify({ token: parsed.reasoning_token })}\n\n`)
            } else if (typeof parsed?.token === 'string') {
              fullContent += parsed.token
              res.write(`event: token\ndata: ${JSON.stringify({ token: parsed.token })}\n\n`)
            } else {
              fullContent += data
              res.write(`event: token\ndata: ${JSON.stringify({ token: data })}\n\n`)
            }
          } catch {
            fullContent += data
            res.write(`event: token\ndata: ${JSON.stringify({ token: data })}\n\n`)
          }
        }
      }
    }

    if (isAborted || res.destroyed) {
      isFinished = true
      return res.end()
    }

    // 6. Persist completed response
    if (!hasSeenActivity && !fullContent.trim()) {
      isFinished = true
      res.write(`event: error\ndata: ${JSON.stringify({
        type:    'EMPTY_RESPONSE',
        message: 'The AI returned an empty response. Please try again.',
      })}\n\n`)
      return res.end()
    }

    const cleanContent = fullContent && fullContent.trim() !== "" 
      ? fullContent 
      : (activeToolCalls.length > 0 ? "[Executed Tool Action]" : "[Stream Disconnected]");

    const assistantMessage = await Message.create({
      chatId: req.params.chatId,
      role:    'assistant',
      content: cleanContent, // 🚀 Uses the sanitized, non-empty variable
      reasoning: reasoningContent || undefined,
      toolCalls: activeToolCalls,
    });

    // ─── 🌟 REDIS HOURLY TRACKING COMMIT ────────────────────────────────────────
    const totalEstimatedTokens = Math.ceil((content.length + fullContent.length) / 4)
    
    // Compute total seconds remaining until the turn of the next UTC hour boundary
    const secondsUntilNextHour = 3600 - (now.getUTCMinutes() * 60 + now.getUTCSeconds())
    const redisTTL = secondsUntilNextHour + 600

    await redis.multi()
      .incrby(tphKey, totalEstimatedTokens)
      .incr(rphKey)
      .expire(tphKey, redisTTL)
      .expire(rphKey, redisTTL)
      .exec()
    // ──────────────────────────────────────────────────────────────────────────

    isFinished = true
    res.write(`event: done\ndata: ${JSON.stringify(assistantMessage)}\n\n`)
    res.end()

    const finalLatency = Date.now() - startTime

    const successMsg = `SUCCESS tier=${targetTier} user=${userId} chat=${chatId} latency=${finalLatency}ms ttft=${ttftMs ?? '—'}ms tools=${activeToolCalls.length}`
    // Write a full-lifecycle LlmLog entry from the Node.js side
    LlmLog.create({
      type:          'success',
      userId:        new (require('mongoose').Types.ObjectId)(userId),
      chatId:        new (require('mongoose').Types.ObjectId)(chatId),
      virtual_model: targetTier,
      mode:          targetTier,
      latency_ms:    finalLatency,
      ttft_ms:       ttftMs ?? undefined,
      prompt_tokens:  Math.ceil(content.length / 4),
      completion_tokens: Math.ceil(fullContent.length / 4),
      error:         successMsg,
      timestamp:     new Date(),
    }).catch((e: any) => console.error('[LlmLog] Failed to write lifecycle log:', e))

    await writeLog({
      userId,
      action:    'AI_CHAT',
      status:    'success',
      method:    'POST',
      path:      `/api/chats/${chatId}/msgs`,
      ipAddress: req.ip ?? req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      latency:   finalLatency,
      details:   {
        chatId,
        targetTier,
        ttft_ms:        ttftMs,
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

    isFinished = true
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