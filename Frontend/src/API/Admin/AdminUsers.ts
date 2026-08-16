import api from '../../Auth/AxiosHelper'

export type UserTier = string;
export type WindowPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface ModelLimitDetail {
  rpm: number
  tpm: number
  period?: WindowPeriod
}

export interface UploadLimitDetail {
  max: number
  windowSec: number
  label: string
  period?: WindowPeriod
}

export interface UserLimits {
  tpmUsed: number
  rpmUsed: number
  models?: {
    small: ModelLimitDetail
    large: ModelLimitDetail
    thinking: ModelLimitDetail
    critiq: ModelLimitDetail
  }
  uploads?: {
    image: UploadLimitDetail
    video: UploadLimitDetail
    other: UploadLimitDetail
  }
  modelsUsage?: Record<string, { rpmUsed: number; tpmUsed: number }>
  uploadsUsage?: Record<string, { used: number }>
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

export interface UpdateUserLimitsPayload {
  clear?: boolean
  modelLimits?: {
    small?: { rpm?: number; tpm?: number; period?: WindowPeriod }
    large?: { rpm?: number; tpm?: number; period?: WindowPeriod }
    thinking?: { rpm?: number; tpm?: number; period?: WindowPeriod }
    critiq?: { rpm?: number; tpm?: number; period?: WindowPeriod }
  }
  uploadLimits?: {
    image?: { max?: number; period?: WindowPeriod }
    video?: { max?: number; period?: WindowPeriod }
    other?: { max?: number; period?: WindowPeriod }
  }
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

export const getUserLimits = async (userId: string): Promise<any> => {
  const res = await api.get(`/admin/users/${userId}/limits`)
  return res.data
}

export const updateUserLimits = async (
  userId: string,
  payload: UpdateUserLimitsPayload
): Promise<any> => {
  const res = await api.put(`/admin/users/${userId}/limits`, payload)
  return res.data
}

export const updateUserTier = async (
  userId: string,
  tier: string
): Promise<any> => {
  const res = await api.put(`/admin/users/${userId}/tier`, { tier })
  return res.data
}