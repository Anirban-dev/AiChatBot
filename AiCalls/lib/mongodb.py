# mongodb.py
import os
from motor.motor_asyncio import AsyncIOMotorClient
from urllib.parse import urlparse

MONGO_URI = os.getenv("MONGO_URI")

# Parse the database name from MONGO_URI, default to AiAssistant
try:
    parsed = urlparse(MONGO_URI)
    db_name = parsed.path.lstrip("/") or "AiAssistant"
except Exception:
    db_name = "AiAssistant"

# Create a shared MongoDB client
client = AsyncIOMotorClient(MONGO_URI)
db = client[db_name]

# Helper collections
llm_logs = db["llmlogs"]
