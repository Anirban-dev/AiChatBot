// lib/redis.ts
import Redis from 'ioredis'

if (!process.env.REDIS_URL) throw new Error('REDIS_URL env var is required')

export const redis = new Redis(process.env.REDIS_URL)