// src/models/Chat.ts
import mongoose, { Document } from 'mongoose'

export interface IChat extends Document {
  title: string
  userId: mongoose.Types.ObjectId
}

const chatSchema = new mongoose.Schema<IChat>({
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

export const Chat = mongoose.model<IChat>('Chat', chatSchema)