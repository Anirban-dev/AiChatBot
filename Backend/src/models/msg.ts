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
  fileInfo: {
    name: String,
    size: Number,
    mimeType: String,
    extension: String,
  },
}, { timestamps: true })

export const Message = mongoose.model('Message', messageSchema)