from datetime import datetime, timezone
from fastapi import APIRouter, Query
import json
from lib.redis import redis as redis_client
from litellm_models import LITELLM_ROUTER_MODELS

router = APIRouter()

@router.get("/agent/status")
async def get_llm_status():
    all_models = list({
        d["litellm_params"]["model"]
        for d in LITELLM_ROUTER_MODELS["model_list"]
    })
    all_tiers = list({d["model_name"] for d in LITELLM_ROUTER_MODELS["model_list"]})

    pipe = redis_client.pipeline()

    # Queue all reads in one round-trip (Now 11 queries per model)
    for model in all_models:
        pipe.get(f"llm:stats:{model}:success")
        pipe.get(f"llm:stats:{model}:failure")
        pipe.get(f"llm:stats:{model}:retries")
        pipe.lrange(f"llm:latency:{model}", 0, -1)
        pipe.get(f"llm:cost:{model}")
        pipe.get(f"llm:tokens:{model}:prompt")
        pipe.get(f"llm:tokens:{model}:completion")
        pipe.exists(f"llm:cooldown:{model}")
        # --- NEW RICH METRICS ---
        pipe.get(f"llm:stats:{model}:streaming_count")
        pipe.get(f"llm:ratelimit:{model}:remaining_tokens")
        pipe.get(f"llm:ratelimit:{model}:reset_requests")

    results = await pipe.execute()

    # Parse results — 11 values per model
    model_stats = {}
    stride = 11
    for i, model in enumerate(all_models):
        base = i * stride
        latencies = [int(x) for x in (results[base + 3] or [])]
        
        # Parse new rate limit metrics safely
        rem_tokens = results[base + 9]
        reset_req = results[base + 10]

        model_stats[model] = {
            "success":           int(results[base + 0] or 0),
            "failure":           int(results[base + 1] or 0),
            "retries":           int(results[base + 2] or 0),
            "avg_latency_ms":    round(sum(latencies) / len(latencies)) if latencies else None,
            "p95_latency_ms":    sorted(latencies)[int(len(latencies) * 0.95)] if latencies else None,
            "cost":              float(results[base + 4] or 0),
            "prompt_tokens":     int(results[base + 5] or 0),
            "completion_tokens": int(results[base + 6] or 0),
            "cooling_down":      bool(results[base + 7]),
            # --- NEW EXTRACTED FIELDS FOR FRONTEND GRAPHING ---
            "streaming_requests": int(results[base + 8] or 0),
            "provider_limits": {
                "remaining_tokens": int(rem_tokens) if rem_tokens is not None else None,
                "reset_requests_sec": float(reset_req) if reset_req is not None else None,
            }
        }

    # Recent events (last 50, newest first)
    raw_events = await redis_client.zrevrange("llm:events", 0, 49, withscores=False)
    recent_events = [json.loads(e) for e in raw_events]

    # Total cost
    total_cost = float(await redis_client.get("llm:cost:total") or 0)

    return {
        "model_stats":    model_stats,
        "recent_events":  recent_events,
        "total_cost":     total_cost,
        "tiers":          all_tiers,
    }


@router.get("/agent/events")
async def get_llm_events(
    since_hours: int = 24,
    type: str = "",         # "success" | "failure" | "retry"
    tier: str = "",
    model: str = "",        # Added filtering by model name
    status_code: int = Query(None), # Added filtering by HTTP error code
    limit: int = 100
):
    """Filterable event log for the admin logs tab with telemetry support."""
    now = datetime.now(timezone.utc).timestamp()
    since = now - since_hours * 3600

    raw = await redis_client.zrangebyscore(
        "llm:events", since, now,
        start=0, num=limit
    )
    events = [json.loads(e) for e in raw]

    # Enhanced Python filtering for advanced debugging telemetry
    if type:
        events = [e for e in events if e.get("type") == type]
    if tier:
        events = [e for e in events if e.get("tier") == tier]
    if model:
        events = [e for e in events if e.get("model") == model or e.get("virtual_model") == model]
    if status_code:
        events = [e for e in events if e.get("error_details", {}).get("status_code") == status_code]

    events.reverse()  # newest first
    return {"events": events, "total": len(events)}