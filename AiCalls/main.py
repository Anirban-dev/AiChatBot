# main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI # type: ignore
from routes.upload import router as upload_router
from routes.chat  import router as chat_router
from routes.llmlite import router as llm_router
from services.embeddings import get_embeddings
from config import EMBED_DIM

from langgraph.pregel import Pregel
if not hasattr(Pregel, "get_schemas"):
    Pregel.get_schemas = lambda self: {}
if not hasattr(Pregel, "aget_schemas"):
    async def _aget_schemas(self): return {}
    Pregel.aget_schemas = _aget_schemas

from lib.ratelimit import register_rate_limiter

@asynccontextmanager
async def lifespan(app: FastAPI):
    # runs on startup
    print("[Startup] Warming up embeddings model...")
    emb  = get_embeddings()
    test = emb.embed_query("hello world")
    print(f"[Startup] Embeddings OK — vector dim: {len(test)}, expected: {EMBED_DIM}")

    # Build the LLM router from admin-managed provider configs (MongoDB)
    from lib.litellm_config import reload_router
    await reload_router()
    yield
    # anything after yield runs on shutdown (nothing needed here)

app = FastAPI(title="ChatAI Agent", lifespan=lifespan)

# Every request through the FastAPI app is rate limited
register_rate_limiter(app)

app.include_router(upload_router)
app.include_router(chat_router)
app.include_router(llm_router)

if __name__ == "__main__":
    import uvicorn # type: ignore
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)