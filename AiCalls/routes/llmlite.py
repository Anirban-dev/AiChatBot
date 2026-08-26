# llmlite.py
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query, Body
from lib.mongodb import llm_logs
from lib.litellm_config import get_current_config, reload_router
from services.vector_store import embed_vector_info

router = APIRouter()


def _live_model_list() -> list:
    """Build a canonical model list from the live router config (DB-driven)."""
    result = []
    for entry in get_current_config().get("model_list", []):
        params = entry.get("litellm_params", {})
        model  = params.get("model", "")
        result.append({
            "model":    model,
            "tier":     entry.get("model_name"),
            "api_base": params.get("api_base"),
            "provider": model.split("/", 1)[0] if "/" in model else None,
        })
    return result


# ── GET /agent/models — live model/tier list ───────────────────────────────────
@router.get("/agent/models")
async def get_model_list():
    """Return the full canonical model list as known by the Python router.
    Admin frontend should use this instead of any hardcoded list."""
    models = _live_model_list()
    return {"models": models, "total": len(models)}


# ── POST /agent/ping-model — test single model availability & validity ────────
@router.post("/agent/ping-model")
async def ping_model(req: dict = Body(...)):
    """Test single model ping with minimum token consumption and tier-appropriate payload.
    Supports chat, vision, embeddings, and speech.
    """
    import litellm
    import time
    import io
    import wave
    import struct

    provider = (req.get("provider") or "").strip().lower()
    model = (req.get("model") or "").strip()
    tier = (req.get("tier") or "small").strip().lower()
    api_key = req.get("api_key") or None
    api_base = (req.get("api_base") or "").strip() or None

    if not model:
        return {"ok": False, "error": "Model name is required for testing"}

    # Build target model string:
    # If the model already starts with "provider/" don't prefix again.
    # If provider is set and not already in the model string prefix, prepend it.
    target_model = model
    if provider and provider != "custom":
        prefix = f"{provider}/"
        if not model.startswith(prefix):
            target_model = f"{provider}/{model}"

    start_time = time.monotonic()

    try:
        if tier == "free-embed":
            # Test Embeddings with a single 1-word string
            kwargs = {"model": target_model, "input": ["test"]}
            if api_key: kwargs["api_key"] = api_key
            if api_base: kwargs["api_base"] = api_base
            res = await litellm.aembedding(**kwargs)
            dim = len(res.data[0]["embedding"]) if hasattr(res, "data") and res.data else 0
            latency = int((time.monotonic() - start_time) * 1000)
            return {"ok": True, "latency_ms": latency, "detail": f"Embedding OK ({dim} dimensions)"}

        elif tier == "speechllm":
            # Test Speech (ASR) with a 0.2s synthetic silent WAV buffer
            buf = io.BytesIO()
            with wave.open(buf, 'wb') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(16000)
                # 0.2s silence (3200 samples)
                data = struct.pack('<' + ('h'*3200), *([0]*3200))
                wav.writeframes(data)
            buf.seek(0)
            buf.name = "ping.wav"
            kwargs = {"model": target_model, "file": buf}
            if api_key: kwargs["api_key"] = api_key
            if api_base: kwargs["api_base"] = api_base
            await litellm.atranscription(**kwargs)
            latency = int((time.monotonic() - start_time) * 1000)
            return {"ok": True, "latency_ms": latency, "detail": "Transcription API responsive"}

        elif tier == "visionllm":
            # Test Vision with a 1x1 transparent GIF data URI and 1 max token
            kwargs = {
                "model": target_model,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "ping"},
                        {"type": "image_url", "image_url": {"url": "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"}}
                    ]
                }],
                "max_tokens": 1
            }
            if api_key: kwargs["api_key"] = api_key
            if api_base: kwargs["api_base"] = api_base
            await litellm.acompletion(**kwargs)
            latency = int((time.monotonic() - start_time) * 1000)
            return {"ok": True, "latency_ms": latency, "detail": "Vision API responsive"}

        else:
            # Standard chat/tools/reasoning/summary: 1 token ping
            kwargs = {
                "model": target_model,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1
            }
            if api_key: kwargs["api_key"] = api_key
            if api_base: kwargs["api_base"] = api_base
            await litellm.acompletion(**kwargs)
            latency = int((time.monotonic() - start_time) * 1000)
            return {"ok": True, "latency_ms": latency, "detail": "Chat completion responsive"}

    except Exception as exc:
        latency = int((time.monotonic() - start_time) * 1000)
        short_err = str(exc).splitlines()[0][:250]
        return {"ok": False, "latency_ms": latency, "error": short_err}


