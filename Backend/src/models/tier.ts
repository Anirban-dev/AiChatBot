// src/models/tier.ts
import mongoose from 'mongoose'
import type { WindowPeriod } from '../utils/windowHelper'

export interface IModelLimitConfig {
  rpm: number
  tpm: number
  period?: WindowPeriod // defaults to 'hourly'
}

export interface IUploadLimitConfig {
  max: number
  windowSec: number
  label: string
  period?: WindowPeriod // defaults to 'hourly' (or 'daily' for video)
}

export interface ITierConfig {
  name: string // unique slug, e.g. "free", "pro", "team"
  models: {
    small:    IModelLimitConfig
    large:    IModelLimitConfig
    thinking: IModelLimitConfig
    critiq:   IModelLimitConfig
  }
  uploads: {
    image: IUploadLimitConfig
    video: IUploadLimitConfig
    other: IUploadLimitConfig
  }
  createdAt?: Date
  updatedAt?: Date
}

const modelLimitSchema = new mongoose.Schema<IModelLimitConfig>(
  {
    rpm:    { type: Number, required: true, min: 1 },
    tpm:    { type: Number, required: true, min: 1 },
    period: { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly'], default: 'hourly' },
  },
  { _id: false }
)

const uploadLimitSchema = new mongoose.Schema<IUploadLimitConfig>(
  {
    max:       { type: Number, required: true, min: 1 },
    windowSec: { type: Number, required: true, min: 1 },
    label:     { type: String, required: true },
    period:    { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly'], default: 'hourly' },
  },
  { _id: false }
)

const tierConfigSchema = new mongoose.Schema<ITierConfig>(
  {
    name: {
      type:     String,
      required: true,
      unique:   true,
      lowercase: true,
      trim:     true,
    },
    models: {
      small:    { type: modelLimitSchema, required: true },
      large:    { type: modelLimitSchema, required: true },
      thinking: { type: modelLimitSchema, required: true },
      critiq:   { type: modelLimitSchema, required: true },
    },
    uploads: {
      image: { type: uploadLimitSchema, required: true },
      video: { type: uploadLimitSchema, required: true },
      other: { type: uploadLimitSchema, required: true },
    },
  },
  { timestamps: true }
)

export const TierConfig = mongoose.model<ITierConfig>('TierConfig', tierConfigSchema)

// ── Default free-tier config used for DB seeding ──────────────────────────────
export const FREE_TIER_SEED: ITierConfig = {
  name: 'free',
  models: {
    small:    { rpm: 30,  tpm: 40_000, period: 'hourly' },
    large:    { rpm: 10,  tpm: 15_000, period: 'hourly' },
    thinking: { rpm: 5,   tpm: 10_000, period: 'hourly' },
    critiq:   { rpm: 5,   tpm: 10_000, period: 'hourly' },
  },
  uploads: {
    image: { max: 10, windowSec: 3600,  label: 'image', period: 'hourly' },
    video: { max: 1,  windowSec: 86400, label: 'video', period: 'daily'  },
    other: { max: 5,  windowSec: 3600,  label: 'file',  period: 'hourly' },
  },
}

