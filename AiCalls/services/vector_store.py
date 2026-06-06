import asyncio
from collections import OrderedDict
from langchain_core.documents import Document
from langchain_qdrant import QdrantVectorStore #type: ignore
from qdrant_client.models import FilterSelector, Filter, FieldCondition, MatchValue #type: ignore

from config import TOP_K_RESULTS
from services.vector_db import (
    get_client,
    get_collection_name,
    collection_exists,
    ensure_collection,
    type_filter,
    instantiate_vector_store
)

# ---------------------------------------------------------------------------
# Locks and Memory Cache Configuration
# ---------------------------------------------------------------------------
_store_locks: dict[str, asyncio.Lock] = {}
_MAX_CACHED_STORES = 20

def _get_lock(chat_id: str) -> asyncio.Lock:
    if chat_id not in _store_locks:
        _store_locks[chat_id] = asyncio.Lock()
    return _store_locks[chat_id]

class _LRUStoreCache:
    def __init__(self, maxsize: int):
        self._cache: OrderedDict[str, QdrantVectorStore] = OrderedDict()
        self._maxsize = maxsize

    def get(self, key: str) -> QdrantVectorStore | None:
        if key not in self._cache:
            return None
        self._cache.move_to_end(key)
        return self._cache[key]

    def set(self, key: str, value: QdrantVectorStore) -> None:
        self._cache[key] = value
        self._cache.move_to_end(key)
        if len(self._cache) > self._maxsize:
            evicted, _ = self._cache.popitem(last=False)
            print(f"[VectorStore] Evicted chat '{evicted}' from memory cache")

    def pop(self, key: str) -> None:
        self._cache.pop(key, None)

_stores = _LRUStoreCache(_MAX_CACHED_STORES)

# ---------------------------------------------------------------------------
# Visual query routing heuristics
# ---------------------------------------------------------------------------
_VISUAL_KEYWORDS = {
    "image", "images", "picture", "pictures", "photo", "photos",
    "diagram", "diagrams", "figure", "figures", "chart", "charts",
    "illustration", "graphic", "visual", "screenshot",
    "what does it look like", "show", "depicted", "drawn", "displayed",
}

def _is_visual_query(query: str) -> bool:
    q = query.lower()
    return any(kw in q for kw in _VISUAL_KEYWORDS)

# ---------------------------------------------------------------------------
# Public Business Logic API
# ---------------------------------------------------------------------------
def get_store(chat_id: str) -> QdrantVectorStore | None:
    cached = _stores.get(chat_id)
    if cached is not None:
        return cached

    name = get_collection_name(chat_id)
    if not collection_exists(name):
        return None

    store = instantiate_vector_store(name)
    _stores.set(chat_id, store)
    return store

async def add_documents(docs: list[Document], chat_id: str) -> None:
    async with _get_lock(chat_id):
        name = get_collection_name(chat_id)

        store = _stores.get(chat_id)
        if store is None:
            store = instantiate_vector_store(name)
            _stores.set(chat_id, store)

        await asyncio.to_thread(store.add_documents, docs)
        print(f"[VectorStore] Upserted {len(docs)} chunks for chat '{chat_id}'")

async def search(query: str, chat_id: str, k: int = TOP_K_RESULTS) -> list[Document]:
    store = get_store(chat_id)
    if store is None:
        return []

    fetch_k = k * 3
    text_task = asyncio.to_thread(store.similarity_search, query, k=fetch_k, filter=type_filter("content"))
    image_task = asyncio.to_thread(store.similarity_search, query, k=fetch_k, filter=type_filter("embedded_image"))

    text_chunks, image_chunks = await asyncio.gather(text_task, image_task)

    if _is_visual_query(query):
        merged = (image_chunks + text_chunks)[:k]
        print(f"[VectorStore] Visual query → prioritizing image nodes ({len(image_chunks)} matched)")
    else:
        merged = (text_chunks + image_chunks)[:k]
        print(f"[VectorStore] Text query → prioritizing text nodes ({len(text_chunks)} matched)")

    return merged

def delete_by_source(filename: str, chat_id: str) -> None:
    client = get_client()
    name = get_collection_name(chat_id)

    if not collection_exists(name):
        print(f"[VectorStore] No collection for chat '{chat_id}' — skipping delete")
        return

    client.delete(
        collection_name=name,
        points_selector=FilterSelector(
            filter=Filter(must=[FieldCondition(key="metadata.source", match=MatchValue(value=filename))])
        ),
    )

    remaining = client.count(collection_name=name).count
    if remaining == 0:
        client.delete_collection(collection_name=name)
        _stores.pop(chat_id)
        print(f"[VectorStore] Dropped empty collection '{name}' after purging '{filename}'")
    else:
        print(f"[VectorStore] Deleted '{filename}' in '{chat_id}'. Remaining points: {remaining}")