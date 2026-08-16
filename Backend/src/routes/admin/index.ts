import { Router } from 'express'
import statsRouter from './stats'
import usersRouter from './users'
import logsRouter from './logs'
import llmRouter from './litellm'
import tiersRouter from './tiers'
import aiProvidersRouter from './aiProviders'

const router = Router()

// Mount sub-routers
router.use('/', statsRouter)            // e.g. GET /api/admin/stats
router.use('/users', usersRouter)       // e.g. GET /api/admin/users, DELETE /api/admin/users/:userId
router.use('/logs', logsRouter)         // e.g. GET /api/admin/logs, GET /api/admin/logs/metrics
router.use('/llm', llmRouter)           // e.g. GET /api/admin/llm/status
router.use('/tiers', tiersRouter)       // e.g. GET/POST /api/admin/tiers, PUT/DELETE /api/admin/tiers/:name
router.use('/ai-providers', aiProvidersRouter) // e.g. GET/POST /api/admin/ai-providers, PUT/DELETE /:id

export default router
