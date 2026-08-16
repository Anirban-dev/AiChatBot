# litellm_config.py
"""
LiteLLM Router integration with standard completions routing.
Rich structured logging for every request, retry, success and failure.
"""

import os
import asyncio
import logging
from zoneinfo import ZoneInfo
from datetime import datetime, timezone
import litellm
import litellm.exceptions

# --- Monkeypatch to fix litellm bug (ValueError: invalid literal for int() with base 10: 'tool_use_failed') ---
_original_midstream_init = litellm.exceptions.MidStreamFallbackError.__init__

def _patched_midstream_init(self, *args, **kwargs):
    orig_exc = kwargs.get("original_exception")
    if orig_exc is None and len(args) > 3:
        orig_exc = args[3]
    
    if orig_exc is not None:
        status_code = getattr(orig_exc, "status_code", None)
        if status_code is not None:
            try:
                int(status_code)
            except (ValueError, TypeError):
                try:
                    orig_exc.status_code = 400
                except AttributeError:
                    pass

    return _original_midstream_init(self, *args, **kwargs)

litellm.exceptions.MidStreamFallbackError.__init__ = _patched_midstream_init

from litellm import Router
from lib.mongodb import llm_logs
from lib.crypto import decrypt

os.environ['LITELLM_LOG'] = 'ERROR'

# ── Structured LLM Logger ─────────────────────────────────────────────────────
_llm_log = logging.getLogger("llm")
if not _llm_log.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter(
        "[%(asctime)s] %(levelname)s %(name)s | %(message)s",
        datefmt="%H:%M:%S"
    ))
    _llm_log.addHandler(_h)
    _llm_log.setLevel(logging.DEBUG)
    _llm_log.propagate = False

# ── Timeouts ──────────────────────────────────────────────────────────────────
_CONNECT_TIMEOUT = 20.0

_IST = ZoneInfo("Asia/Kolkata")


# ── MongoDB log writer ────────────────────────────────────────────────────────
async def log_llm_completion(
    type: str,
    virtual_model: str,
    model: str,
    latency_ms: int,
    prompt_tokens: int   = 0,
    completion_tokens: int = 0,
    cost: float          = 0.0,
    error: str           = None,
    error_details: dict  = None,
    user_id: str         = None,
    chat_id: str         = None,
    mode: str            = None,
    ttft_ms: int         = None,
    total_chunks: int    = None,
):
    try:
        doc = {
            "type":              type,
            "model":             model,
            "virtual_model":     virtual_model,
            "latency_ms":        latency_ms,
            "prompt_tokens":     prompt_tokens,
            "completion_tokens": completion_tokens,
            "cost":              cost,
            "error":             error,
            "error_details":     error_details,
            "user_id":           user_id,
            "chat_id":           chat_id,
            "mode":              mode,
            "ttft_ms":           ttft_ms,
            "total_chunks":      total_chunks,
            "timestamp":         datetime.now(_IST),
        }
        doc = {k: v for k, v in doc.items() if v is not None}
        await llm_logs.insert_one(doc)
    except Exception as exc:
        _llm_log.error(f"[MongoDB] Failed to write log: {exc}")


def _schedule_log(**kwargs):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(log_llm_completion(**kwargs))
        else:
            loop.run_until_complete(log_llm_completion(**kwargs))
    except Exception as exc:
        _llm_log.error(f"[LogSchedule] {exc}")


# ── Router factory ────────────────────────────────────────────────────────────
def _build_router(config: dict):
    """Build a litellm Router from a config dict, without touching Redis env."""
    import copy
    # Strip REDIS env vars so litellm Router doesn't try to connect to Redis
    redis_url_backup  = os.environ.pop("REDIS_URL",  None)
    redis_host_backup = os.environ.pop("REDIS_HOST", None)
    redis_port_backup = os.environ.pop("REDIS_PORT", None)
    try:
        cfg = copy.deepcopy(config)
        cfg["routing_strategy"] = "simple-shuffle"
        return Router(**cfg, enable_health_check_routing=False)
    finally:
        if redis_url_backup  is not None: os.environ["REDIS_URL"]  = redis_url_backup
        if redis_host_backup is not None: os.environ["REDIS_HOST"] = redis_host_backup
        if redis_port_backup is not None: os.environ["REDIS_PORT"] = redis_port_backup


