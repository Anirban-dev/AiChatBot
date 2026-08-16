// src/models/log.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface ILog extends Document {
  userId?: mongoose.Types.ObjectId
  action: string      // e.g. 'LOGIN', 'SIGNUP', 'AI_CHAT', 'CREATE_CHAT', 'DELETE_CHAT', etc.
  status: 'success' | 'failed'
  method: string      // e.g. 'POST', 'GET'
  path: string        // e.g. '/api/chats'
  ipAddress?: string
  userAgent?: string
  latency?: number    // in milliseconds
  details?: Schema.Types.Mixed // e.g. { error: string } or { model: string, chat_id: string }
  createdAt: Date
}

const logSchema = new Schema<ILog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  status: { type: String, enum: ['success', 'failed'], required: true },
  method: { type: String, required: true },
  path: { type: String, required: true },
  ipAddress: { type: String },
  userAgent: { type: String },
  latency: { type: Number },
  details: { type: Schema.Types.Mixed }
}, { timestamps: true, expireAfterSeconds: 30 * 24 * 60 * 60 }) // 30-day TTL

export const Log = mongoose.model<ILog>('Log', logSchema)
