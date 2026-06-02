# litellm_config.py
"""
LiteLLM Router integration with async pre-call rate limiting enforcement.
"""

import os
import litellm
from litellm import Router
from datetime import datetime, timezone
from urllib.parse import urlparse
from lib.llm_admin_logger import AdminCallbackHandler
from lib.redis import redis as async_redis 

os.environ['LITELLM_LOG'] = 'DEBUG'

# ─── ROBUST ENV PARSING (Gives defaults if variables aren't populated yet) ────
REDIS_URL = os.environ.get("REDIS_URL")

if REDIS_URL:
    try:
        parsed = urlparse(REDIS_URL)
        REDIS_HOST = parsed.hostname or "localhost"
        REDIS_PORT = parsed.port or 6379
        REDIS_PASSWORD = parsed.password
    except Exception:
        REDIS_HOST = "localhost"
        REDIS_PORT = 6379
        REDIS_PASSWORD = None
else:
    REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
    REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
    REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD")

# ── Tier limit definitions (must match TIER_DEFAULTS in routes/admin/users.ts) ─
TIER_LIMITS = {
    "enterprise": {"tpm": 500_000, "rpm": 200},
    "premium":    {"tpm": 90_000,  "rpm": 40},
    "free":       {"tpm": 15_000,  "rpm": 10},
}


def _minute_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d-%H-%M")


async def _get_effective_limits(user_id: str, user_tier: str) -> dict:
    """Returns effective limits using your non-blocking async client."""
    override_raw = await async_redis.get(f"user_limits:{user_id}")
    if override_raw:
        try:
            import json
            override = json.loads(override_raw)
            return {"tpm": override["tpm"], "rpm": override["rpm"]}
        except Exception:
            pass  
    return TIER_LIMITS.get(user_tier, TIER_LIMITS["free"])


async def _get_current_usage(user_id: str) -> dict:
    """Reads usage metrics concurrently over your async client."""
    stamp = _minute_stamp()
    
    import asyncio
    tpm_task = async_redis.get(f"usage:tpm:{user_id}:{stamp}")
    rpm_task = async_redis.get(f"usage:rpm:{user_id}:{stamp}")
    tpm_raw, rpm_raw = await asyncio.gather(tpm_task, rpm_task)
    
    return {
        "tpm_used": int(tpm_raw or 0),
        "rpm_used": int(rpm_raw or 0),
    }


class RateLimitExceeded(Exception):
    """Raised before calling the model when a user is over their quota."""
    def __init__(self, message: str, limit_type: str):
        super().__init__(message)
        self.limit_type = limit_type
        self.message = message


def _make_router():
    from litellm_models import LITELLM_ROUTER_MODELS

    litellm.callbacks = [AdminCallbackHandler()]
    
    # FIX: Use the parsed variables here instead of dangerous os.environ lookups
    return Router(
        **LITELLM_ROUTER_MODELS,
        redis_host=REDIS_HOST,
        redis_port=REDIS_PORT,
        redis_password=REDIS_PASSWORD,
    )


router = _make_router()


async def async_chat_completion(
    tier_name: str,
    messages: list,
    user_id: str,
    user_tier: str,
    **kwargs,
) -> dict:
    if tier_name == "lowllm":
        tier_name = "small"
    elif tier_name == "highllm":
        tier_name = "large"

    # Await async helpers
    limits = await _get_effective_limits(user_id, user_tier)
    usage  = await _get_current_usage(user_id)

    if usage["rpm_used"] >= limits["rpm"]:
        raise RateLimitExceeded(
            f"Request limit reached ({limits['rpm']} requests/minute for {user_tier} tier). "
            f"Please wait before sending another message.",
            limit_type="rpm",
        )

    tpm_threshold = limits["tpm"] * 0.95
    if usage["tpm_used"] >= tpm_threshold:
        raise RateLimitExceeded(
            f"Token limit nearly exhausted ({usage['tpm_used']}/{limits['tpm']} tokens used "
            f"this minute for {user_tier} tier). Please wait before sending another message.",
            limit_type="tpm",
        )

    # Delegate to LiteLLM Router
    return await router.acompletion(
        model=tier_name,
        messages=messages,
        client_id=user_id,
        **kwargs,
    )


async def async_embedding_call(text_list: list) -> list:
    try:
        response = await router.aembedding(model="free-embed", input=text_list)
        return [item["embedding"] for item in response.data]
    except Exception as e:
        print(f"Async embedding error: {e}")
        return []


class CompatibilityClient:
    class Chat:
        class Completions:
            async def create(self, model, messages, **kwargs):
                user_id   = kwargs.pop("client_id",  "unknown_user")
                user_tier = kwargs.pop("user_tier",  "free")
                return await async_chat_completion(
                    tier_name=model,
                    messages=messages,
                    user_id=user_id,
                    user_tier=user_tier,
                    **kwargs,
                )

        def __init__(self):
            self.completions = self.Completions()

    def __init__(self):
        self.chat = self.Chat()