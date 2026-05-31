// src/utils/logger.ts
import { Log } from '../models/log'
import mongoose from 'mongoose'

interface LogParams {
  userId?: string | mongoose.Types.ObjectId
  action: string
  status: 'success' | 'failed'
  method: string
  path: string
  ipAddress?: string
  userAgent?: string
  latency?: number
  details?: any
}

export const writeLog = async (params: LogParams) => {
  try {
    await Log.create({
      userId: params.userId ? new mongoose.Types.ObjectId(params.userId.toString()) : undefined,
      action: params.action,
      status: params.status,
      method: params.method,
      path: params.path,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      latency: params.latency,
      details: params.details
    })
  } catch (err) {
    console.error('Failed to save log to MongoDB:', err)
  }
}
