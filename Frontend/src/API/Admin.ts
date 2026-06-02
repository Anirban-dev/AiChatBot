// src/API/Admin.ts
import api from '../Auth/AxiosHelper'

const getPayload = (): Record<string, any> | null => {
  try {
    const match = document.cookie.match(/(?:^|;\s*)accessPayload=([^;]+)/)
    if (match) return JSON.parse(decodeURIComponent(match[1]))

    const raw = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
    if (raw) {
      const payload = JSON.parse(atob(raw.split('.')[1]))
      return payload
    }

    return null
  } catch {
    return null
  }
}

export const isAdminAuthenticated = (): boolean => {
  const payload = getPayload()
  return payload?.role === 'admin'
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserTier = 'free' | 'premium' | 'enterprise';

export interface UserLimits {
  tpm: number
  rpm: number
  tpmUsed: number
  rpmUsed: number
  tpmRemaining: number
  rpmRemaining: number
  isOverridden: boolean
}

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
  tier: UserTier
  limits: UserLimits
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

// UPDATED: Added new backend tracking metrics for frontend UI rendering
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
  streaming_requests: number                                // <-- ADDED
  provider_limits: {                                        // <-- ADDED
    remaining_tokens: number | null
    reset_requests_sec: number | null
  }
}

// UPDATED: Extended error schema payload option
export interface LLMEvent {
  type: 'success' | 'failure' | 'retry'
  model: string
  tier: string
  latency_ms: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  cost: number | null
  error: string | null
  error_details?: {                                         // <-- ADDED
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

// ── API Calls ─────────────────────────────────────────────────────────────────

export const getAdminStats = async (): Promise<AdminStats> => {
  const res = await api.get('/admin/stats')
  return res.data
}

export const getAdminUsers = async (search = '', page = 1, limit = 10): Promise<UsersResponse> => {
  const res = await api.get('/admin/users', { params: { search, page, limit } })
  return res.data
}

export const updateUserRole = async (userId: string, role: 'admin' | 'user'): Promise<any> => {
  const res = await api.put(`/admin/users/${userId}/role`, { role })
  return res.data
}

export const deleteAdminUser = async (userId: string): Promise<any> => {
  const res = await api.delete(`/admin/users/${userId}`)
  return res.data
}

export const getAdminLogs = async (
  search = '', status = '', action = '', page = 1, limit = 20
): Promise<LogsResponse> => {
  const res = await api.get('/admin/logs', { params: { search, status, action, page, limit } })
  return res.data
}

export const getAdminMetrics = async (): Promise<MetricsResponse> => {
  const res = await api.get('/admin/logs/metrics')
  return res.data
}

export const getLLMStatus = async (): Promise<LLMStatus> => {
  const res = await api.get('/admin/llm/status')
  return res.data
}

// UPDATED: Added new dynamic filter parameters for model isolating and status matching
export const getLLMEvents = async (
  since_hours = 24,
  type = '',
  tier = '',
  model = '',                                               // <-- ADDED
  status_code: number | null = null,                        // <-- ADDED
  limit = 100
): Promise<LLMEventsResponse> => {
  const qs = new URLSearchParams({
    since_hours: String(since_hours),
    ...(type && { type }),
    ...(tier && { tier }),
    ...(model && { model }),                                // <-- ADDED
    ...(status_code && { status_code: String(status_code) }), // <-- ADDED
    limit: String(limit),
  })
  const res = await api.get(`/admin/llm/events?${qs}`)
  return res.data
}

export const getUserLimits = async (userId: string): Promise<UserLimits> => {
  const res = await api.get(`/admin/users/${userId}/limits`)
  return res.data
}

export const updateUserLimits = async (
  userId: string,
  payload: { tpm?: number; rpm?: number; clear?: boolean }
): Promise<any> => {
  const res = await api.put(`/admin/users/${userId}/limits`, payload)
  return res.data
}

export const updateUserTier = async (
  userId: string,
  tier: 'free' | 'premium' | 'enterprise'
): Promise<any> => {
  const res = await api.put(`/admin/users/${userId}/tier`, { tier })
  return res.data
}