# ── POST /agent/reload-models — rebuild router from MongoDB config ─────────────
@router.post("/agent/reload-models")
async def reload_models():
    """Rebuild the litellm Router from admin-managed provider configs.
    Called by the Node admin API immediately after providers change."""
    await reload_router()
    models = _live_model_list()
    return {"applied": True, "models": models, "total": len(models)}


# ── GET /agent/embed-vector-info — embeddings dimension compatibility ──────────
@router.get("/agent/embed-vector-info")
async def get_embed_vector_info():
    """Report the live embeddings model's vector dimension vs. the dimensions of
    already-indexed Qdrant collections, so the admin UI can warn about an
    incompatible (different-dimension) embeddings switch."""
    return embed_vector_info()


# ── GET /agent/status — aggregate metrics ─────────────────────────────────────
@router.get("/agent/status")
async def get_llm_status():
    live_models = _live_model_list()
    all_tiers   = list({m["tier"] for m in live_models})

    # Aggregate metrics from MongoDB
    pipeline = [
        {
            "$group": {
                "_id":               "$model",
                "success":          {"$sum": {"$cond": [{"$eq": ["$type", "success"]}, 1, 0]}},
                "failure":          {"$sum": {"$cond": [{"$eq": ["$type", "failure"]}, 1, 0]}},
                "cost":             {"$sum": "$cost"},
                "prompt_tokens":    {"$sum": "$prompt_tokens"},
                "completion_tokens":{"$sum": "$completion_tokens"},
                "latencies":        {"$push": "$latency_ms"},
                "last_used":        {"$max": "$timestamp"},
                "last_success":     {"$max": {"$cond": [{"$eq": ["$type", "success"]}, "$timestamp", None]}},
                "last_failure":     {"$max": {"$cond": [{"$eq": ["$type", "failure"]}, "$timestamp", None]}},
            }
        }
    ]

    cursor   = llm_logs.aggregate(pipeline)
    db_stats = {}
    async for doc in cursor:
        model    = doc["_id"]
        if not model:
            continue
        lats     = [l for l in doc["latencies"] if l is not None]
        avg_lat  = round(sum(lats) / len(lats)) if lats else None
        p95_lat  = sorted(lats)[int(len(lats) * 0.95)] if lats else None

        # Derive health from log history: healthy if last event was a success within 24h
        last_success = doc.get("last_success")
        last_failure = doc.get("last_failure")
        success_count = doc["success"]
        failure_count = doc["failure"]
        total_calls   = success_count + failure_count
        success_rate  = round((success_count / total_calls) * 100, 1) if total_calls else None

        db_stats[model] = {
            "success":           success_count,
            "failure":           failure_count,
            "retries":           0,
            "avg_latency_ms":    avg_lat,
            "p95_latency_ms":    p95_lat,
            "cost":              doc["cost"],
            "prompt_tokens":     doc["prompt_tokens"],
            "completion_tokens": doc["completion_tokens"],
            "last_used":         doc["last_used"].isoformat() if doc.get("last_used") else None,
            "last_success":      last_success.isoformat() if last_success else None,
            "last_failure":      last_failure.isoformat() if last_failure else None,
            "success_rate":      success_rate,
            # Health derived from actual log data — no pings:
            # healthy = has been used AND last event was success within 24h
            "health": (
                "healthy"    if last_success and (datetime.now(timezone.utc) - last_success.replace(tzinfo=timezone.utc)).total_seconds() < 86400
                else "degraded" if success_count > 0
                else "unknown"   if total_calls == 0
                else "unhealthy"
            ),
            "cooling_down": False,
            "provider_limits": {
                "remaining_tokens":    None,
                "reset_requests_sec":  None,
            }
        }

    # Build model_stats for every known model (even if they have no logs)
    model_stats = {}
    for item in live_models:
        m    = item["model"]
        tier = item["tier"]
        if m in db_stats:
            model_stats[m] = {**db_stats[m], "tier": tier}
        else:
            model_stats[m] = {
                "tier":              tier,
                "success":           0,
                "failure":           0,
                "retries":           0,
                "avg_latency_ms":    None,
                "p95_latency_ms":    None,
                "cost":              0.0,
                "prompt_tokens":     0,
                "completion_tokens": 0,
                "last_used":         None,
                "last_success":      None,
                "last_failure":      None,
                "success_rate":      None,
                "health":            "unknown",
                "cooling_down":      False,
                "provider_limits":   {"remaining_tokens": None, "reset_requests_sec": None},
            }

    # Recent events (last 50, newest first)
    events_cursor = llm_logs.find().sort("timestamp", -1).limit(50)
    recent_events = []
    async for ev in events_cursor:
        recent_events.append({
            "id":                str(ev.get("_id")),
            "type":              ev.get("type"),
            "model":             ev.get("model"),
            "tier":              ev.get("virtual_model"),
            "user_id":           ev.get("user_id"),
            "chat_id":           ev.get("chat_id"),
            "mode":              ev.get("mode"),
            "latency_ms":        ev.get("latency_ms"),
            "ttft_ms":           ev.get("ttft_ms"),
            "total_chunks":      ev.get("total_chunks"),
            "prompt_tokens":     ev.get("prompt_tokens"),
            "completion_tokens": ev.get("completion_tokens"),
            "cost":              ev.get("cost"),
            "error":             ev.get("error"),
            "error_details":     ev.get("error_details"),
            "timestamp":         ev.get("timestamp").isoformat() if ev.get("timestamp") else None
        })

    # Total cost
    total_cost = 0.0
    async for doc in llm_logs.aggregate([{"$group": {"_id": None, "total_cost": {"$sum": "$cost"}}}]):
        total_cost = doc.get("total_cost", 0.0)

    return {
        "model_stats":    model_stats,
        "recent_events":  recent_events,
        "total_cost":     total_cost,
        "tiers":          all_tiers,
    }


