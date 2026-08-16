// src/models/User.ts
import mongoose from 'mongoose'

export interface IModelLimit {
  rpm?: number
  tpm?: number
}

export interface IUploadLimit {
  max?: number
}

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
  },
  tier: {
    type: String,
    default: 'free',
  },
  // Granular model overrides: small, large, thinking, critiq
  modelLimits: {
    small:    { rpm: Number, tpm: Number, period: { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly'] } },
    large:    { rpm: Number, tpm: Number, period: { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly'] } },
    thinking: { rpm: Number, tpm: Number, period: { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly'] } },
    critiq:   { rpm: Number, tpm: Number, period: { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly'] } },
  },
  // Granular upload overrides: image, video, other
  uploadLimits: {
    image: { max: Number, period: { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly'] } },
    video: { max: Number, period: { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly'] } },
    other: { max: Number, period: { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly'] } },
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