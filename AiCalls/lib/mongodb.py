# mongodb.py
import os
from motor.motor_asyncio import AsyncIOMotorClient
from urllib.parse import urlparse

MONGO_URI = os.getenv("MONGO_URI")

# Parse the database name from MONGO_URI, default to AiAssistant
try:
    parsed  = urlparse(MONGO_URI)
    db_name = parsed.path.lstrip("/") or "AiAssistant"
except Exception:
    db_name = "AiAssistant"

# Shared MongoDB client
client = AsyncIOMotorClient(MONGO_URI)
db     = client[db_name]

# ── Collections ───────────────────────────────────────────────────────────────
llm_logs   = db["llmlogs"]    # per-model LLM call events (success/failure/retry)
chat_logs  = db["chatlogs"]   # per-chat-request lifecycle events
