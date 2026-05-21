// lib/redis.ts
import Redis, { type Redis as RedisType } from 'ioredis'
import RedisMock from 'ioredis-mock'

export type RedisWithSendCommand = RedisType & {
  sendCommand: (...args: string[]) => Promise<unknown>
}

const getRedisClient = (): RedisWithSendCommand => {
  let client: RedisType

  if (process.env.USE_REDIS_MOCK === 'True') {
    console.log('Using In-Memory Redis Mock')
    client = new RedisMock()
  } else {
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL env var is required')
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
    })
  }

  // ioredis's built-in sendCommand has an overloaded signature that conflicts
  // with what rate-limit-redis expects. We own this shim, so casting it out
  // of ioredis's type system entirely is the right call here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(client as any).sendCommand = (...args: string[]): Promise<unknown> =>
    client.call(args[0], ...args.slice(1)) as Promise<unknown>

  return client as RedisWithSendCommand
}

export const redis = getRedisClient()

redis.on('connect', () => console.log('Redis connected'))
redis.on('error',   (err: unknown) => console.error('Redis error:', err))

export default redis