import { Router } from 'express'
import loginRouter from './login'
import statsRouter from './stats'
import usersRouter from './users'
import logsRouter from './logs'
import llmRouter from './litellm'

const router = Router()

// Mount sub-routers
router.use('/', loginRouter)      // e.g. POST /api/admin/login
router.use('/', statsRouter)      // e.g. GET /api/admin/stats
router.use('/users', usersRouter) // e.g. GET /api/admin/users, DELETE /api/admin/users/:userId
router.use('/logs', logsRouter)   // e.g. GET /api/admin/logs, GET /api/admin/logs/metrics
router.use('/llm', llmRouter)     // e.g. GET /api/admin/llm/status, GET /api/admin/llm/events?since_hours=24&type=failure&tier=highllm

export default router
