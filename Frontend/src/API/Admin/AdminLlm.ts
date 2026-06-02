import api from '../../Auth/AxiosHelper'

export interface ModelStat {
  tier: string
  success: number
  failure: number
  retries: number
  avg_latency_ms: number | null
  p95_latency_ms: number | null
  cost: number
  prompt_tokens: number
  completion_tokens: number
  cooling_down: boolean
  streaming_requests: number
  provider_limits: {
    remaining_tokens: number | null
    reset_requests_sec: number | null
  }
}

export interface LLMEvent {
  _id: string // Exposed for targeting deletions
  type: 'success' | 'failure' | 'retry'
  model: string
  tier: string
  latency_ms: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  cost: number | null
  error: string | null
  status_code: number | null // Handled smoothly via root normalization mapping
  error_details?: {
    status_code: number | null
  }
  timestamp: string
}

export interface LLMStatus {
  model_stats: Record<string, ModelStat>
  total_cost: number
  tiers: string[]
}

export interface LLMEventsResponse {
  events: LLMEvent[]
  total: number
}

export interface ToolCallLog {
  _id: string
  type: 'tool_call'
  userId?: { _id: string; name: string; email: string } | string
  chatId?: string
  tool_name: string
  tool_args: string
  tool_status: 'running' | 'completed' | 'failed'
  tool_result?: string
  timestamp: string
}

export interface ToolCallsResponse {
  success: boolean
  count: number
  data: ToolCallLog[]
}

export interface ToolMetric {
  _id: string 
  total_invocations: number
  completed: number
  failed: number
  running: number
}

export interface ToolStatsResponse {
  success: boolean
  stats: ToolMetric[]
}

export const getLLMStatus = async (): Promise<LLMStatus> => {
  const res = await api.get('/admin/llm/status')
  return res.data
}

export const getLLMEvents = async (
  since_hours = 24,
  type = '',
  tier = '',
  model = '',
  status_code: number | null = null,
  limit = 100
): Promise<LLMEventsResponse> => {
  const qs = new URLSearchParams({
    since_hours: String(since_hours),
    ...(type && { type }),
    ...(tier && { tier }),
    ...(model && { model }),
    ...(status_code && { status_code: String(status_code) }),
    limit: String(limit),
  })
  const res = await api.get(`/admin/llm/events?${qs}`)
  return res.data
}

export const getAgentToolCalls = async (
  filters: {
    tool_name?: string
    tool_status?: 'running' | 'completed' | 'failed' | ''
    userId?: string
    chatId?: string
    limit?: number
  } = {}
): Promise<ToolCallsResponse> => {
  const params: Record<string, any> = { ...filters }
  if (!params.limit) params.limit = 50
  const res = await api.get('/admin/llm/tool-calls', { params })
  return res.data
}

export const getAgentToolStats = async (): Promise<ToolStatsResponse> => {
  const res = await api.get('/admin/llm/tool-calls/stats')
  return res.data
}

export const deleteLLMEvent = async (eventId: string): Promise<any> => {
  const res = await api.delete(`/admin/llm/events/${eventId}`)
  return res.data
}

export const clearAllLLMEvents = async (
  filters: { type?: string; tier?: string; model?: string } = {}
): Promise<any> => {
  const res = await api.delete('/admin/llm/events', { params: filters })
  return res.data
}