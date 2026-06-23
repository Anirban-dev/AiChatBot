// src/models/llmLog.ts
import mongoose, { Schema } from 'mongoose'

export interface ILlmLog {
  type: 'success' | 'failure' | 'retry' | 'tool_call'
  model?: string
  virtual_model?: string
  userId?: mongoose.Types.ObjectId
  chatId?: mongoose.Types.ObjectId
  // ── Chat request lifecycle fields ──────────────────────────────────────────
  mode?: string           // 'small' | 'large' | 'thinking' | 'critiq'
  ttft_ms?: number        // time-to-first-token in milliseconds
  total_chunks?: number   // total stream chunks received
  request_id?: string     // optional correlation ID
  // ── LLM metrics ────────────────────────────────────────────────────────────
  latency_ms?: number
  prompt_tokens?: number
  completion_tokens?: number
  cost?: number
  // ── Error info ─────────────────────────────────────────────────────────────
  error?: string
  error_details?: any
  // ── Tool call fields ───────────────────────────────────────────────────────
  tool_name?: string
  tool_args?: string
  tool_status?: 'running' | 'completed' | 'failed'
  tool_result?: string
  // ── Timestamps ─────────────────────────────────────────────────────────────
  timestamp: Date
}

const llmLogSchema = new Schema<ILlmLog>({
  type:              { type: String, enum: ['success', 'failure', 'retry', 'tool_call'], required: true },
  model:             { type: String, index: true },
  virtual_model:     { type: String, index: true },
  userId:            { type: Schema.Types.ObjectId, ref: 'User', index: true },
  chatId:            { type: Schema.Types.ObjectId, ref: 'Chat', index: true },
  mode:              { type: String },
  ttft_ms:           { type: Number },
  total_chunks:      { type: Number },
  request_id:        { type: String },
  latency_ms:        { type: Number },
  prompt_tokens:     { type: Number },
  completion_tokens: { type: Number },
  cost:              { type: Number },
  error:             { type: String },
  error_details:     { type: Schema.Types.Mixed },
  tool_name:         { type: String },
  tool_args:         { type: String },
  tool_status:       { type: String, enum: ['running', 'completed', 'failed'] },
  tool_result:       { type: String },
  timestamp:         { type: Date, default: Date.now },
}, {
  timestamps:  { createdAt: 'timestamp', updatedAt: false },
  collection:  'llmlogs',
})

// Compound index for efficient per-user and per-chat queries
llmLogSchema.index({ userId: 1, timestamp: -1 })
llmLogSchema.index({ chatId: 1, timestamp: -1 })
llmLogSchema.index({ type: 1, timestamp: -1 })

export const LlmLog = mongoose.model<ILlmLog>('LlmLog', llmLogSchema)