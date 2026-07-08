import { Router, Response } from 'express'
import { adminAuthMiddleware, AdminRequest } from '../../middleware/auth'
import { midLimiter } from '../../utils/ratelimitHelper'
import { LlmLog } from '../../models/llmLog'
import { PipelineStage } from 'mongoose';

const router = Router()
router.use(adminAuthMiddleware)

const AI_API = process.env.AI_API || 'http://localhost:8000/agent'

/** Fetch the canonical model list from Python. Cached for 60s. */
let _modelCache: any[] | null = null
let _modelCacheAt  = 0
const MODEL_CACHE_TTL = 60_000  // 60 seconds

async function getModels(): Promise<any[]> {
  if (_modelCache && Date.now() - _modelCacheAt < MODEL_CACHE_TTL) {
    return _modelCache
  }
  try {
    const res = await fetch(`${AI_API}/models`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const json = await res.json() as any
      _modelCache   = json.models || []
      _modelCacheAt = Date.now()
      return _modelCache!
    }
  } catch { /* Python down — return cached or empty */ }
  return _modelCache ?? []
}


// ── GET /api/admin/llm/status ─────────────────────────────────────────────────
router.get('/status', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const models  = await getModels()
    const allTiers = Array.from(new Set(models.map((m: any) => m.tier)))

    const pipeline = [
      {
        $group: {
          _id:               '$model',
          success:          { $sum: { $cond: [{ $eq: ['$type', 'success'] }, 1, 0] } },
          failure:          { $sum: { $cond: [{ $eq: ['$type', 'failure'] }, 1, 0] } },
          cost:             { $sum: '$cost' },
          prompt_tokens:    { $sum: '$prompt_tokens' },
          completion_tokens:{ $sum: '$completion_tokens' },
          latencies:        { $push: '$latency_ms' },
          last_used:        { $max: '$timestamp' },
          last_success:     { $max: { $cond: [{ $eq: ['$type', 'success'] }, '$timestamp', null] } },
          last_failure:     { $max: { $cond: [{ $eq: ['$type', 'failure'] }, '$timestamp', null] } },
        }
      }
    ]

    const aggregated = await LlmLog.aggregate(pipeline)
    const dbStats: Record<string, any> = {}

    for (const doc of aggregated) {
      const modelName = doc._id
      if (!modelName) continue
      const lats      = (doc.latencies || []).filter((l: any) => l != null)
      const avgLatency = lats.length ? Math.round(lats.reduce((a: number, b: number) => a + b, 0) / lats.length) : null
      const p95Latency = lats.length ? lats.sort((a: number, b: number) => a - b)[Math.floor(lats.length * 0.95)] : null
      const total      = doc.success + doc.failure
      const successRate = total > 0 ? Math.round((doc.success / total) * 1000) / 10 : null

      const lastSuccess = doc.last_success
      const healthy = lastSuccess && (Date.now() - new Date(lastSuccess).getTime()) < 86_400_000

      dbStats[modelName] = {
        success:           doc.success,
        failure:           doc.failure,
        retries:           0,
        avg_latency_ms:    avgLatency,
        p95_latency_ms:    p95Latency,
        cost:              doc.cost || 0,
        prompt_tokens:     doc.prompt_tokens || 0,
        completion_tokens: doc.completion_tokens || 0,
        success_rate:      successRate,
        last_used:         doc.last_used ? new Date(doc.last_used).toISOString() : null,
        last_success:      lastSuccess  ? new Date(lastSuccess).toISOString()   : null,
        last_failure:      doc.last_failure ? new Date(doc.last_failure).toISOString() : null,
        // Health derived from actual log data — no pings
        health:            !total ? 'unknown' : healthy ? 'healthy' : doc.success > 0 ? 'degraded' : 'unhealthy',
        cooling_down:      false,
        streaming_requests: 0,
        provider_limits: { remaining_tokens: null, reset_requests_sec: null },
      }
    }

    // Build final model_stats from Python's live model list
    const modelStats: Record<string, any> = {}
    for (const item of models) {
      const m    = item.model
      const tier = item.tier
      modelStats[m] = dbStats[m]
        ? { ...dbStats[m], tier }
        : {
            tier,
            success: 0, failure: 0, retries: 0,
            avg_latency_ms: null, p95_latency_ms: null,
            cost: 0.0, prompt_tokens: 0, completion_tokens: 0,
            success_rate: null, last_used: null, last_success: null, last_failure: null,
            health: 'unknown', cooling_down: false, streaming_requests: 0,
            provider_limits: { remaining_tokens: null, reset_requests_sec: null },
          }
    }

    // Recent events (last 50, newest first)
    const recentEventsRaw = await LlmLog.find().sort({ timestamp: -1 }).limit(50).lean()
    const recentEvents = recentEventsRaw.map((ev: any) => ({
      id:                String(ev._id),
      type:              ev.type,
      model:             ev.model,
      tier:              ev.virtual_model,
      userId:            ev.userId ? String(ev.userId) : undefined,
      chatId:            ev.chatId ? String(ev.chatId) : undefined,
      mode:              ev.mode,
      latency_ms:        ev.latency_ms,
      ttft_ms:           ev.ttft_ms,
      total_chunks:      ev.total_chunks,
      prompt_tokens:     ev.prompt_tokens,
      completion_tokens: ev.completion_tokens,
      cost:              ev.cost,
      error:             ev.error,
      error_details:     ev.error_details,
      timestamp:         ev.timestamp ? new Date(ev.timestamp).toISOString() : null,
    }))

    const totalCostAgg = await LlmLog.aggregate([{ $group: { _id: null, total_cost: { $sum: '$cost' } } }])
    const totalCost    = totalCostAgg.length ? (totalCostAgg[0].total_cost || 0.0) : 0.0

    res.json({ model_stats: modelStats, recent_events: recentEvents, total_cost: totalCost, tiers: allTiers })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to aggregate LLM status' })
  }
})


