import api from '../../Auth/AxiosHelper'

export type AiTierKey =
  | 'small'
  | 'large'
  | 'thinking'
  | 'critiq'
  | 'summaryllm'
  | 'visionllm'
  | 'speechllm'
  | 'free-embed'

export interface AiTierMeta {
  key: AiTierKey
  label: string
  type: 'mode' | 'aux'
  icon: string
}

export interface AiProvider {
  _id: string
  tier: AiTierKey
  provider: string
  model: string
  api_base?: string
  api_key?: string
  api_key_masked?: string
  has_key?: boolean
  enabled: boolean
  priority: number
  createdAt?: string
  updatedAt?: string
}

export interface ReloadResult {
  applied: boolean
  total?: number
  error?: string
}

export interface EmbedVectorInfo {
  model?: string | null
  dimension?: number | null
  error?: string | null
  indexed_collections?: number
  indexed_dimensions?: number[]
}

export interface AiProvidersResponse {
  providers: AiProvider[]
  tiers: AiTierMeta[]
  total: number
}

export interface AiProviderInput {
  tier: AiTierKey
  provider: string
  model: string
  api_base?: string
  api_key?: string
  enabled: boolean
  priority: number
}

export const getAdminAiProviders = async (): Promise<AiProvidersResponse> => {
  const res = await api.get('/admin/ai-providers')
  return res.data
}

export const createAdminAiProvider = async (
  data: AiProviderInput
): Promise<{ message: string; provider: AiProvider; reload: ReloadResult; embedding?: EmbedVectorInfo }> => {
  const res = await api.post('/admin/ai-providers', data)
  return res.data
}

export const updateAdminAiProvider = async (
  id: string,
  data: AiProviderInput
): Promise<{ message: string; provider: AiProvider; reload: ReloadResult; embedding?: EmbedVectorInfo }> => {
  const res = await api.put(`/admin/ai-providers/${id}`, data)
  return res.data
}

export const deleteAdminAiProvider = async (
  id: string
): Promise<{ message: string; reload: ReloadResult }> => {
  const res = await api.delete(`/admin/ai-providers/${id}`)
  return res.data
}

export const reloadAdminAiProviders = async (): Promise<ReloadResult> => {
  const res = await api.post('/admin/ai-providers/reload')
  return res.data
}

export interface PingResult {
  ok: boolean
  latency_ms?: number
  detail?: string
  error?: string
}

export const testPingAdminAiProvider = async (data: {
  id?: string
  tier: AiTierKey
  provider: string
  model: string
  api_base?: string
  api_key?: string
}): Promise<PingResult> => {
  const res = await api.post('/admin/ai-providers/test-ping', data)
  return res.data
}

export const PROVIDER_PRESETS: { value: string; placeholder: string }[] = [
  { value: 'openai', placeholder: 'gpt-4o-mini' },
  { value: 'groq', placeholder: 'llama-3.3-70b-versatile' },
  { value: 'openrouter', placeholder: 'openai/gpt-4o' },
  { value: 'huggingface', placeholder: 'Qwen/Qwen2.5-7B-Instruct' },
  { value: 'anthropic', placeholder: 'claude-3-5-sonnet-latest' },
  { value: 'gemini', placeholder: 'gemini-1.5-flash' },
  { value: 'moonshot', placeholder: 'moonshot-v1-8k' },
  { value: 'deepinfra', placeholder: 'meta-llama/Meta-Llama-3-70B-Instruct' },
  { value: 'mistral', placeholder: 'mistral-large-latest' },
  { value: 'together', placeholder: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  { value: 'fireworks', placeholder: 'accounts/fireworks/models/llama-v3p2-70b-instruct' },
  { value: 'custom', placeholder: 'my-custom-model-id' },
]
