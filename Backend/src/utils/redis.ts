// lib/redis.ts
import Redis from 'ioredis'
import RedisMock from 'ioredis-mock'

const getRedisClient = () => {
  // If we are in a test environment or explicitly want to use a mock
  if (process.env.USE_REDIS_MOCK === 'True') {
    console.log('Using In-Memory Redis Mock');
    return new RedisMock();
  }

  if (!process.env.REDIS_URL) throw new Error('REDIS_URL env var is required')
  return new Redis(process.env.REDIS_URL);
}

export const redis = getRedisClient();

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err: any) => console.error('Redis error:', err));

export default redis