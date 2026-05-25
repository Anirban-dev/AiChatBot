# config.py
import os
from pathlib import Path
from openai import AsyncOpenAI # type: ignore
from dotenv import load_dotenv # type: ignore
import torch # type: ignore
from langchain_text_splitters import RecursiveCharacterTextSplitter # type: ignore
import logging
logging.getLogger("litellm").addFilter(
    lambda record: "botocore" not in record.getMessage()
)

# Find the path to the .env file one level up
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)


# =============================================================================
# ── LITELLM ROUTER INTEGRATION ───────────────────────────────────────────────
# =============================================================================
import os
import litellm
from litellm import Router
from litellm_config import LITELLM_ROUTER_CONFIG

# Instantiate the optimal maximum-quota embedded router engine in-memory
litellm.set_verbose = True
router = Router(**LITELLM_ROUTER_CONFIG)

async def async_chat_completion(tier_name: str, messages: list, **kwargs) -> str:
    """Asynchronously streams or returns text across summaryllm, lowllm, or highllm."""
    try:
        response = await router.acompletion(
            model=tier_name,
            messages=messages,
            **kwargs
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Failover pool exhausted for tier {tier_name}. Error: {str(e)}"

async def async_embedding_call(text_list: list) -> list:
    """Asynchronously generates 1024-dimension vector listings."""
    try:
        response = await router.aembedding(
            model="free-embed",
            input=text_list
        )
        return [item["embedding"] for item in response.data]
    except Exception as e:
        print(f"Async embedding route mapping dropped: {e}")
        return []
    
# ────────── BACKWARD COMPATIBILITY CLIENT ADAPTER ──────────────────────────────────
class CompatibilityClient:
    class Chat:
        class Completions:
            async def create(self, model, messages, **kwargs):
                # Intercepts old models and maps them onto our new system tiers automatically!
                if model == "summaryllm":
                    target_tier = "summaryllm"
                elif model == "visionllm":
                    target_tier = "visionllm"
                else:
                    target_tier = "lowllm"

                # Drop-in execution to the router
                response = await router.acompletion(model=target_tier, messages=messages, **kwargs)
                return response

        def __init__(self):
            self.completions = self.Completions()

    def __init__(self):
        self.chat = self.Chat()

client = CompatibilityClient()
LLM_LOW_MODEL = "lowllm"
LLM_SUMM_MODEL = "summaryllm"
LLM_VISION_MODEL = "visionllm"
    
    
# ── Security ─────────────────────────────────────────────────────────────────
CONCURRENT_STREAMS = 50
CONCURRENT_UPLOADS = 10

# ── Redis ────────────────────────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL")

# ── Qdrent VectorDB───────────────────────────────────────────────────────────
QDRANT_URL               = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY           = os.getenv("QDRANT_API_KEY")
QDRANT_COLLECTION_PREFIX = os.getenv("QDRANT_COLLECTION_PREFIX", "chat")

# ── Embedding model ───────────────────────────────────────────────────────────
EMBED_MODEL = "all-MiniLM-L6-v2"   # ~90MB, CPU-friendly
EMBED_DIM   = 384                   # output vector size for this model
EMBED_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# ── Chunking ──────────────────────────────────────────────────────────────────
CHUNK_SIZE    = 1000
CHUNK_OVERLAP = 150

splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP
)

# ── RAG retrieval ─────────────────────────────────────────────────────────────
TOP_K_RESULTS = 4   # how many chunks to pull per query

# ── System prompt ─────────────────────────────────────────────────────────────
SYSTEM_PROMPT = (
    "You are ChatAI, developed by AP Corporation."
    "CAPABILITIES:"
    "- You have access to a Frontend Python Sandbox. "
    "- For complex math, data analysis, or generating charts, you must provide a code block."
    "- Pre-installed libraries: numpy, pandas, and micropip."

    "CRITICAL RULES:"
    "1. If a '=== Context ===' section appears below, it contains REAL content from the user's uploaded documents."
    "2. You MUST use that context to answer. Do NOT say you cannot see files or documents."
    "3. If the answer is in the context, quote or summarize it directly."
    "4. When writing code, ALWAYS use the syntax:"
    "```python"
    "# your code here"
)