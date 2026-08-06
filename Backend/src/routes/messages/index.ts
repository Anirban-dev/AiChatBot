// src/routes/messages/index.ts
//
// Assembles all message-related sub-routers and mounts them at the right paths.
// This keeps each concern in its own file while exposing a single router to app.ts.
//
import { Router } from 'express'
import sendRouter   from './send'
import stopRouter   from './stop'
import branchRouter from './branch'
import threadRouter from './thread'

const router = Router({ mergeParams: true })

// GET  /api/chats/:chatId/msgs          — fetch all messages
// POST /api/chats/:chatId/msgs          — send a message (streams AI response)
router.use('/', sendRouter)

// POST /api/chats/:chatId/msgs/stop     — stop AI generation
router.use('/stop', stopRouter)

// POST /api/chats/:chatId/msgs/:msgId/branch  — create a branch from a message
router.use('/', branchRouter)

// DELETE /api/chats/:chatId/msgs/threads/:threadHeadId  — delete a thread branch & RAG files
router.use('/', threadRouter)

export default router