// ── GET /api/admin/llm/events ─────────────────────────────────────────────────
router.get('/events', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const sinceHours = parseInt(req.query.since_hours as string) || 24
    const since      = new Date(Date.now() - sinceHours * 3_600_000)
    const limit      = parseInt(req.query.limit as string) || 100

    const query: any = { timestamp: { $gte: since } }
    if (req.query.type)        query.type          = String(req.query.type)
    if (req.query.tier)        query.virtual_model  = String(req.query.tier)
    if (req.query.model) {
      const m = String(req.query.model)
      query.$or = [{ model: m }, { virtual_model: m }]
    }
    if (req.query.userId)      query.userId        = req.query.userId
    if (req.query.chatId)      query.chatId        = req.query.chatId
    if (req.query.status_code) query['error_details.status_code'] = parseInt(req.query.status_code as string)

    const docs   = await LlmLog.find(query).sort({ timestamp: -1 }).limit(limit).populate('userId', 'name email').lean()
    const events = docs.map((doc: any) => ({
      id:                String(doc._id),
      type:              doc.type,
      model:             doc.model,
      tier:              doc.virtual_model,
      userId:            doc.userId ? (typeof doc.userId === 'object' ? { id: String(doc.userId._id), name: doc.userId.name, email: doc.userId.email } : String(doc.userId)) : undefined,
      chatId:            doc.chatId ? String(doc.chatId) : undefined,
      mode:              doc.mode,
      latency_ms:        doc.latency_ms,
      ttft_ms:           doc.ttft_ms,
      total_chunks:      doc.total_chunks,
      prompt_tokens:     doc.prompt_tokens,
      completion_tokens: doc.completion_tokens,
      cost:              doc.cost,
      error:             doc.error,
      error_details:     doc.error_details,
      timestamp:         doc.timestamp ? new Date(doc.timestamp).toISOString() : null,
    }))

    res.json({ events, total: events.length })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve LLM events' })
  }
})


