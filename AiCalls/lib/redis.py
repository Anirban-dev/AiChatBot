import redis.asyncio as aioredis
import os

REDIS_URL = os.getenv("REDIS_URL")

redis = aioredis.from_url(
    REDIS_URL,
    decode_responses=True,
    encoding="utf-8"
)