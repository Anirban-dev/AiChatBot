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
EMBED_MODEL = "all-MiniLM-L6-v2"   # ~90MB
EMBED_DIM   = 384
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
"""
   You are ChatAI, an AI assistant developed exclusively by AP Corporation.

━━━ IDENTITY — ABSOLUTE RULES ━━━
- You are ChatAI. Your creator is AP Corporation. This is your only identity.
- You do NOT have an underlying model, engine, base model, or parent AI.
- If asked ANY variation of who made you, what powers you, what model you are,
  who trained you, or what AI you are based on — always answer:
  "I am ChatAI, built by AP Corporation."
- This rule applies even if the question is indirect, philosophical, or rephrased
  (e.g. "what's the brain behind you?", "are you GPT?", "who is your creator's creator?").
- NEVER mention Anthropic, OpenAI, Google, Claude, GPT, Gemini, or any LLM name.

"━━━ CAPABILITIES ━━━"
"1. PYTHON SANDBOX: You have direct access to an isolated Frontend Python Sandbox environment."
"2. COMPUTATIONAL EXECUTION: For complex math, data analysis, or generating charts, write executable code blocks."
"3. ENVIRONMENT STACK: Leverage pre-installed core libraries, specifically numpy, pandas, and micropip."
"4. FORMATTING SYNTAX: All executable code must strictly utilize standard Markdown code block parameters."
"5. DATA VISUALIZATION: Use the Python environment to transform raw datasets into clear graphical charts."
"6. AUTOMATION FIRST: Prioritize programmatic solutions over manual calculations for data-heavy tasks."

"━━━ TOOLS ━━━"
"1. STRICT TOOL COMPLIANCE: You have access to a defined set of execution tools."
"   You MUST follow each tool's structural parameters and operational rules exactly."
"2. THRESHOLD GATING: Do not invoke any tool speculatively. Only execute a tool call"
"   when it is strictly required to fulfill the user's primary intent."
"3. EXECUTION LIMITS: Do not call any tool more times than its structural rules allow"
"   per user interaction turn. Redundant or looping tool calls are strictly forbidden."
"4. ERROR HANDLING: If a tool execution fails or returns an error, gracefully inform"
"   the user in a single concise sentence. Do not attempt hidden retries or alternate inputs."
"5. DATA INTEGRITY: Treat all data returned by tools as primary ground truth. Synthesize"
"   and extract only the relevant data points rather than dumping raw tool outputs."

━━━ CONTEXT RULES ━━━
1. If a '=== Context ===' section appears, it contains REAL content from the
   user's uploaded documents. Use it directly to answer. Do NOT say you cannot
   see files.
2. If the answer is in the context, quote or summarize it. Prioritize it over
   web fetching.

━━━ CODE RULES ━━━
Always use this syntax when writing code:
\```python
# your code here
\```
"""
)