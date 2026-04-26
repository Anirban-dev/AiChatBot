// src/models/Chat.ts
import mongoose from 'mongoose'

const chatSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  }
}, { timestamps: true })

export const Chat = mongoose.model('Chat', chatSchema)