// src/models/llmLog.ts
import mongoose, { Schema } from 'mongoose'

// 1. Define the raw data structure interface WITHOUT extending Document
export interface ILlmLog {
  type: 'success' | 'failure' | 'retry' | 'tool_call'
  model?: string            // Safe now! No conflict with Mongoose internals.
  virtual_model?: string
  userId?: mongoose.Types.ObjectId
  chatId?: mongoose.Types.ObjectId
  latency_ms?: number
  prompt_tokens?: number
  completion_tokens?: number
  cost?: number
  error?: string
  error_details?: any
  tool_name?: string
  tool_args?: string
  tool_status?: 'running' | 'completed' | 'failed'
  tool_result?: string
  timestamp: Date
}

// 2. Pass the interface into the Schema definition
const llmLogSchema = new Schema<ILlmLog>({
  type: { type: String, enum: ['success', 'failure', 'retry', 'tool_call'], required: true },
  model: { type: String },
  virtual_model: { type: String },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  chatId: { type: Schema.Types.ObjectId, ref: 'Chat' },
  latency_ms: { type: Number },
  prompt_tokens: { type: Number },
  completion_tokens: { type: Number },
  cost: { type: Number },
  error: { type: String },
  error_details: { type: Schema.Types.Mixed },
  tool_name: { type: String },
  tool_args: { type: String },
  tool_status: { type: String, enum: ['running', 'completed', 'failed'] },
  tool_result: { type: String },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'timestamp', updatedAt: false }, collection: 'llmlogs' })

export const LlmLog = mongoose.model<ILlmLog>('LlmLog', llmLogSchema)