# litellm_config.py
"""
LiteLLM Router integration with async pre-call rate limiting enforcement.
"""

import os
import litellm
from litellm import Router
from datetime import datetime, timezone
from urllib.parse import urlparse
from lib.redis import redis as async_redis 

os.environ['LITELLM_LOG'] = 'CRITICAL'

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

import asyncio
from lib.mongodb import llm_logs

async def log_llm_completion(
    type: str,
    virtual_model: str,
    model: str,
    user_id: str,
    latency_ms: int,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    cost: float = 0.0,
    error: str = None,
    error_details: dict = None
):
    try:
        from bson import ObjectId
        user_obj_id = None
        try:
            if user_id and user_id != "unknown_user":
                user_obj_id = ObjectId(user_id)
        except Exception:
            pass

        doc = {
            "type": type,
            "model": model,
            "virtual_model": virtual_model,
            "userId": user_obj_id if user_obj_id else user_id,
            "latency_ms": latency_ms,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "cost": cost,
            "error": error,
            "error_details": error_details,
            "timestamp": datetime.now(timezone.utc)
        }
        await llm_logs.insert_one(doc)
    except Exception:
        pass


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

    # Intercept and log calls to MongoDB
    start_time = datetime.now(timezone.utc)
    if kwargs.get("stream"):
        try:
            raw_stream = await router.acompletion(
                model=tier_name,
                messages=messages,
                client_id=user_id,
                **kwargs,
            )
        except Exception as e:
            end_time = datetime.now(timezone.utc)
            latency_ms = int((end_time - start_time).total_seconds() * 1000)
            status_code = getattr(e, "status_code", None)
            err_details = {"status_code": status_code} if status_code else None
            asyncio.create_task(log_llm_completion(
                type="failure",
                virtual_model=tier_name,
                model=tier_name,
                user_id=user_id,
                latency_ms=latency_ms,
                error=str(e).split('\n')[0][:100],
                error_details=err_details
            ))
            raise e

        async def stream_wrapper():
            model_name = ""
            prompt_tokens = 0
            completion_tokens = 0
            tokens_generated = 0
            try:
                async for chunk in raw_stream:
                    if hasattr(chunk, "model") and chunk.model:
                        model_name = chunk.model
                    if hasattr(chunk, "usage") and chunk.usage:
                        prompt_tokens = chunk.usage.prompt_tokens
                        completion_tokens = chunk.usage.completion_tokens
                    
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta and getattr(delta, "content", None):
                        tokens_generated += 1
                    yield chunk

                end_time = datetime.now(timezone.utc)
                latency_ms = int((end_time - start_time).total_seconds() * 1000)
                
                if not prompt_tokens:
                    prompt_len = sum(len(m.get("content", "")) for m in messages if isinstance(m.get("content"), str))
                    prompt_tokens = max(1, prompt_len // 4)
                    completion_tokens = max(1, tokens_generated)

                cost = 0.0
                try:
                    import litellm
                    cost = litellm.completion_cost(
                        model=model_name or tier_name,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens
                    )
                except Exception:
                    pass

                asyncio.create_task(log_llm_completion(
                    type="success",
                    virtual_model=tier_name,
                    model=model_name or tier_name,
                    user_id=user_id,
                    latency_ms=latency_ms,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    cost=cost
                ))
            except Exception as e:
                end_time = datetime.now(timezone.utc)
                latency_ms = int((end_time - start_time).total_seconds() * 1000)
                status_code = getattr(e, "status_code", None)
                err_details = {"status_code": status_code} if status_code else None
                asyncio.create_task(log_llm_completion(
                    type="failure",
                    virtual_model=tier_name,
                    model=model_name or tier_name,
                    user_id=user_id,
                    latency_ms=latency_ms,
                    error=str(e).split('\n')[0][:100],
                    error_details=err_details
                ))
                raise e
        return stream_wrapper()
    else:
        try:
            response = await router.acompletion(
                model=tier_name,
                messages=messages,
                client_id=user_id,
                **kwargs,
            )
            end_time = datetime.now(timezone.utc)
            latency_ms = int((end_time - start_time).total_seconds() * 1000)
            
            usage = response.get("usage", {})
            prompt_tokens = usage.get("prompt_tokens", 0)
            completion_tokens = usage.get("completion_tokens", 0)
            model_name = response.get("model", "")
            
            cost = 0.0
            try:
                import litellm
                cost = litellm.completion_cost(response)
            except Exception:
                pass
                
            asyncio.create_task(log_llm_completion(
                type="success",
                virtual_model=tier_name,
                model=model_name or tier_name,
                user_id=user_id,
                latency_ms=latency_ms,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost=cost
            ))
            return response
        except Exception as e:
            end_time = datetime.now(timezone.utc)
            latency_ms = int((end_time - start_time).total_seconds() * 1000)
            status_code = getattr(e, "status_code", None)
            err_details = {"status_code": status_code} if status_code else None
            asyncio.create_task(log_llm_completion(
                type="failure",
                virtual_model=tier_name,
                model=tier_name,
                user_id=user_id,
                latency_ms=latency_ms,
                error=str(e).split('\n')[0][:100],
                error_details=err_details
            ))
            raise e


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