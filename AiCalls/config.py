# config.py
import os
from pathlib import Path
from openai import AsyncOpenAI # type: ignore
from dotenv import load_dotenv # type: ignore
import torch # type: ignore
from langchain_text_splitters import RecursiveCharacterTextSplitter # type: ignore

# Find the path to the .env file one level up
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# ── LLM ──────────────────────────────────────────────────────────────────────
LLM_API   = os.getenv("LLM_API")
LLM_SECRET = os.getenv("LLM_SECRET")
LLM_MODEL = os.getenv("LLM_MODEL")

client = AsyncOpenAI(base_url=LLM_API, api_key=LLM_SECRET)

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

# ── Vector store ──────────────────────────────────────────────────────────────
VECTOR_STORE_PATH = "faiss_index"

# ── RAG retrieval ─────────────────────────────────────────────────────────────
TOP_K_RESULTS = 4   # how many chunks to pull per query

# ── System prompt ─────────────────────────────────────────────────────────────
SYSTEM_PROMPT = (
    "You are ChatAI, developed by AP Corporation.\n\n"
    "CRITICAL RULES:\n"
    "- If a '=== Context ===' section appears below, it contains REAL content from the user's uploaded documents.\n"
    "- You MUST use that context to answer. Do NOT say you cannot see files or documents.\n"
    "- If the answer is in the context, quote or summarize it directly.\n"
    "- Only say you lack information if the context section is empty.\n"
    "- Be concise, use markdown formatting, include code examples when relevant."
)