# ── GET /agent/health — per-model health derived from log history ──────────────
@router.get("/agent/health")
async def get_model_health():
    """Return health status for every configured model, derived from actual log history.
    No models are pinged. Health is based on: was it tried? did it respond? success rate."""
    since_24h = datetime.now(timezone.utc) - timedelta(hours=24)

    pipeline = [
        {"$match": {"timestamp": {"$gte": since_24h}}},
        {
            "$group": {
                "_id":          "$model",
                "success_24h":  {"$sum": {"$cond": [{"$eq": ["$type", "success"]}, 1, 0]}},
                "failure_24h":  {"$sum": {"$cond": [{"$eq": ["$type", "failure"]}, 1, 0]}},
                "last_seen":    {"$max": "$timestamp"},
                "avg_latency":  {"$avg": "$latency_ms"},
            }
        }
    ]

    cursor   = llm_logs.aggregate(pipeline)
    stats_24 = {}
    async for doc in cursor:
        if doc["_id"]:
            stats_24[doc["_id"]] = doc

    result = []
    for item in _live_model_list():
        m    = item["model"]
        tier = item["tier"]
        s    = stats_24.get(m)

        if s is None:
            status = "unknown"
            note   = "No requests in the last 24h"
        else:
            total = s["success_24h"] + s["failure_24h"]
            rate  = s["success_24h"] / total if total > 0 else 0
            if rate >= 0.8:
                status = "healthy"
                note   = f"{s['success_24h']}/{total} succeeded (24h)"
            elif rate > 0:
                status = "degraded"
                note   = f"Only {int(rate*100)}% success rate in last 24h"
            else:
                status = "unhealthy"
                note   = f"All {total} requests failed in last 24h"

        result.append({
            "model":        m,
            "tier":         tier,
            "status":       status,
            "note":         note,
            "success_24h":  s["success_24h"] if s else 0,
            "failure_24h":  s["failure_24h"] if s else 0,
            "last_seen":    s["last_seen"].isoformat() if s and s.get("last_seen") else None,
            "avg_latency_ms": round(s["avg_latency"]) if s and s.get("avg_latency") else None,
        })

    return {"health": result, "as_of": datetime.now(timezone.utc).isoformat()}