async def _fetch_provider_config() -> dict:
    """Load admin-managed AI provider configs from the `aiproviders` collection.

    Returns a litellm router config dict, or None when there are no enabled
    providers configured (or the database is unreachable). None → the router
    is built empty; the app requires the admin to configure at least one API.
    """
    from lib.mongodb import db
    try:
        cursor = db["aiproviders"].find({"enabled": True}).sort("priority", 1)
        docs   = []
        async for doc in cursor:
            docs.append(doc)
    except Exception as exc:
        _llm_log.error(f"[RouterConfig] MongoDB read failed: {exc}")
        return None

    model_list = []
    for doc in docs:
        tier  = doc.get("tier")
        model = doc.get("model")
        if not tier or not model:
            continue

        params: dict = {"model": model}
        provider = (doc.get("provider") or "openai").strip().lower()
        # 'custom' means the admin typed the full litellm string (e.g. openai/gpt-4o)
        if provider and provider != "custom" and provider not in model:
            params["model"] = f"{provider}/{model}"
        if doc.get("api_base"):
            params["api_base"] = doc["api_base"]
        if doc.get("api_key"):
            # api_key is stored AES-256-GCM encrypted; decrypt before handing
            # to litellm. Plaintext legacy values pass through unchanged.
            params["api_key"] = decrypt(doc["api_key"])

        model_list.append({"model_name": tier, "litellm_params": params})

    if not model_list:
        return None

    return {
        "model_list":        model_list,
        "routing_strategy":  "latency-based-routing",
        "num_retries":       3,
        "allowed_fails":     2,
        "cooldown_time":     60,
    }


CURRENT_CONFIG: dict = {"model_list": []}


async def reload_router():
    """Rebuild the live litellm Router from admin-managed provider configs."""
    global router, CURRENT_CONFIG
    config = await _fetch_provider_config() or {"model_list": []}
    router = _build_router(config)
    CURRENT_CONFIG = config
    _llm_log.info(f"[Router] Reloaded: {len(config['model_list'])} model(s) routed")


def get_current_config() -> dict:
    """Current router config — source of truth for /agent/models & friends."""
    return CURRENT_CONFIG


router = _build_router({"model_list": []})


# ── Shared failure logger ─────────────────────────────────────────────────────
def _log_failure_sync(tier_name, latency_ms, e, user_id=None, chat_id=None, mode=None):
    status_code = getattr(e, "status_code", None)
    err_details = {"status_code": status_code} if status_code else None
    short_error = str(e).split('\n')[0][:200]
    log_msg = (
        f"FAILURE tier={tier_name} latency={latency_ms}ms "
        f"error={short_error!r} user={user_id} chat={chat_id}"
    )
    _llm_log.error(log_msg)
    _schedule_log(
        type="failure",
        virtual_model=tier_name,
        model=tier_name,
        latency_ms=latency_ms,
        error=log_msg,
        error_details=err_details,
        user_id=user_id,
        chat_id=chat_id,
        mode=mode,
    )


# ── StreamWrapper class ───────────────────────────────────────────────────────
# FIX: async generators don't support attribute assignment (gen._raw_stream = x crashes).
# Wrap the generator in a class that IS iterable AND supports attributes.
class StreamWrapper:
    """
    Wraps an async generator so we can attach arbitrary attributes (like _raw_stream)
    while still being async-iterable with `async for chunk in stream`.
    """
    def __init__(self, gen, raw_stream):
        self._gen        = gen
        self._raw_stream = raw_stream   # now safely stored as a class attribute

    def __aiter__(self):
        return self._gen.__aiter__()

    async def __anext__(self):
        return await self._gen.__anext__()

    async def aclose(self):
        await self._gen.aclose()


