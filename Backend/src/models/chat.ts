// src/models/Chat.ts
import mongoose, { Document } from 'mongoose'

export interface IChat extends Document {
  title: string
  userId: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const chatSchema = new mongoose.Schema<IChat>({
  title: {
    type: String,
    default: 'New Chat',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  }
}, { timestamps: true })

export const Chat = mongoose.model<IChat>('Chat', chatSchema)