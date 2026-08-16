// src/models/aiProvider.ts
import mongoose from 'mongoose'

// Fixed tier/mode slots managed by the admin. The 4 chat modes are constant;
// the aux tiers power summary, vision, speech and embeddings.
export const AI_TIERS = [
  { key: 'small',      label: 'Chat — Small',        type: 'mode', icon: '✦' },
  { key: 'large',      label: 'Tools — Large',       type: 'mode', icon: '⚡' },
  { key: 'thinking',   label: 'Reason — Thinking',   type: 'mode', icon: '🧠' },
  { key: 'critiq',     label: 'Critiq — Review',     type: 'mode', icon: '🧐' },
  { key: 'summaryllm', label: 'Summarization',       type: 'aux',  icon: '📝' },
  { key: 'visionllm',  label: 'Vision',              type: 'aux',  icon: '👁' },
  { key: 'speechllm',  label: 'Speech (ASR)',        type: 'aux',  icon: '🎙' },
  { key: 'free-embed', label: 'Embeddings',          type: 'aux',  icon: '🧲' },
] as const

export type AiTier = typeof AI_TIERS[number]['key']

export interface IAiProvider {
  tier: AiTier
  provider: string // litellm provider prefix, e.g. openai, groq, openrouter…
  model: string
  api_base?: string
  api_key?: string
  enabled: boolean
  priority: number
  createdAt?: Date
  updatedAt?: Date
}

const aiProviderSchema = new mongoose.Schema<IAiProvider>(
  {
    tier: {
      type: String,
      required: true,
      enum: AI_TIERS.map(t => t.key),
      index: true,
    },
    provider: {
      type: String,
      required: true,
      default: 'openai',
      trim: true,
      lowercase: true,
    },
    model: { type: String, required: true, trim: true },
    api_base: { type: String, trim: true },
    api_key: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    priority: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
)

export const AiProvider = mongoose.model<IAiProvider>('AiProvider', aiProviderSchema)