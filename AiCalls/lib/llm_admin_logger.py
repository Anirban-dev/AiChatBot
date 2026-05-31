# llm_admin_logger.py
import json
from lib.redis import redis as redis_client
import litellm
from datetime import datetime, timezone

class AdminCallbackHandler(litellm.CustomLogger):

    async def _push_event(self, event: dict):
        print("🔥 SUCCESS EVENT PUSHED TO REDIS")
        ts = datetime.now(timezone.utc).timestamp()
        model = event.get("model", "unknown")
        tier  = event.get("tier",  "unknown")

        pipe = redis_client.pipeline()

        # 1. Time-series event log — queryable by time range, keep 7 days
        pipe.zadd("llm:events", {json.dumps(event): ts})
        pipe.zremrangebyscore("llm:events", 0, ts - 7 * 86400)

        # 2. Per-model counters
        if event["type"] == "success":
            pipe.incr(f"llm:stats:{model}:success")
            pipe.incr(f"llm:stats:{tier}:success")
        elif event["type"] == "failure":
            pipe.incr(f"llm:stats:{model}:failure")
            pipe.incr(f"llm:stats:{tier}:failure")
        elif event["type"] == "retry":
            pipe.incr(f"llm:stats:{model}:retries")
            pipe.incr(f"llm:stats:{tier}:retries")

        # 3. Rolling latency list — last 500 per model
        if event.get("latency_ms") is not None:
            pipe.lpush(f"llm:latency:{model}", event["latency_ms"])
            pipe.ltrim(f"llm:latency:{model}", 0, 499)

        # 4. Cost accumulation
        if event.get("cost"):
            pipe.incrbyfloat(f"llm:cost:{model}", event["cost"])
            pipe.incrbyfloat("llm:cost:total", event["cost"])

        # 5. Token accumulation
        if event.get("prompt_tokens"):
            pipe.incrby(f"llm:tokens:{model}:prompt",     event["prompt_tokens"])
            pipe.incrby(f"llm:tokens:{model}:completion",  event.get("completion_tokens", 0))

        await pipe.execute()

    # ── cooldown: litellm fires this when a model is put on cooldown ──
    async def async_log_failure_event(self, kwargs, response_obj, start_time, end_time):
        model    = kwargs.get("model", "unknown")
        metadata = kwargs.get("metadata", {})
        tier     = metadata.get("model_group", model)
        latency  = round((end_time - start_time).total_seconds() * 1000)

        event = {
            "type":       "failure",
            "model":      model,
            "tier":       tier,
            "error":      str(kwargs.get("exception", "")),
            "latency_ms": latency,
            "timestamp":  datetime.now(timezone.utc).isoformat(),
            "api_base":   metadata.get("api_base", ""),
        }
        await self._push_event(event)

        # Mark cooldown in Redis with TTL matching litellm's cooldown window
        # litellm default cooldown is 60s, match whatever you set in your router config
        cooldown_seconds = 60
        await redis_client.set(f"llm:cooldown:{model}", "1", ex=cooldown_seconds)

    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        print("🔥 SUCCESS EVENT FIRED", kwargs.get("model"))
        model    = kwargs.get("model", "unknown")
        metadata = kwargs.get("metadata", {})
        tier     = metadata.get("model_group", model)
        usage    = getattr(response_obj, "usage", None)
        latency  = round((end_time - start_time).total_seconds() * 1000)

        event = {
            "type":              "success",
            "model":             model,
            "tier":              tier,
            "latency_ms":        latency,
            "timestamp":         datetime.now(timezone.utc).isoformat(),
            "prompt_tokens":     getattr(usage, "prompt_tokens",     0) if usage else 0,
            "completion_tokens": getattr(usage, "completion_tokens", 0) if usage else 0,
            "cost":              kwargs.get("response_cost", 0),
            "call_id":           kwargs.get("litellm_call_id", ""),
        }
        await self._push_event(event)

        # Clear cooldown if this model just succeeded
        await redis_client.delete(f"llm:cooldown:{model}")

    async def async_log_retry_event(self, kwargs, response_obj, start_time, end_time):
        model    = kwargs.get("model", "unknown")
        metadata = kwargs.get("metadata", {})
        tier     = metadata.get("model_group", model)

        event = {
            "type":      "retry",
            "model":     model,
            "tier":      tier,
            "attempt":   kwargs.get("num_retries", 0),
            "error":     str(kwargs.get("exception", "")),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self._push_event(event)