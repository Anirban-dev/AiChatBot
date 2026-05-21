import Redis, { type Redis as RedisType } from 'ioredis'

// Define the type without the unnecessary manual shim
export type RedisClient = RedisType

const getRedisClient = (): RedisClient => {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL env var is required')
  }

  const client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true
  })

  return client
}

export const redis = getRedisClient()

redis.on('connect', () => console.log('Redis connected'))
redis.on('error', (err: unknown) => console.error('Redis error:', err))

export default redis