// API/Admin.ts
// Uses its own axios instance that carries the ADMIN token (separate from user token)
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_BASE_URL

// ── Admin token lives in sessionStorage (tab-only, cleared on close) ──────────
const ADMIN_TOKEN_KEY = import.meta.env.VITE_ADMIN_TOKEN

export const getAdminToken = (): string | null =>
  sessionStorage.getItem(ADMIN_TOKEN_KEY)

export const setAdminToken = (token: string) =>
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token)

export const clearAdminToken = () =>
  sessionStorage.removeItem(ADMIN_TOKEN_KEY)

export const isAdminAuthenticated = (): boolean => !!getAdminToken()

// Dedicated axios instance — does NOT share user tokens
const adminApi = axios.create({ baseURL: BASE_URL })

adminApi.interceptors.request.use((config) => {
  const token = getAdminToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error || err.message || 'Admin request failed'
    if (err.response?.status === 401) {
      clearAdminToken() // Token expired — force re-auth
    }
    throw new Error(message)
  }
)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number
  totalChats: number
  totalMessages: number
  totalLogs: number
  avgLatency: number
  successRate: number
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'user'
  googleAuth: boolean
  createdAt: string
  chatsCount: number
  messagesCount: number
}

export interface UsersResponse {
  total: number
  page: number
  limit: number
  users: AdminUser[]
}

export interface ActivityLog {
  _id: string
  userId?: { _id: string; name: string; email: string }
  action: string
  status: 'success' | 'failed'
  method: string
  path: string
  ipAddress?: string
  userAgent?: string
  latency?: number
  details?: any
  createdAt: string
}

export interface LogsResponse {
  total: number
  page: number
  limit: number
  logs: ActivityLog[]
}

export interface MetricsResponse {
  dailyRequests: Array<{ _id: string; count: number; success: number; failed: number }>
  actionTypes: Array<{ _id: string; count: number }>
}

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
}

export interface LLMEvent {
  type: 'success' | 'failure' | 'retry'
  model: string
  tier: string
  latency_ms: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  cost: number | null
  error: string | null
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

// ── API Calls ─────────────────────────────────────────────────────────────────

export const adminLogin = async (password: string): Promise<string> => {
  try {
    const res = await axios.post(`${BASE_URL}/admin/login`, { password })
    return res.data.accessToken
  } catch (err: any) {
    const errorMessage = err.response?.data?.error || err.message || 'Authentication failed'
    throw new Error(errorMessage)
  }
}

export const getAdminStats = async (): Promise<AdminStats> => {
  const res = await adminApi.get('/admin/stats')
  return res.data
}

export const getAdminUsers = async (search = '', page = 1, limit = 10): Promise<UsersResponse> => {
  const res = await adminApi.get('/admin/users', { params: { search, page, limit } })
  return res.data
}

export const updateUserRole = async (userId: string, role: 'admin' | 'user'): Promise<any> => {
  const res = await adminApi.put(`/admin/users/${userId}/role`, { role })
  return res.data
}

export const deleteAdminUser = async (userId: string): Promise<any> => {
  const res = await adminApi.delete(`/admin/users/${userId}`)
  return res.data
}

export const getAdminLogs = async (
  search = '', status = '', action = '', page = 1, limit = 20
): Promise<LogsResponse> => {
  const res = await adminApi.get('/admin/logs', { params: { search, status, action, page, limit } })
  return res.data
}

export const getAdminMetrics = async (): Promise<MetricsResponse> => {
  const res = await adminApi.get('/admin/logs/metrics')
  return res.data
}

export const getLLMStatus = async (): Promise<LLMStatus> => {
  const res = await adminApi.get('/admin/llm/status', {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAdminToken()}`,
    },
  })
  return res.data
}

export const getLLMEvents = async (
  since_hours = 24,
  type = '',
  tier = '',
  limit = 100
): Promise<LLMEventsResponse> => {
  const qs = new URLSearchParams({
    since_hours: String(since_hours),
    ...(type  && { type }),
    ...(tier  && { tier }),
    limit: String(limit),
  })
  const res = await adminApi.get(`/admin/llm/events?${qs}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAdminToken()}`,
    },
  })
  return res.data
}
