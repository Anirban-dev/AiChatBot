// src/models/msg.ts
// Message model for chat interactions
import mongoose, { Document, Schema } from 'mongoose'

export interface FileMetadata {
  name: string
  size: number
  mimeType: string
  extension: string
}

export interface ToolCall {
  id: string
  name: string
  status: 'running' | 'completed' | 'failed'
  result?: string
  error?: string
}

export interface MessageDocument extends Document {
  chatId: mongoose.Types.ObjectId
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  fileInfo?: FileMetadata
  file?: string
  toolCalls?: ToolCall[]
  parentId?: mongoose.Types.ObjectId | null
  threadRootId?: mongoose.Types.ObjectId | null
  threadHeadId?: mongoose.Types.ObjectId | null
  createdAt: Date
}

const MessageSchema = new Schema<MessageDocument>(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    reasoning: {
      type: String,
    },
    fileInfo: {
      name: { type: String },
      size: { type: Number },
      mimeType: { type: String },
      extension: { type: String },
    },
    file: {
      type: String,
    },
    toolCalls: [{
      id: { type: String, required: true },
      name: { type: String },
      status: {
        type: String,
        enum: ['running', 'completed', 'failed'],
      },
      result: String,
      error: String,
    }],
    parentId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    threadRootId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    threadHeadId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

export const Message = mongoose.model<MessageDocument>('Message', MessageSchema)