// ── GET /api/admin/llm/user-logs — per-user LLM usage ─────────────────────────
router.get('/user-logs', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const sinceHours = parseInt(req.query.since_hours as string) || 168  // 7 days default
    const since      = new Date(Date.now() - sinceHours * 3_600_000)
    const limit      = parseInt(req.query.limit as string) || 50

    const pipeline: PipelineStage[] = [
      { $match: { timestamp: { $gte: since }, userId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id:               '$userId',
          total_requests:    { $sum: 1 },
          success:           { $sum: { $cond: [{ $eq: ['$type', 'success'] }, 1, 0] } },
          failure:           { $sum: { $cond: [{ $eq: ['$type', 'failure'] }, 1, 0] } },
          total_tokens:      { $sum: { $add: ['$prompt_tokens', '$completion_tokens'] } },
          total_cost:        { $sum: '$cost' },
          avg_latency_ms:    { $avg: '$latency_ms' },
          avg_ttft_ms:       { $avg: '$ttft_ms' },
          last_request:      { $max: '$timestamp' },
          models_used:       { $addToSet: '$model' },
          tiers_used:        { $addToSet: '$virtual_model' },
        }
      },
      { $sort: { total_requests: -1 } },
      { $limit: limit },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    ]

    const stats = await LlmLog.aggregate(pipeline)
    const result = stats.map((s: any) => ({
      userId:          String(s._id),
      user:            s.user ? { name: s.user.name, email: s.user.email } : null,
      total_requests:  s.total_requests,
      success:         s.success,
      failure:         s.failure,
      total_tokens:    s.total_tokens || 0,
      total_cost:      Math.round((s.total_cost || 0) * 1_000_000) / 1_000_000,
      avg_latency_ms:  s.avg_latency_ms ? Math.round(s.avg_latency_ms) : null,
      avg_ttft_ms:     s.avg_ttft_ms    ? Math.round(s.avg_ttft_ms)    : null,
      last_request:    s.last_request ? new Date(s.last_request).toISOString() : null,
      models_used:     s.models_used,
      tiers_used:      s.tiers_used,
    }))

    res.json({ user_logs: result, total: result.length, since_hours: sinceHours })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to aggregate user LLM usage' })
  }
})


// ── DELETE /api/admin/llm/events/:id ─────────────────────────────────────────
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


// ── DELETE /api/admin/llm/events ─────────────────────────────────────────────
router.delete('/events', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const { type, tier, model } = req.query
    const query: any = {}
    if (type)  query.type          = type
    if (tier)  query.virtual_model = tier
    if (model) query.model         = model

    const result = await LlmLog.deleteMany(query)
    res.json({ success: true, message: `${result.deletedCount} LLM log entries cleared successfully` })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to clear LLM log entries' })
  }
})


// ── GET /api/admin/llm/tool-calls ────────────────────────────────────────────
router.get('/tool-calls', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const limit      = parseInt(req.query.limit as string) || 50
    const { tool_name, tool_status, userId, chatId } = req.query

    const query: any = { type: 'tool_call' }
    if (tool_name)  query.tool_name  = String(tool_name)
    if (tool_status) query.tool_status = String(tool_status)
    if (userId)     query.userId     = userId
    if (chatId)     query.chatId     = chatId

    const toolCalls = await LlmLog.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('userId', 'name email')
      .lean()

    res.json({ success: true, count: toolCalls.length, data: toolCalls })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve agent tool logs' })
  }
})


// ── GET /api/admin/llm/tool-calls/stats ──────────────────────────────────────
router.get('/tool-calls/stats', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const aggregateStats = await LlmLog.aggregate([
      { $match: { type: 'tool_call' } },
      {
        $group: {
          _id:                '$tool_name',
          total_invocations:  { $sum: 1 },
          completed:          { $sum: { $cond: [{ $eq: ['$tool_status', 'completed'] }, 1, 0] } },
          failed:             { $sum: { $cond: [{ $eq: ['$tool_status', 'failed']    }, 1, 0] } },
          running:            { $sum: { $cond: [{ $eq: ['$tool_status', 'running']   }, 1, 0] } },
        }
      },
      { $sort: { total_invocations: -1 } },
    ])

    res.json({ success: true, stats: aggregateStats })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to aggregate tool metrics' })
  }
})

export default router