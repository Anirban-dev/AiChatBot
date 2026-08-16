# lib/ratelimit.py
"""
Global per-client rate limiting for the AiCalls FastAPI service.

Every inbound request is charged to a Redis fixed-window counter, so even
endpoints without dedicated limits are protected against floods.

Keying:
  - "X-User-Id" header → the real end user. The Node backend forwards the
    authenticated user on every call to us, so backend traffic (via nginx on
    the public backend port :3000) is rate limited against the actual user,
    not a single shared container IP. This is a coarse backstop on top of
    the backend's own per-user limits.
  - fallback → client socket IP (direct hits on the exposed 8005 port, or any
    caller that omits the header).

Fails open: Redis hiccups never take down the AI engine — the request still
proceeds, and the error is logged once.
"""

import logging
import os
import time

from fastapi import Request
from starlette.responses import JSONResponse

from lib.redis import redis

WINDOW_SEC = 60
MAX_PER_WINDOW = 240  # ~4 req/s burst; backend's per-user limiters are far tighter

_KEY_PREFIX = "rl:aicalls"
_LOG = logging.getLogger("ratelimit")
_WARN_ONCE: set = set()


def _key_for(request: Request) -> str:
    user_id = request.headers.get("X-User-Id")
    if user_id:
        return f"user:{user_id}"
    client = request.client
    return f"ip:{client.host if client else 'unknown'}"


async def global_rate_limit(request: Request, call_next):
    stamp = int(time.time() // WINDOW_SEC)
    key = f"{_KEY_PREFIX}:{_key_for(request)}:{stamp}"
    try:
        count = await redis.incr(key)
        await redis.expire(key, WINDOW_SEC + 5)
        if count > MAX_PER_WINDOW:
            return JSONResponse(
                status_code=429,
                content={"error": "Too many requests. Please wait and try again."},
                headers={"Retry-After": str(WINDOW_SEC)},
            )
    except Exception as exc:
        if key not in _WARN_ONCE:
            _LOG.warning("[ratelimit] Redis unavailable, failing open: %s", exc)
            _WARN_ONCE.add(key)

    return await call_next(request)


def register_rate_limiter(app) -> None:
    app.middleware("http")(global_rate_limit)
