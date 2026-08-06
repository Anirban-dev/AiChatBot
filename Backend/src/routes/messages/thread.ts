// src/routes/messages/thread.ts
import { Router, Response } from 'express'
import { Message } from '../../models/msg'
import authMiddleware, { AuthRequest } from '../../middleware/auth'
import { midLimiter } from '../../utils/ratelimitHelper'
import { writeLog } from '../../utils/logger'

const router = Router({ mergeParams: true })
router.use(authMiddleware)

// ─── DELETE /api/chats/:chatId/msgs/threads/:threadHeadId ─────────────────
// Deletes a specific thread subtree given its threadHeadId (the first reply message of the thread).
// 1. Collects all messages in the thread subtree starting from threadHeadId.
// 2. Extracts attached file metadata to trigger RAG/VectorDB cleanup for indexed files.
// 3. Deletes all thread messages from MongoDB.
router.delete('/threads/:threadHeadId', midLimiter, async (req: AuthRequest<{ chatId: string; threadHeadId: string }>, res: Response) => {
  const { chatId, threadHeadId } = req.params
  const startTime = Date.now()

  try {
    const headMsg = await Message.findOne({ _id: threadHeadId, chatId })
    if (!headMsg) {
      return res.status(404).json({ error: 'Thread head message not found' })
    }

    const threadRootId = headMsg.threadRootId
    if (!threadRootId) {
      return res.status(400).json({ error: 'Specified message is not a thread reply' })
    }

    // Recursively collect all descendant message IDs belonging to this specific thread branch
    const toDeleteIds: string[] = []
    const queue: string[] = [threadHeadId]
    const filesToCleanup: { filename: string }[] = []

    // Fetch all messages belonging to this threadRootId
    const allThreadMsgs = await Message.find({ chatId, threadRootId })

    while (queue.length > 0) {
      const currentId = queue.shift()!
      toDeleteIds.push(currentId)

      const msg = allThreadMsgs.find(m => String(m._id) === String(currentId))
      if (msg && msg.fileInfo?.name) {
        filesToCleanup.push({ filename: msg.fileInfo.name })
      }

      // Add child messages
      const children = allThreadMsgs.filter(m => String(m.parentId) === String(currentId))
      for (const child of children) {
        queue.push(String(child._id))
      }
    }

    // 1. Delete all collected messages from MongoDB
    await Message.deleteMany({ _id: { $in: toDeleteIds } })

    // 2. Clean up attached files from RAG VectorDB in background if any exist
    if (filesToCleanup.length > 0) {
      const AI_API = process.env.AI_API || 'http://localhost:8000/agent'
      for (const file of filesToCleanup) {
        fetch(`${AI_API}/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.filename, chat_id: chatId }),
          signal: AbortSignal.timeout(10_000),
        }).catch(err => console.error(`[Thread Delete] VectorDB cleanup failed for ${file.filename}:`, err))
      }
    }

    await writeLog({
      userId: req.userId,
      action: 'DELETE_THREAD',
      status: 'success',
      method: 'DELETE',
      path: `/api/chats/${chatId}/msgs/threads/${threadHeadId}`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      latency: Date.now() - startTime,
      details: { chatId, threadHeadId, deletedCount: toDeleteIds.length, filesCleaned: filesToCleanup.length },
    })

    res.json({ success: true, deletedIds: toDeleteIds })
  } catch (err) {
    console.error('Delete Thread Error:', err)
    await writeLog({
      userId: req.userId,
      action: 'DELETE_THREAD',
      status: 'failed',
      method: 'DELETE',
      path: `/api/chats/${chatId}/msgs/threads/${threadHeadId}`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      latency: Date.now() - startTime,
      details: { chatId, threadHeadId, error: err instanceof Error ? err.message : String(err) },
    })
    res.status(500).json({ error: 'Failed to delete thread' })
  }
})

export default router
