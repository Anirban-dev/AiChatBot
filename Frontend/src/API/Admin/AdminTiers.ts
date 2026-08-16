import api from '../../Auth/AxiosHelper'

export type WindowPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly'

export interface ModelLimitConfig {
  rpm: number
  tpm: number
  period?: WindowPeriod
}

export interface UploadLimitConfig {
  max: number
  windowSec: number
  label: string
  period?: WindowPeriod
}

export interface TierConfig {
  _id?: string
  name: string
  models: {
    small: ModelLimitConfig
    large: ModelLimitConfig
    thinking: ModelLimitConfig
    critiq: ModelLimitConfig
  }
  uploads: {
    image: UploadLimitConfig
    video: UploadLimitConfig
    other: UploadLimitConfig
  }
  createdAt?: string
  updatedAt?: string
}

export interface TiersResponse {
  tiers: TierConfig[]
}

export const getAdminTiers = async (): Promise<TiersResponse> => {
  const res = await api.get('/admin/tiers')
  return res.data
}

export const createAdminTier = async (data: Omit<TierConfig, '_id' | 'createdAt' | 'updatedAt'>): Promise<{ message: string; tier: TierConfig }> => {
  const res = await api.post('/admin/tiers', data)
  return res.data
}

export const updateAdminTier = async (
  name: string,
  data: Partial<Pick<TierConfig, 'models' | 'uploads'>>
): Promise<{ message: string; tier: TierConfig }> => {
  const res = await api.put(`/admin/tiers/${name}`, data)
  return res.data
}

export const deleteAdminTier = async (name: string): Promise<{ message: string }> => {
  const res = await api.delete(`/admin/tiers/${name}`)
  return res.data
}
