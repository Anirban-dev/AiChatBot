import api from '../../Auth/AxiosHelper'

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

/** Delete a single activity log entry by ID */
export const deleteActivityLog = async (logId: string): Promise<any> => {
  const res = await api.delete(`/admin/logs/${logId}`)
  return res.data
}

/** Clear all activity logs (hard delete — irreversible) */
export const clearAllActivityLogs = async (): Promise<any> => {
  const res = await api.delete('/admin/logs')
  return res.data
}