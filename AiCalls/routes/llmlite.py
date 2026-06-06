# llmlite.py
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query
from lib.mongodb import llm_logs
from litellm_models import LITELLM_ROUTER_MODELS

router = APIRouter()

@router.get("/agent/status")
async def get_llm_status():
    all_models = list({
        d["litellm_params"]["model"]
        for d in LITELLM_ROUTER_MODELS["model_list"]
    })
    all_tiers = list({d["model_name"] for d in LITELLM_ROUTER_MODELS["model_list"]})

    # Aggregate metrics from MongoDB
    pipeline = [
        {
            "$group": {
                "_id": "$model",
                "success": {"$sum": {"$cond": [{"$eq": ["$type", "success"]}, 1, 0]}},
                "failure": {"$sum": {"$cond": [{"$eq": ["$type", "failure"]}, 1, 0]}},
                "cost": {"$sum": "$cost"},
                "prompt_tokens": {"$sum": "$prompt_tokens"},
                "completion_tokens": {"$sum": "$completion_tokens"},
                "latencies": {"$push": "$latency_ms"},
            }
        }
    ]

    cursor = llm_logs.aggregate(pipeline)
    db_stats = {}
    async for doc in cursor:
        model = doc["_id"]
        latencies = [l for l in doc["latencies"] if l is not None]
        avg_latency = round(sum(latencies) / len(latencies)) if latencies else None
        p95_latency = sorted(latencies)[int(len(latencies) * 0.95)] if latencies else None

        db_stats[model] = {
            "success": doc["success"],
            "failure": doc["failure"],
            "retries": 0,
            "avg_latency_ms": avg_latency,
            "p95_latency_ms": p95_latency,
            "cost": doc["cost"],
            "prompt_tokens": doc["prompt_tokens"],
            "completion_tokens": doc["completion_tokens"],
            "cooling_down": False,
            "provider_limits": {
                "remaining_tokens": None,
                "reset_requests_sec": None,
            }
        }

    # Format model_stats for all known models in list (even if they have no logs yet)
    model_stats = {}
    for item in LITELLM_ROUTER_MODELS["model_list"]:
        m = item["litellm_params"]["model"]
        tier = item["model_name"]
        if m in db_stats:
            model_stats[m] = {**db_stats[m], "tier": tier}
        else:
            model_stats[m] = {
                "tier": tier,
                "success": 0,
                "failure": 0,
                "retries": 0,
                "avg_latency_ms": None,
                "p95_latency_ms": None,
                "cost": 0.0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "cooling_down": False,
                "provider_limits": {
                    "remaining_tokens": None,
                    "reset_requests_sec": None,
                }
            }

    # Fetch recent events (last 50, newest first) from MongoDB
    events_cursor = llm_logs.find().sort("timestamp", -1).limit(50)
    recent_events = []
    async for event in events_cursor:
        recent_events.append({
            "id": str(event.get("_id")),
            "type": event.get("type"),
            "model": event.get("model"),
            "tier": event.get("virtual_model"),
            "latency_ms": event.get("latency_ms"),
            "prompt_tokens": event.get("prompt_tokens"),
            "completion_tokens": event.get("completion_tokens"),
            "cost": event.get("cost"),
            "error": event.get("error"),
            "error_details": event.get("error_details"),
            "timestamp": event.get("timestamp").isoformat() if event.get("timestamp") else None
        })

    # Total cost
    total_cost_pipeline = [
        {"$group": {"_id": None, "total_cost": {"$sum": "$cost"}}}
    ]
    total_cost_cursor = llm_logs.aggregate(total_cost_pipeline)
    total_cost = 0.0
    async for doc in total_cost_cursor:
        total_cost = doc.get("total_cost", 0.0)

    return {
        "model_stats": model_stats,
        "recent_events": recent_events,
        "total_cost": total_cost,
        "tiers": all_tiers,
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
    """Filterable event log for the admin logs tab with telemetry support, powered by MongoDB."""
    since = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    
    query = {"timestamp": {"$gte": since}}
    if type:
        query["type"] = type
    if tier:
        query["virtual_model"] = tier
    if model:
        query["$or"] = [{"model": model}, {"virtual_model": model}]
    if status_code is not None:
        query["error_details.status_code"] = status_code

    cursor = llm_logs.find(query).sort("timestamp", -1).limit(limit)
    events = []
    async for doc in cursor:
        events.append({
            "id": str(doc.get("_id")),
            "type": doc.get("type"),
            "model": doc.get("model"),
            "tier": doc.get("virtual_model"),
            "latency_ms": doc.get("latency_ms"),
            "prompt_tokens": doc.get("prompt_tokens"),
            "completion_tokens": doc.get("completion_tokens"),
            "cost": doc.get("cost"),
            "error": doc.get("error"),
            "error_details": doc.get("error_details"),
            "timestamp": doc.get("timestamp").isoformat() if doc.get("timestamp") else None
        })

    return {"events": events, "total": len(events)}