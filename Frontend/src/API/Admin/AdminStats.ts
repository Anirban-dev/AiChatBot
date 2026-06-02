import api from '../../Auth/AxiosHelper'

export interface AdminStats {
  totalUsers: number
  totalChats: number
  totalMessages: number
  totalLogs: number
  avgLatency: number
  successRate: number
}

export const getAdminStats = async (): Promise<AdminStats> => {
  const res = await api.get('/admin/stats')
  return res.data
}