# ── GET /agent/events — filterable event log ───────────────────────────────────
@router.get("/agent/events")
async def get_llm_events(
    since_hours:  int   = 24,
    type:         str   = "",
    tier:         str   = "",
    model:        str   = "",
    user_id:      str   = "",
    chat_id:      str   = "",
    status_code:  int   = Query(None),
    limit:        int   = 100
):
    """Filterable event log for the admin logs tab. Supports user_id and chat_id filtering."""
    since = datetime.now(timezone.utc) - timedelta(hours=since_hours)

    query: dict = {"timestamp": {"$gte": since}}
    if type:        query["type"]            = type
    if tier:        query["virtual_model"]   = tier
    if model:       query["$or"]             = [{"model": model}, {"virtual_model": model}]
    if user_id:     query["user_id"]         = user_id
    if chat_id:     query["chat_id"]         = chat_id
    if status_code is not None:
        query["error_details.status_code"] = status_code

    cursor = llm_logs.find(query).sort("timestamp", -1).limit(limit)
    events = []
    async for doc in cursor:
        events.append({
            "id":                str(doc.get("_id")),
            "type":              doc.get("type"),
            "model":             doc.get("model"),
            "tier":              doc.get("virtual_model"),
            "user_id":           doc.get("user_id"),
            "chat_id":           doc.get("chat_id"),
            "mode":              doc.get("mode"),
            "latency_ms":        doc.get("latency_ms"),
            "ttft_ms":           doc.get("ttft_ms"),
            "total_chunks":      doc.get("total_chunks"),
            "prompt_tokens":     doc.get("prompt_tokens"),
            "completion_tokens": doc.get("completion_tokens"),
            "cost":              doc.get("cost"),
            "error":             doc.get("error"),
            "error_details":     doc.get("error_details"),
            "timestamp":         doc.get("timestamp").isoformat() if doc.get("timestamp") else None
        })

    return {"events": events, "total": len(events)}


# ── GET /agent/user-stats — per-user usage summary ────────────────────────────
@router.get("/agent/user-stats")
async def get_user_stats(
    since_hours: int = 168,  # default: last 7 days
    limit:       int = 50,
):
    """Aggregate LLM usage by user_id — requests, tokens, cost per user."""
    since = datetime.now(timezone.utc) - timedelta(hours=since_hours)

    pipeline = [
        {"$match": {"timestamp": {"$gte": since}, "user_id": {"$exists": True, "$ne": None}}},
        {
            "$group": {
                "_id":               "$user_id",
                "total_requests":    {"$sum": 1},
                "success":           {"$sum": {"$cond": [{"$eq": ["$type", "success"]}, 1, 0]}},
                "failure":           {"$sum": {"$cond": [{"$eq": ["$type", "failure"]}, 1, 0]}},
                "total_tokens":      {"$sum": {"$add": ["$prompt_tokens", "$completion_tokens"]}},
                "total_cost":        {"$sum": "$cost"},
                "avg_latency_ms":    {"$avg": "$latency_ms"},
                "last_request":      {"$max": "$timestamp"},
                "models_used":       {"$addToSet": "$model"},
            }
        },
        {"$sort": {"total_requests": -1}},
        {"$limit": limit},
    ]

    stats = []
    async for doc in llm_logs.aggregate(pipeline):
        stats.append({
            "user_id":          doc["_id"],
            "total_requests":   doc["total_requests"],
            "success":          doc["success"],
            "failure":          doc["failure"],
            "total_tokens":     doc["total_tokens"],
            "total_cost":       round(doc["total_cost"], 6),
            "avg_latency_ms":   round(doc["avg_latency_ms"]) if doc.get("avg_latency_ms") else None,
            "last_request":     doc["last_request"].isoformat() if doc.get("last_request") else None,
            "models_used":      doc["models_used"],
        })

    return {"user_stats": stats, "total": len(stats), "since_hours": since_hours}