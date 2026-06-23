# litellm_config.py
"""
LiteLLM Router integration with standard completions routing.
"""

import os
import asyncio
from zoneinfo import ZoneInfo
from datetime import datetime, timezone
import litellm
from litellm import Router
from lib.mongodb import llm_logs

os.environ['LITELLM_LOG'] = 'DEBUG'

REDIS_URL = os.environ.get("REDIS_URL")
if REDIS_URL:
    try:
        from urllib.parse import urlparse
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

# ── IST timezone constant ──────────────────────────────────────────────────────
_IST = ZoneInfo("Asia/Kolkata")


async def log_llm_completion(
    type: str,
    virtual_model: str,
    model: str,
    latency_ms: int,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    cost: float = 0.0,
    error: str = None,
    error_details: dict = None
):
    try:
        doc = {
            "type": type,
            "model": model,
            "virtual_model": virtual_model,
            "latency_ms": latency_ms,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "cost": cost,
            "error": error,
            "error_details": error_details,
            "timestamp": datetime.now(_IST),
        }
        await llm_logs.insert_one(doc)
    except Exception:
        pass


# AiCalls/lib/litellm_config.py

def _make_router():
    from litellm_models import LITELLM_ROUTER_MODELS
    import copy
    import os

    # 1. Temporarily pop Redis variables to force LiteLLM to stay strictly in-memory
    redis_url_backup = os.environ.pop("REDIS_URL", None)
    redis_host_backup = os.environ.pop("REDIS_HOST", None)
    redis_port_backup = os.environ.pop("REDIS_PORT", None)

    try:
        config = copy.deepcopy(LITELLM_ROUTER_MODELS)
        config["routing_strategy"] = "simple-shuffle"

        # 2. Return a pure, stateless in-memory router
        return Router(
            **config,
            enable_health_check_routing=False,
        )
    finally:
        # 3. Restore them immediately so other parts of your app stack aren't affected
        if redis_url_backup is not None:
            os.environ["REDIS_URL"] = redis_url_backup
        if redis_host_backup is not None:
            os.environ["REDIS_HOST"] = redis_host_backup
        if redis_port_backup is not None:
            os.environ["REDIS_PORT"] = redis_port_backup


router = _make_router()


def _log_failure(tier_name, latency_ms, e):
    status_code = getattr(e, "status_code", None)
    err_details = {"status_code": status_code} if status_code else None
    asyncio.create_task(log_llm_completion(
        type="failure",
        virtual_model=tier_name,
        model=tier_name,
        latency_ms=latency_ms,
        error=str(e).split('\n')[0][:100],
        error_details=err_details,
    ))


async def async_chat_completion(
    tier_name: str,
    messages: list,
    **kwargs,
) -> dict:
    start_time = datetime.now(timezone.utc)
    if kwargs.get("stream"):
        try:
            if "timeout" not in kwargs:
                kwargs["timeout"] = 30.0
            raw_stream = await router.acompletion(
                model=tier_name,
                messages=messages,
                **kwargs,
            )
        except Exception as e:
            end_time = datetime.now(timezone.utc)
            latency_ms = int((end_time - start_time).total_seconds() * 1000)
            _log_failure(tier_name, latency_ms, e)
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
                    latency_ms=latency_ms,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    cost=cost
                ))
            except Exception as e:
                end_time = datetime.now(timezone.utc)
                latency_ms = int((end_time - start_time).total_seconds() * 1000)
                _log_failure(tier_name, latency_ms, e)
                raise e
        gen = stream_wrapper()
        gen._raw_stream = raw_stream
        return gen
    else:
        try:
            if "timeout" not in kwargs:
                kwargs["timeout"] = 30.0
            response = await router.acompletion(
                model=tier_name,
                messages=messages,
                **kwargs,
            )
            end_time = datetime.now(timezone.utc)
            latency_ms = int((end_time - start_time).total_seconds() * 1000)

            usage_data = response.get("usage", {})
            prompt_tokens = usage_data.get("prompt_tokens", 0)
            completion_tokens = usage_data.get("completion_tokens", 0)
            model_name = response.get("model", "")

            cost = 0.0
            try:
                cost = litellm.completion_cost(response)
            except Exception:
                pass

            asyncio.create_task(log_llm_completion(
                type="success",
                virtual_model=tier_name,
                model=model_name or tier_name,
                latency_ms=latency_ms,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost=cost
            ))
            return response
        except Exception as e:
            end_time = datetime.now(timezone.utc)
            latency_ms = int((end_time - start_time).total_seconds() * 1000)
            _log_failure(tier_name, latency_ms, e)
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
                kwargs.pop("client_id", None)
                result = await async_chat_completion(
                    tier_name=model,
                    messages=messages,
                    **kwargs,
                )
                return result

        def __init__(self):
            self.completions = self.Completions()

    def __init__(self):
        self.chat = self.Chat()