import api from '../../Auth/AxiosHelper'

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