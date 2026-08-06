// src/routes/messages/branch.ts
//
// Handles branch creation: creating a new AI conversation branch from a given
// message. This replaces the old PUT /:msgId/edit endpoint which was broken
// (sent empty history, and had a bad parentId fallback).
//
// A "branch" is a new user message with the same parentId as the original
// message being branched from, plus a full context window so the AI has
// the proper history up to that branch point.
//
import { Router, Response } from 'express'
import { Message } from '../../models/msg'
import { Chat }    from '../../models/chat'
import authMiddleware, { AuthRequest } from '../../middleware/auth'
import { midLimiter } from '../../utils/ratelimitHelper'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

const CONTEXT_LIMIT = 100

/**
 * Walk backwards from a parentId, collecting context for a branch.
 * Only follows main-timeline messages (threadRootId === null/undefined).
 */
async function buildBranchContext(parentId: string | null): Promise<any[]> {
  const ctx: any[] = []
  let currentId: string | null | undefined = parentId
  while (currentId && ctx.length < CONTEXT_LIMIT) {
    const msg: any = await Message.findById(currentId)
    if (!msg) break
    // Only main-timeline messages go into branch context
    if (!msg.threadRootId) {
      ctx.unshift(msg)
    }
    currentId = msg.parentId ?? null
  }
  return ctx
}

/**
 * Walk backwards from a parentId within a specific thread,
 * then append main-timeline context up to the thread anchor.
 */
async function buildThreadBranchContext(
  parentId: string | null,
  threadRootId: string
): Promise<any[]> {
  // Phase 1: thread replies up to the branch point
  const threadReplies: any[] = []
  let currentId: string | null | undefined = parentId
  while (currentId) {
    const msg: any = await Message.findById(currentId)
    if (!msg) break
    if (String(msg.threadRootId) !== String(threadRootId)) break
    threadReplies.unshift(msg)
    currentId = msg.parentId ?? null
  }

  // Phase 2: main-timeline context up to the anchor
  const mainCtx: any[] = []
  const anchorMsg = await Message.findById(threadRootId)
  if (anchorMsg) {
    mainCtx.unshift(anchorMsg)
    let walkId = anchorMsg.parentId
    while (walkId && mainCtx.length + threadReplies.length < CONTEXT_LIMIT) {
      const msg: any = await Message.findById(walkId)
      if (!msg) break
      if (!msg.threadRootId) mainCtx.unshift(msg)
      walkId = msg.parentId
    }
  }

  return [...mainCtx, ...threadReplies]
}

// ─── POST /:msgId/branch ──────────────────────────────────────────────────────
//
// Creates a new branch from the given message. The new user message gets the
// same parentId as the original (so they are siblings in the tree), and the
// AI receives the full context up to that point.
//
router.post('/:msgId/branch', midLimiter, async (req: AuthRequest<{ chatId: string; msgId: string }>, res: Response) => {
  const { msgId } = req.params
  const { content, model = 'small', fileInfo, file } = req.body
  const chatId = req.params.chatId
  const userId = req.userId!

  if (!content && !file) return res.status(400).json({ error: 'Content is required' })

  const validTiers = ['small', 'large', 'thinking', 'critiq']
  const targetTier = validTiers.includes(model) ? model : 'small'

  try {
    const chat = await Chat.findOne({ _id: chatId, userId })
    if (!chat) return res.status(404).json({ error: 'Chat not found' })

    const originalMsg = await Message.findById(msgId)
    if (!originalMsg) return res.status(404).json({ error: 'Message not found' })

    // The branch point parent: the original message's own parent.
    // This makes the new message a sibling to the original.
    // If the original has no parent (it's the first message), parentId stays null.
    const branchParentId = originalMsg.parentId ?? null
    const threadRootId   = (originalMsg as any).threadRootId ?? null
    const threadHeadId   = threadRootId
      ? ((originalMsg as any).threadHeadId || (String(branchParentId) === String(threadRootId) ? String(originalMsg._id) : null))
      : null

    // Build context up to the branch point (not including the original msg itself)
    const previousMessages = threadRootId
      ? await buildThreadBranchContext(branchParentId?.toString() ?? null, String(threadRootId))
      : await buildBranchContext(branchParentId?.toString() ?? null)

    // Create the new branched user message
    const newUserMessage = await Message.create({
      chatId,
      role: 'user',
      content,
      fileInfo,
      file,
      parentId: branchParentId,
      threadRootId: threadRootId,
      threadHeadId: threadHeadId,
    })

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    if (res.flushHeaders) res.flushHeaders()

    res.write(`event: userMessage\ndata: ${JSON.stringify(newUserMessage)}\n\n`)

    // Call AI with the correct context window
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
        history: previousMessages.map((m: any) => ({
          role: m.role,
          content: m.content,
          fileInfo: m.fileInfo,
          file: m.file,
        })),
        activePath: previousMessages.map((m: any) => ({
          role: m.role,
          content: m.content,
          fileInfo: m.fileInfo,
          file: m.file,
        })),
      }),
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      const errMsg  = errBody?.detail ?? errBody?.error ?? `AI API error ${response.status}`
      res.write(`event: error\ndata: ${JSON.stringify({ message: errMsg })}\n\n`)
      return res.end()
    }

    if (!response.body) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'AI API returned empty body' })}\n\n`)
      return res.end()
    }

    // Stream the AI response
    const reader  = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''
    let reasoningContent = ''
    let currentEvent = ''
    let isAborted = false
    let isFinished = false

    res.on('close', () => {
      if (!isFinished) isAborted = true
    })

    while (true) {
      if (isAborted || res.destroyed) {
        try { await reader.cancel() } catch {}
        break
      }
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim()
        } else if (trimmed.startsWith('data:')) {
          const rawData = trimmed.slice(5).trim()
          try {
            const parsed = JSON.parse(rawData)
            if (currentEvent === 'token' && parsed.token) {
              fullContent += parsed.token
              res.write(`event: token\ndata: ${JSON.stringify({ token: parsed.token })}\n\n`)
            } else if (currentEvent === 'reasoning' && parsed.token) {
              reasoningContent += parsed.token
              res.write(`event: reasoning\ndata: ${JSON.stringify({ token: parsed.token })}\n\n`)
            } else if (currentEvent === 'tool') {
              res.write(`event: tool\ndata: ${rawData}\n\n`)
            } else if (currentEvent === 'error') {
              res.write(`event: error\ndata: ${rawData}\n\n`)
            }
          } catch {}
          currentEvent = ''
        }
      }
    }

    if (!isAborted && !res.destroyed && fullContent.trim()) {
      const assistantMsg = await Message.create({
        chatId,
        role: 'assistant',
        content: fullContent.trim(),
        reasoning: reasoningContent || undefined,
        parentId: String(newUserMessage._id),
        threadRootId: threadRootId,
        threadHeadId: threadHeadId,
      })
      isFinished = true
      res.write(`event: done\ndata: ${JSON.stringify(assistantMsg)}\n\n`)
    }

    res.end()
  } catch (err) {
    console.error('Branch Endpoint Error:', err)
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to create message branch' })
    }
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Branch stream interrupted' })}\n\n`)
    res.end()
  }
})

export default router
