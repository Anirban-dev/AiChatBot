// src/models/Message.ts
import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true,
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
    name: String,
    size: Number,
    mimeType: String,
    extension: String,
  },
  file: { 
    type: String,
  },
  toolCalls: [{
    id: String,
    name: String,
    status: { type: String, enum: ['running', 'completed', 'failed'] },
    result: String,
    error: String,
  }],
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  isEdited: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true })

export const Message = mongoose.model('Message', messageSchema)