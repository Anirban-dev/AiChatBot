import { Router, Response } from 'express'
import { adminAuthMiddleware, AdminRequest } from '../../middleware/auth'
import { midLimiter } from '../../utils/ratelimitHelper'
import { LlmLog } from '../../models/llmLog'

const router = Router()
router.use(adminAuthMiddleware)

const getBackendUrl = (): string => {
  if (!process.env.AI_API) throw new Error('AI_API environment variable is not defined')
  return process.env.AI_API
}

// GET /api/admin/llm/status
router.get('/status', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const r = await fetch(`${getBackendUrl()}/status`)
    if (!r.ok) throw new Error(`Python service returned status ${r.status}`)
    res.json(await r.json())
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Upstream service unavailable' })
  }
})

// UPDATED: GET /api/admin/llm/events with Direct MongoDB Fallback Parsing
// GET /api/admin/llm/events
router.get('/events', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const params: Record<string, string> = {
      since_hours: String(req.query.since_hours || 24),
      limit:       String(req.query.limit || 100),
    }
    
    if (req.query.type) params.type = String(req.query.type)
    if (req.query.tier) params.tier = String(req.query.tier)
    if (req.query.model) params.model = String(req.query.model)
    if (req.query.status_code) params.status_code = String(req.query.status_code)

    const qs = new URLSearchParams(params).toString()
    const r  = await fetch(`${getBackendUrl()}/events?${qs}`)
    if (!r.ok) throw new Error(`Python service returned status ${r.status}`)
    
    const upstreamData = await r.json()

    if (upstreamData && Array.isArray(upstreamData.events)) {
      upstreamData.events = await Promise.all(
        upstreamData.events.map(async (event: any) => {
          
          const matchingToolLog = await LlmLog.findOne({
            type: 'tool_call',
            $or: [
              { chatId: event.chatId },
              { model: event.model }
            ]
          }).sort({ timestamp: -1 }).lean()

          if (matchingToolLog) {
            event.error = `[Tool: ${matchingToolLog.tool_name}] Status: ${matchingToolLog.tool_status} | Args: ${matchingToolLog.tool_args} | Result: ${matchingToolLog.tool_result || 'None'}`;
            if (matchingToolLog.tool_status === 'failed') {
              event.type = 'failure';
            }
          }
          return event;
        })
      )
    }

    res.json(upstreamData)
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Upstream service unavailable' })
  }
})

// DELETE /api/admin/llm/events/:id - Delete a single LLM log entry
router.delete('/events/:id', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string }
    const result = await LlmLog.findByIdAndDelete(id)
    if (!result) return res.status(404).json({ error: 'LLM log entry not found' })
    res.json({ success: true, message: 'LLM log entry deleted successfully' })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete LLM log entry' })
  }
})

// DELETE /api/admin/llm/events - Bulk clear LLM log entries matching query filters
router.delete('/events', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const { type, tier, model } = req.query
    const query: any = {}
    if (type) query.type = type
    if (tier) query.virtual_model = tier
    if (model) query.model = model

    const result = await LlmLog.deleteMany(query)
    res.json({ success: true, message: `${result.deletedCount} LLM log entries cleared successfully` })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to clear LLM log entries' })
  }
})

/** Fetch filterable historical agent tool invocations directly from MongoDB */
router.get('/tool-calls', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const { tool_name, tool_status, userId, chatId } = req.query

    const query: any = { type: 'tool_call' }

    if (tool_name) query.tool_name = String(tool_name)
    if (tool_status) query.tool_status = String(tool_status)
    if (userId) query.userId = userId
    if (chatId) query.chatId = chatId

    const toolCalls = await LlmLog.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('userId', 'name email')
      .lean()

    res.json({
      success: true,
      count: toolCalls.length,
      data: toolCalls
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve agent tool logs' })
  }
})

/** Retrieve aggregated tool usage distribution and reliability metrics */
router.get('/tool-calls/stats', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const aggregateStats = await LlmLog.aggregate([
      { $match: { type: 'tool_call' } },
      {
        $group: {
          _id: '$tool_name',
          total_invocations: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$tool_status', 'completed'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$tool_status', 'failed'] }, 1, 0] } },
          running: { $sum: { $cond: [{ $eq: ['$tool_status', 'running'] }, 1, 0] } }
        }
      },
      { $sort: { total_invocations: -1 } }
    ])

    res.json({
      success: true,
      stats: aggregateStats
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to aggregate tool metrics' })
  }
})

export default router