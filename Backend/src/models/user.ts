// src/models/User.ts
import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
  },
  googleAuth: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (_, ret: any) => {
      delete ret.password
      delete ret.__v
      return ret
    }
  }
})

export const User = mongoose.model('User', userSchema)