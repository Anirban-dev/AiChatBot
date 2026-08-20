"""
Cloud embeddings backed by the admin-configured 'free-embed' tier (LiteLLM router).

Replaces the previous local HuggingFace model (all-MiniLM-L6-v2). The dimension
and latency now come from whichever Embeddings provider the admin enables under
Admin → AI APIs, so Qdrant collection sizes adapt automatically.
"""
import asyncio
import concurrent.futures
import logging

from langchain_core.embeddings import Embeddings  # type: ignore

from lib.litellm_config import router, _llm_log, get_current_config

_log = logging.getLogger("embeddings")

EMBED_TIER = "free-embed"

# LangChain calls our synchronous embed_* methods from worker threads and
# sometimes straight from the running asyncio loop. A small thread pool lets us
# drive the async LiteLLM call in a fresh event loop in either case, without
# the "asyncio.run() cannot be called from a running event loop" deadlock.
_thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)


def _block_on(coro):
    """Run an async coroutine and block for its result, loop-safe."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    return _thread_pool.submit(asyncio.run, coro).result()


class CloudEmbeddings(Embeddings):
    """LangChain-compatible embeddings backed by the LiteLLM `free-embed` tier."""

    def _check_configured(self) -> None:
        configured = any(
            entry.get("model_name") == EMBED_TIER
            for entry in get_current_config().get("model_list", [])
        )
        if not configured:
            raise RuntimeError(
                "Embeddings are not configured. Ask an administrator to add an "
                "Embeddings provider under Admin → AI APIs."
            )

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        self._check_configured()
        try:
            response = await router.aembedding(model=EMBED_TIER, input=texts)
        except Exception as e:
            _llm_log.error(f"[Embeddings] Cloud embedding call failed: {e}")
            raise RuntimeError(
                f"Embeddings service failed: {str(e).splitlines()[0][:200]}"
            ) from e

        data = getattr(response, "data", None) or (response.get("data") if isinstance(response, dict) else None)
        if not data:
            raise RuntimeError("Embeddings service returned an empty response.")

        result: list[list[float]] = []
        for item in data:
            vec = item.get("embedding") if isinstance(item, dict) else getattr(item, "embedding", None)
            if not vec:
                raise RuntimeError("Embeddings service returned a malformed embedding.")
            result.append(vec)
        return result

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return _block_on(self._embed(list(texts)))

    def embed_query(self, text: str) -> list[float]:
        return _block_on(self._embed([text]))[0]

    async def aembed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self._embed(list(texts))

    async def aembed_query(self, text: str) -> list[float]:
        return (await self._embed([text]))[0]


_embeddings: CloudEmbeddings | None = None


def get_embeddings() -> CloudEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = CloudEmbeddings()
        _log.info("[Embeddings] Using admin-configured cloud embeddings tier 'free-embed'")
    return _embeddings
