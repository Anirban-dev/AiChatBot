// src/routes/messages/send.ts
import { Router, Request, Response } from 'express'
import { Message }    from '../../models/msg'
import { Chat }       from '../../models/chat'
import { User }       from '../../models/user'
import authMiddleware, { AuthRequest } from '../../middleware/auth'
import { midLimiter } from '../../utils/ratelimitHelper'
import { writeLog }   from '../../utils/logger'
import { redis }      from '../../utils/redis'
import { getEffectiveUserLimits } from '../admin/users'
import { getWindowStamp, getWindowTTLSeconds, formatPeriodLabel } from '../../utils/windowHelper'
import { LlmLog } from '../../models/llmLog'
import mongoose from 'mongoose'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

// ─── GET: fetch all messages for a chat ──────────────────────────────────────
router.get('/', midLimiter, async (req: Request<{ chatId: string }>, res: Response) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId }).sort({ createdAt: 1 })
    res.json(messages)
  } catch {
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

// ─── POST: send a message and stream the AI response ─────────────────────────
router.post('/', midLimiter, async (req: AuthRequest<{ chatId: string }>, res: Response) => {
  const { content, model = 'small', fileInfo, file, parentId, threadRootId } = req.body
  const { chatId } = req.params

  if (!content && !file) return res.status(400).json({ error: 'Content is required' })

  const validTiers = ['small', 'large', 'thinking', 'critiq'] as const
  const targetTier: 'small' | 'large' | 'thinking' | 'critiq' = validTiers.includes(model) ? model : 'small'

  const userTier  = (req as any).userTier ?? 'free'
  const userId    = req.userId!
  const startTime = Date.now()
  let isFinished = false

  try {
    const chat = await Chat.findOne({ _id: chatId, userId })
    if (!chat) return res.status(404).json({ error: 'Chat not found' })

    // ─── Redis period-aware limit pre-check (Model-Specific & Global) ───────────
    const now = new Date()
    const effectiveLimits = await getEffectiveUserLimits(userId, userTier)
    const modelLimit = effectiveLimits.models[targetTier]
    const modelPeriod = modelLimit.period || 'hourly'
    const stamp = getWindowStamp(now, modelPeriod)

    // Model specific keys
    const modelTpmKey = `usage:tpm:${userId}:${targetTier}:${stamp}`
    const modelRpmKey = `usage:rpm:${userId}:${targetTier}:${stamp}`

    const [modelTpmRaw, modelRpmRaw] = await Promise.all([
      redis.get(modelTpmKey),
      redis.get(modelRpmKey),
    ])

    const modelTokensUsed = parseInt(modelTpmRaw ?? '0', 10)
    const modelRequestsUsed = parseInt(modelRpmRaw ?? '0', 10)
    const periodLabel = formatPeriodLabel(modelPeriod)

    if (modelRequestsUsed >= modelLimit.rpm) {
      await writeLog({
        userId, action: 'AI_CHAT', status: 'failed', method: 'POST',
        path: `/api/chats/${chatId}/msgs`,
        ipAddress: req.ip ?? req.socket.remoteAddress, userAgent: req.headers['user-agent'],
        latency: Date.now() - startTime,
        details: { chatId, model: targetTier, reason: `Request limit reached for ${targetTier} model (${modelPeriod})`, limit: modelLimit.rpm, used: modelRequestsUsed },
      })
      return res.status(429).json({ error: `${modelPeriod.charAt(0).toUpperCase() + modelPeriod.slice(1)} request limit reached for the '${targetTier}' model (${modelLimit.rpm} requests/${periodLabel}). Please wait or switch models.` })
    }

    if (modelTokensUsed >= modelLimit.tpm) {
      await writeLog({
        userId, action: 'AI_CHAT', status: 'failed', method: 'POST',
        path: `/api/chats/${chatId}/msgs`,
        ipAddress: req.ip ?? req.socket.remoteAddress, userAgent: req.headers['user-agent'],
        latency: Date.now() - startTime,
        details: { chatId, model: targetTier, reason: `Token quota reached for ${targetTier} model (${modelPeriod})`, limit: modelLimit.tpm, used: modelTokensUsed },
      })
      return res.status(429).json({ error: `${modelPeriod.charAt(0).toUpperCase() + modelPeriod.slice(1)} token quota reached for the '${targetTier}' model (${modelLimit.tpm.toLocaleString()} tokens/${periodLabel}). Please wait or switch models.` })
    }

    // ─── Build context window ──────────────────────────────────────────────────
    //
    // THREAD MESSAGE:
    //   a) Walk this thread's own parentId chain back to the thread root anchor.
    //   b) From the anchor, walk the main-timeline parentId chain (threadRootId: null only).
    //   This gives: [main chat history up to anchor] + [this thread's prior replies]
    //
    // MAIN / BRANCH MESSAGE:
    //   Walk the parentId chain directly from the given parentId, skipping thread messages.
    //
    const previousMessages: any[] = []
    const CONTEXT_LIMIT = 100

    let computedThreadHeadId: string | null = null

    let resolvedParentId: string | null = null

    if (threadRootId) {
      // ── PHASE 1: collect this thread's own prior replies ──
      const threadReplies: any[] = []
      let currentId = parentId
      while (currentId && mongoose.isValidObjectId(currentId)) {
        const msg = await Message.findById(currentId)
        if (!msg) break
        if (String(msg.threadRootId) !== String(threadRootId)) break
        threadReplies.unshift(msg)
        currentId = msg.parentId
      }

      // Determine threadHeadId
      if (parentId && String(parentId) !== String(threadRootId) && mongoose.isValidObjectId(parentId)) {
        const parentMsg: any = await Message.findById(parentId)
        if (parentMsg?.threadHeadId) {
          computedThreadHeadId = String(parentMsg.threadHeadId)
        } else if (threadReplies.length > 0) {
          computedThreadHeadId = String(threadReplies[0]._id)
        }
      }

      // ── PHASE 2: build main-timeline context up to (and including) the anchor ──
      const mainCtx: any[] = []
      if (mongoose.isValidObjectId(threadRootId)) {
        const anchorMsg = await Message.findById(threadRootId)
        if (anchorMsg) {
          mainCtx.unshift(anchorMsg)
          let walkId = anchorMsg.parentId
          while (walkId && mongoose.isValidObjectId(walkId) && mainCtx.length + threadReplies.length < CONTEXT_LIMIT) {
            const msg = await Message.findById(walkId)
            if (!msg) break
            if (!msg.threadRootId) {
              mainCtx.unshift(msg)
            }
            walkId = msg.parentId
          }
        }
      }

      previousMessages.push(...mainCtx, ...threadReplies)
      resolvedParentId = parentId ? String(parentId) : null

    } else {
      // ── MAIN / BRANCH CHAT: walk parentId chain, skip any thread messages ──
      let initialParentId: string | null = null
      if (parentId && mongoose.isValidObjectId(parentId)) {
        initialParentId = String(parentId)
      } else {
        const lastMsg = await Message.findOne({ chatId, threadRootId: null }).sort({ createdAt: -1 })
        if (lastMsg) initialParentId = String(lastMsg._id)
      }

      let walkId = initialParentId
      while (walkId && mongoose.isValidObjectId(walkId) && previousMessages.length < CONTEXT_LIMIT) {
        const parentMsg = await Message.findById(walkId)
        if (!parentMsg) break
        if (!parentMsg.threadRootId) {
          previousMessages.unshift(parentMsg)
        }
        walkId = parentMsg.parentId ? String(parentMsg.parentId) : null
      }

      resolvedParentId = initialParentId
    }

    const userMessageId = new mongoose.Types.ObjectId()
    if (threadRootId && !computedThreadHeadId) {
      computedThreadHeadId = String(userMessageId)
    }

    const userMessage = await Message.create({
      _id: userMessageId,
      chatId,
      role: 'user',
      content,
      fileInfo,
      file,
      parentId: resolvedParentId,
      threadRootId: threadRootId || null,
      threadHeadId: threadRootId ? computedThreadHeadId : null,
    })

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    if (res.flushHeaders) res.flushHeaders()

    res.write(`event: userMessage\ndata: ${JSON.stringify(userMessage)}\n\n`)

    const aiCallStart = Date.now()
    const response = await fetch(`${process.env.AI_API}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        'X-User-Id': userId,
        'X-Chat-Id': chatId,
      },
      body: JSON.stringify({
        message: content,
        fileInfo,
        file,
        chat_id: chatId,
        mode: targetTier,
        history: previousMessages.map(m => ({
          role: m.role,
          content: m.content,
          fileInfo: (m as any).fileInfo,
          file: (m as any).file,
        })),
        activePath: previousMessages.map(m => ({
          role: m.role,
          content: m.content,
          fileInfo: (m as any).fileInfo,
          file: (m as any).file,
        })),
      }),
    })

    // ── 429 quota ──────────────────────────────────────────────────────────────
    if (response.status === 429) {
      let quotaMessage = `Rate limit reached for the '${targetTier}' model. Please wait a moment before retrying.`
      try {
        const body = await response.json()
        if (body?.detail)  quotaMessage = body.detail
        if (body?.message) quotaMessage = body.message
      } catch { }

      await writeLog({
        userId, action: 'AI_CHAT', status: 'failed', method: 'POST',
        path: `/api/chats/${chatId}/msgs`,
        ipAddress: req.ip ?? req.socket.remoteAddress, userAgent: req.headers['user-agent'],
        latency: Date.now() - startTime,
        details: { chatId, stage: 'quota_exhausted', userTier, targetTier },
      })

      LlmLog.create({
        type: 'failure',
        userId: new mongoose.Types.ObjectId(userId),
        chatId: new mongoose.Types.ObjectId(chatId),
        virtual_model: targetTier,
        mode: targetTier,
        latency_ms: Date.now() - startTime,
        error: `FAILURE tier=${targetTier} user=${userId} chat=${chatId} stage=quota_exhausted`,
        timestamp: new Date(),
      }).catch((e: any) => console.error('[LlmLog] Failed to write quota failure log:', e))

      isFinished = true
      res.write(`event: error\ndata: ${JSON.stringify({ type: 'QUOTA_EXHAUSTED', message: quotaMessage })}\n\n`)
      return res.end()
    }

    // ── Any other non-2xx from Python ──────────────────────────────────────────
    if (!response.ok) {
      let pythonError = `Python API ${response.status}`
      try {
        const body = await response.json()
        pythonError = body?.detail ?? body?.error ?? pythonError
      } catch { }

      await writeLog({
        userId, action: 'AI_CHAT', status: 'failed', method: 'POST',
        path: `/api/chats/${chatId}/msgs`,
        ipAddress: req.ip ?? req.socket.remoteAddress, userAgent: req.headers['user-agent'],
        latency: Date.now() - startTime,
        details: { chatId, stage: 'python_api_error', httpStatus: response.status, pythonMessage: pythonError },
      })

      LlmLog.create({
        type: 'failure',
        userId: new mongoose.Types.ObjectId(userId),
        chatId: new mongoose.Types.ObjectId(chatId),
        virtual_model: targetTier,
        mode: targetTier,
        latency_ms: Date.now() - startTime,
        error: `FAILURE tier=${targetTier} user=${userId} chat=${chatId} stage=python_api_error error=${pythonError}`,
        timestamp: new Date(),
      }).catch((e: any) => console.error('[LlmLog] Failed to write lifecycle failure log:', e))

      isFinished = true
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'AI service currently unavailable' })}\n\n`)
      return res.end()
    }

    if (!response.body) throw new Error('AI API returned an empty body')

    // ── Stream the response ────────────────────────────────────────────────────
    const reader  = response.body.getReader()
    const decoder = new TextDecoder()

    let fullContent      = ''
    let reasoningContent = ''
    let buffer           = ''
    let activeToolCalls: Record<string, unknown>[] = []
    let hasSeenActivity  = false
    let isAborted        = false
    let ttftMs: number | null = null

    res.on('close', () => {
      if (!isFinished) {
        isAborted = true
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
        try { await reader.cancel() } catch {}
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
            userId, action: 'AI_CHAT', status: 'failed', method: 'POST',
            path: `/api/chats/${chatId}/msgs`,
            ipAddress: req.ip ?? req.socket.remoteAddress, userAgent: req.headers['user-agent'],
            latency: Date.now() - startTime,
            details: { chatId, stage: 'python_stream_error', pythonMessage: pythonErrMsg, targetTier },
          })

          LlmLog.create({
            type: 'failure',
            userId: new mongoose.Types.ObjectId(userId),
            chatId: new mongoose.Types.ObjectId(chatId),
            virtual_model: targetTier,
            mode: targetTier,
            latency_ms: Date.now() - startTime,
            error: `FAILURE tier=${targetTier} user=${userId} chat=${chatId} stage=python_stream_error error=${pythonErrMsg}`,
            timestamp: new Date(),
          }).catch((e: any) => console.error('[LlmLog] Failed to write stream-error log:', e))

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

            const existingIdx = activeToolCalls.findIndex((item: any) => item.id === toolId)
            if (existingIdx > -1) {
              activeToolCalls[existingIdx] = { id: toolId, name: toolName, status: toolStatus, result: toolResult, error: toolError }
            } else {
              activeToolCalls.push({ id: toolId, name: toolName, status: toolStatus, result: toolResult, error: toolError })
            }

            writeLog({
              userId, action: 'AI_TOOL_CALL', status: toolStatus === 'failed' ? 'failed' : 'success', method: 'POST',
              path: `/api/chats/${chatId}/msgs`,
              ipAddress: req.ip ?? req.socket.remoteAddress, userAgent: req.headers['user-agent'],
              latency: Date.now() - startTime,
              details: { chatId, toolName, toolStatus, toolResult, toolError },
            }).catch(e => console.error('Tool call log error:', e))

            if (toolStatus !== 'running') {
              LlmLog.create({
                type: 'tool_call',
                userId,
                chatId,
                model: toolName,
                virtual_model: 'tool',
                tool_name: toolName,
                tool_status: toolStatus,
                tool_args: tc?.function?.arguments || '',
                tool_result: toolStatus === 'completed' ? toolResult : undefined,
                error: toolStatus === 'completed' ? toolResult : toolError,
                timestamp: new Date(),
              }).catch(e => console.error('Failed to save tool call log:', e))
            }

            res.write(`event: tool\ndata: ${JSON.stringify({ tool: toolName, id: toolId, status: toolStatus, result: toolResult, error: toolError })}\n\n`)
          } catch (e) {
            console.error('Failed to parse tool call payload:', e)
          }
          continue
        }

        if (data) {
          hasSeenActivity = true
          if (ttftMs === null) ttftMs = Date.now() - aiCallStart
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

    // ── Persist completed response ─────────────────────────────────────────────
    if (!hasSeenActivity && !fullContent.trim()) {
      await writeLog({
        userId, action: 'AI_CHAT', status: 'failed', method: 'POST',
        path: `/api/chats/${chatId}/msgs`,
        ipAddress: req.ip ?? req.socket.remoteAddress, userAgent: req.headers['user-agent'],
        latency: Date.now() - startTime,
        details: { chatId, stage: 'empty_response', targetTier },
      })

      LlmLog.create({
        type: 'failure',
        userId: new mongoose.Types.ObjectId(userId),
        chatId: new mongoose.Types.ObjectId(chatId),
        virtual_model: targetTier,
        mode: targetTier,
        latency_ms: Date.now() - startTime,
        error: `FAILURE tier=${targetTier} user=${userId} chat=${chatId} stage=empty_response`,
        timestamp: new Date(),
      }).catch((e: any) => console.error('[LlmLog] Failed to write empty-response failure log:', e))

      isFinished = true
      res.write(`event: error\ndata: ${JSON.stringify({
        type:    'EMPTY_RESPONSE',
        message: 'The AI returned an empty response. Please try again.',
      })}\n\n`)
      return res.end()
    }

    const cleanContent = fullContent && fullContent.trim() !== ''
      ? fullContent.trim()
      : (activeToolCalls.length > 0 ? '[Executed Tool Action]' : '[Stream Disconnected]')

    const assistantMessage = await Message.create({
      chatId: req.params.chatId,
      role: 'assistant',
      content: cleanContent,
      reasoning: reasoningContent || undefined,
      toolCalls: activeToolCalls,
      parentId: String(userMessage._id),
      threadRootId: threadRootId || null,
      threadHeadId: threadRootId ? computedThreadHeadId : null,
    })

    // ─── Redis tracking commit ────────────────────────────────────────────────
    const totalEstimatedTokens = Math.ceil((content.length + fullContent.length) / 4)
    const redisTTL = getWindowTTLSeconds(now, modelPeriod)

    await redis.multi()
      // Model-specific metrics
      .incrby(modelTpmKey, totalEstimatedTokens)
      .incr(modelRpmKey)
      .expire(modelTpmKey, redisTTL)
      .expire(modelRpmKey, redisTTL)
      .exec()

    isFinished = true
    res.write(`event: done\ndata: ${JSON.stringify(assistantMessage)}\n\n`)
    res.end()

    const finalLatency = Date.now() - startTime

    LlmLog.create({
      type: 'success',
      userId: new mongoose.Types.ObjectId(userId),
      chatId: new mongoose.Types.ObjectId(chatId),
      virtual_model: targetTier,
      mode: targetTier,
      latency_ms: finalLatency,
      ttft_ms: ttftMs ?? undefined,
      prompt_tokens: Math.ceil(content.length / 4),
      completion_tokens: Math.ceil(fullContent.length / 4),
      error: `SUCCESS tier=${targetTier} user=${userId} chat=${chatId} latency=${finalLatency}ms ttft=${ttftMs ?? '—'}ms tools=${activeToolCalls.length}`,
      timestamp: new Date(),
    }).catch((e: any) => console.error('[LlmLog] Failed to write lifecycle log:', e))

    await writeLog({
      userId, action: 'AI_CHAT', status: 'success', method: 'POST',
      path: `/api/chats/${chatId}/msgs`,
      ipAddress: req.ip ?? req.socket.remoteAddress, userAgent: req.headers['user-agent'],
      latency: finalLatency,
      details: {
        chatId, targetTier, ttft_ms: ttftMs,
        promptLength: content.length, responseLength: fullContent.length,
        toolCallCount: activeToolCalls.length,
        toolsUsed: activeToolCalls.map((tc: any) => tc.name ?? tc.functionName ?? 'unknown'),
      },
    })

  } catch (err) {
    const latency = Date.now() - startTime
    console.error('Core Streaming Loop Exception:', err)

    await writeLog({
      userId: req.userId, action: 'AI_CHAT', status: 'failed', method: 'POST',
      path: `/api/chats/${chatId}/msgs`,
      ipAddress: req.ip ?? req.socket.remoteAddress, userAgent: req.headers['user-agent'],
      latency,
      details: { chatId, stage: 'middleware_exception', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined },
    })

    isFinished = true
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal Server Error' })
    }
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Stream interrupted' })}\n\n`)
    res.end()
  }
})

export default router