# ── Core async completion ─────────────────────────────────────────────────────
async def async_chat_completion(
    tier_name: str,
    messages:  list,
    user_id:   str  = None,
    chat_id:   str  = None,
    mode:      str  = None,
    **kwargs,
):
    start_time = datetime.now(timezone.utc)
    ctx = f"tier={tier_name} user={user_id} chat={chat_id}"

    if kwargs.get("stream"):
        # ── STREAMING PATH ────────────────────────────────────────────────────
        _llm_log.info(f"REQUEST (stream) {ctx}")

        try:
            if "timeout" not in kwargs:
                kwargs["timeout"] = _CONNECT_TIMEOUT
            raw_stream = await router.acompletion(
                model=tier_name,
                messages=messages,
                **kwargs,
            )
        except Exception as e:
            elapsed = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            _log_failure_sync(tier_name, elapsed, e, user_id, chat_id, mode)
            raise

        async def stream_generator():
            model_name        = ""
            prompt_tokens     = 0
            completion_tokens = 0
            tokens_generated  = 0
            ttft_ms           = None
            chunk_count       = 0
            stream_start      = datetime.now(timezone.utc)
            error_flag        = False

            try:
                async for chunk in raw_stream:
                    chunk_count += 1

                    if hasattr(chunk, "model") and chunk.model:
                        model_name = chunk.model

                    if hasattr(chunk, "usage") and chunk.usage:
                        if getattr(chunk.usage, "prompt_tokens", None):
                            prompt_tokens = chunk.usage.prompt_tokens
                        if getattr(chunk.usage, "completion_tokens", None):
                            completion_tokens = chunk.usage.completion_tokens

                    delta = chunk.choices[0].delta if chunk.choices else None
                    has_content = delta and (
                        getattr(delta, "content", None) or
                        getattr(delta, "reasoning_content", None)
                    )
                    if has_content:
                        tokens_generated += 1
                        if ttft_ms is None:
                            ttft_ms = int((datetime.now(timezone.utc) - stream_start).total_seconds() * 1000)
                            _llm_log.info(f"TTFT {ctx} model={model_name!r} ttft={ttft_ms}ms")

                    yield chunk

                # ── Stream finished cleanly ──────────────────────────────────
                end_time   = datetime.now(timezone.utc)
                latency_ms = int((end_time - stream_start).total_seconds() * 1000)

                if not prompt_tokens:
                    prompt_len        = sum(len(m.get("content", "")) for m in messages if isinstance(m.get("content"), str))
                    prompt_tokens     = max(1, prompt_len // 4)
                    completion_tokens = max(1, tokens_generated)

                cost = 0.0
                try:
                    cost = litellm.completion_cost(
                        model=model_name or tier_name,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                    )
                except Exception:
                    pass

                log_msg = (
                    f"SUCCESS (stream) {ctx} model={model_name!r} "
                    f"latency={latency_ms}ms ttft={ttft_ms}ms "
                    f"chunks={chunk_count} ptok={prompt_tokens} ctok={completion_tokens} "
                    f"cost=${cost:.6f}"
                )
                _llm_log.info(log_msg)
                _schedule_log(
                    type="success",
                    virtual_model=tier_name,
                    model=model_name or tier_name,
                    latency_ms=latency_ms,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    cost=cost,
                    error=log_msg,
                    user_id=user_id,
                    chat_id=chat_id,
                    mode=mode,
                    ttft_ms=ttft_ms,
                    total_chunks=chunk_count,
                )

            except asyncio.CancelledError:
                _llm_log.warning(f"CANCELLED (stream) {ctx}")
                raise

            except Exception as exc:
                if not error_flag:
                    error_flag = True
                    elapsed = int((datetime.now(timezone.utc) - stream_start).total_seconds() * 1000)
                    _log_failure_sync(tier_name, elapsed, exc, user_id, chat_id, mode)
                raise

        # FIX: return a StreamWrapper instead of trying to set _raw_stream on the generator
        return StreamWrapper(stream_generator(), raw_stream)

    else:
        # ── NON-STREAMING PATH ────────────────────────────────────────────────
        _llm_log.info(f"REQUEST (non-stream) {ctx}")
        try:
            if "timeout" not in kwargs:
                kwargs["timeout"] = _CONNECT_TIMEOUT
            response   = await router.acompletion(model=tier_name, messages=messages, **kwargs)
            end_time   = datetime.now(timezone.utc)
            latency_ms = int((end_time - start_time).total_seconds() * 1000)

            usage_data        = response.get("usage", {})
            prompt_tokens     = usage_data.get("prompt_tokens", 0)
            completion_tokens = usage_data.get("completion_tokens", 0)
            model_name        = response.get("model", "")

            cost = 0.0
            try:
                cost = litellm.completion_cost(response)
            except Exception:
                pass

            log_msg = (
                f"SUCCESS (non-stream) {ctx} model={model_name!r} "
                f"latency={latency_ms}ms ptok={prompt_tokens} ctok={completion_tokens} "
                f"cost=${cost:.6f}"
            )
            _llm_log.info(log_msg)
            _schedule_log(
                type="success",
                virtual_model=tier_name,
                model=model_name or tier_name,
                latency_ms=latency_ms,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost=cost,
                error=log_msg,
                user_id=user_id,
                chat_id=chat_id,
                mode=mode,
            )
            return response

        except Exception as e:
            elapsed = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            _log_failure_sync(tier_name, elapsed, e, user_id, chat_id, mode)
            raise


# ── Embedding call ────────────────────────────────────────────────────────────
async def async_embedding_call(text_list: list) -> list:
    try:
        response = await router.aembedding(model="free-embed", input=text_list)
        return [item["embedding"] for item in response.data]
    except Exception as e:
        _llm_log.error(f"[Embedding] Error: {e}")
        return []


# ── OpenAI-compatible client wrapper ─────────────────────────────────────────
class CompatibilityClient:
    class Chat:
        class Completions:
            async def create(self, model, messages, user_id=None, chat_id=None, mode=None, **kwargs):
                kwargs.pop("client_id", None)
                return await async_chat_completion(
                    tier_name=model,
                    messages=messages,
                    user_id=user_id,
                    chat_id=chat_id,
                    mode=mode,
                    **kwargs,
                )

        def __init__(self):
            self.completions = self.Completions()

    def __init__(self):
        self.chat = self.Chat()