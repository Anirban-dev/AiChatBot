import { Router, Response } from 'express'
import { adminAuthMiddleware, AdminRequest } from '../../middleware/auth'
import { midLimiter } from '../../utils/ratelimitHelper'
import { LlmLog } from '../../models/llmLog'

const router = Router()
router.use(adminAuthMiddleware)

const LITELLM_MODELS = [
  { model: 'ai/gemma4:E2B', tier: 'small' },
  { model: 'openai/gemma3:12b', tier: 'small' },
  { model: 'groq/llama-3.3-70b-versatile', tier: 'large' },
  { model: 'groq/meta-llama/llama-4-maverick-17b-128e-instruct', tier: 'large' },
  { model: 'groq/moonshotai/kimi-k2-instruct', tier: 'large' },
  { model: 'openrouter/openai/gpt-oss-120b:free', tier: 'large' },
  { model: 'openrouter/qwen/qwen3-235b-a22b:free', tier: 'large' },
  { model: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free', tier: 'large' },
  { model: 'openrouter/deepseek/deepseek-r1:free', tier: 'thinking' },
  { model: 'openrouter/deepseek/deepseek-r1-0528:free', tier: 'thinking' },
  { model: 'groq/qwen/qwen3-32b', tier: 'thinking' },
  { model: 'groq/llama-3.3-70b-versatile', tier: 'critiq' },
  { model: 'openrouter/openai/gpt-oss-120b:free', tier: 'critiq' },
  { model: 'openrouter/qwen/qwen3-235b-a22b:free', tier: 'critiq' },
  { model: 'groq/llama-3.1-8b-instant', tier: 'summaryllm' },
  { model: 'groq/qwen/qwen3-32b', tier: 'summaryllm' },
  { model: 'openrouter/google/gemma-4-31b-it:free', tier: 'summaryllm' },
  { model: 'openrouter/nvidia/nemotron-3-nano-30b-a3b:free', tier: 'summaryllm' },
  { model: 'huggingface/Qwen/Qwen2.5-7B-Instruct', tier: 'summaryllm' },
  { model: 'ai/qwen3-vl:2B-UD-Q4_K_XL', tier: 'visionllm' },
  { model: 'openai/gemma3:12b', tier: 'visionllm' },
  { model: 'groq/whisper-large-v3-turbo', tier: 'speechllm' },
  { model: 'groq/whisper-large-v3', tier: 'speechllm' },
  { model: 'huggingface/sentence-transformers/all-MiniLM-L6-v2', tier: 'free-embed' },
  { model: 'openai/text-embedding-3-small', tier: 'free-embed' }
];

// GET /api/admin/llm/status
router.get('/status', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const allTiers = Array.from(new Set(LITELLM_MODELS.map(m => m.tier)));

    const pipeline = [
      {
        $group: {
          _id: '$model',
          success: { $sum: { $cond: [{ $eq: ['$type', 'success'] }, 1, 0] } },
          failure: { $sum: { $cond: [{ $eq: ['$type', 'failure'] }, 1, 0] } },
          cost: { $sum: '$cost' },
          prompt_tokens: { $sum: '$prompt_tokens' },
          completion_tokens: { $sum: '$completion_tokens' },
          latencies: { $push: '$latency_ms' },
        }
      }
    ];

    const aggregated = await LlmLog.aggregate(pipeline);
    const dbStats: Record<string, any> = {};

    for (const doc of aggregated) {
      const modelName = doc._id;
      if (!modelName) continue;
      const latencies = (doc.latencies || []).filter((l: any) => l !== null && l !== undefined);
      const avgLatency = latencies.length ? Math.round(latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length) : null;
      const p95Latency = latencies.length ? latencies.sort((a: number, b: number) => a - b)[Math.floor(latencies.length * 0.95)] : null;

      dbStats[modelName] = {
        success: doc.success,
        failure: doc.failure,
        retries: 0,
        avg_latency_ms: avgLatency,
        p95_latency_ms: p95Latency,
        cost: doc.cost || 0,
        prompt_tokens: doc.prompt_tokens || 0,
        completion_tokens: doc.completion_tokens || 0,
        cooling_down: false,
        streaming_requests: 0,
        provider_limits: {
          remaining_tokens: null,
          reset_requests_sec: null,
        }
      };
    }

    const modelStats: Record<string, any> = {};
    for (const item of LITELLM_MODELS) {
      const m = item.model;
      const tier = item.tier;
      if (dbStats[m]) {
        modelStats[m] = { ...dbStats[m], tier };
      } else {
        modelStats[m] = {
          tier,
          success: 0,
          failure: 0,
          retries: 0,
          avg_latency_ms: null,
          p95_latency_ms: null,
          cost: 0.0,
          prompt_tokens: 0,
          completion_tokens: 0,
          cooling_down: false,
          streaming_requests: 0,
          provider_limits: {
            remaining_tokens: null,
            reset_requests_sec: null,
          }
        };
      }
    }

    // Recent events list (last 50)
    const recentEventsRaw = await LlmLog.find().sort({ timestamp: -1 }).limit(50).lean();
    const recentEvents = recentEventsRaw.map((event: any) => ({
      id: String(event._id),
      _id: String(event._id),
      type: event.type,
      model: event.model,
      tier: event.virtual_model,
      latency_ms: event.latency_ms,
      prompt_tokens: event.prompt_tokens,
      completion_tokens: event.completion_tokens,
      cost: event.cost,
      error: event.error,
      error_details: event.error_details,
      timestamp: event.timestamp ? event.timestamp.toISOString() : null
    }));

    // Total cost
    const totalCostAgg = await LlmLog.aggregate([
      { $group: { _id: null, total_cost: { $sum: '$cost' } } }
    ]);
    const totalCost = totalCostAgg.length ? (totalCostAgg[0].total_cost || 0.0) : 0.0;

    res.json({
      model_stats: modelStats,
      recent_events: recentEvents,
      total_cost: totalCost,
      tiers: allTiers
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to aggregate LLM status directly from MongoDB' });
  }
});

// GET /api/admin/llm/events
router.get('/events', midLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const sinceHours = parseInt(req.query.since_hours as string) || 24;
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    const limit = parseInt(req.query.limit as string) || 100;

    const query: any = { timestamp: { $gte: since } };
    if (req.query.type) query.type = String(req.query.type);
    if (req.query.tier) query.virtual_model = String(req.query.tier);
    if (req.query.model) {
      const modelStr = String(req.query.model);
      query.$or = [{ model: modelStr }, { virtual_model: modelStr }];
    }
    if (req.query.status_code) {
      query['error_details.status_code'] = parseInt(req.query.status_code as string);
    }

    const docs = await LlmLog.find(query).sort({ timestamp: -1 }).limit(limit).lean();
    const events = await Promise.all(
      docs.map(async (doc: any) => {
        const event = {
          id: String(doc._id),
          _id: String(doc._id),
          type: doc.type,
          model: doc.model,
          tier: doc.virtual_model,
          chatId: doc.chatId,
          latency_ms: doc.latency_ms,
          prompt_tokens: doc.prompt_tokens,
          completion_tokens: doc.completion_tokens,
          cost: doc.cost,
          error: doc.error,
          error_details: doc.error_details,
          timestamp: doc.timestamp ? doc.timestamp.toISOString() : null
        };

        const matchingToolLog = await LlmLog.findOne({
          type: 'tool_call',
          $or: [
            { chatId: doc.chatId },
            { model: doc.model }
          ]
        }).sort({ timestamp: -1 }).lean();

        if (matchingToolLog) {
          event.error = `[Tool: ${matchingToolLog.tool_name}] Status: ${matchingToolLog.tool_status} | Args: ${matchingToolLog.tool_args} | Result: ${matchingToolLog.tool_result || 'None'}`;
          if (matchingToolLog.tool_status === 'failed') {
            event.type = 'failure';
          }
        }
        return event;
      })
    );

    res.json({ events, total: events.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve LLM events directly from MongoDB' });
  }
});

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