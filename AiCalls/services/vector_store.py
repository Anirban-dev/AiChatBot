import asyncio
from collections import OrderedDict

from langchain_core.documents import Document
from langchain_qdrant import QdrantVectorStore #type: ignore
from qdrant_client import QdrantClient #type: ignore
from qdrant_client.models import ( #type: ignore
    Distance,
    FieldCondition,
    Filter,
    FilterSelector,
    MatchValue,
    VectorParams,
)

from config import (
    QDRANT_API_KEY,
    QDRANT_COLLECTION_PREFIX,
    QDRANT_URL,
    TOP_K_RESULTS,
)
from services.embeddings import get_embeddings

# ---------------------------------------------------------------------------
# Singleton Qdrant client
# ---------------------------------------------------------------------------

_qdrant_client: QdrantClient | None = None


def get_client() -> QdrantClient:
    global _qdrant_client
    if _qdrant_client is None:
        _qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
        print(f"[VectorStore] Connected to Qdrant at {QDRANT_URL}")
    return _qdrant_client


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _collection_name(chat_id: str) -> str:
    """Each chat gets its own Qdrant collection."""
    return f"{QDRANT_COLLECTION_PREFIX}_{chat_id}" if chat_id else QDRANT_COLLECTION_PREFIX


_vector_size: int | None = None


def _get_vector_size() -> int:
    """Compute embedding dimension once and cache it."""
    global _vector_size
    if _vector_size is None:
        _vector_size = len(get_embeddings().embed_query("ping"))
        print(f"[VectorStore] Detected embedding dimension: {_vector_size}")
    return _vector_size


def _collection_exists(name: str) -> bool:
    return any(c.name == name for c in get_client().get_collections().collections)


def _ensure_collection(name: str) -> None:
    if not _collection_exists(name):
        get_client().create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=_get_vector_size(), distance=Distance.COSINE),
        )
        print(f"[VectorStore] Created Qdrant collection '{name}'")


# ---------------------------------------------------------------------------
# Per-chat async locks
# ---------------------------------------------------------------------------

_store_locks: dict[str, asyncio.Lock] = {}


def _get_lock(chat_id: str) -> asyncio.Lock:
    if chat_id not in _store_locks:
        _store_locks[chat_id] = asyncio.Lock()
    return _store_locks[chat_id]


# ---------------------------------------------------------------------------
# LRU in-memory cache for QdrantVectorStore handles
# (stores are lightweight – just a client ref + collection name)
# ---------------------------------------------------------------------------

_MAX_CACHED_STORES = 20


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
            print(f"[VectorStore] Evicted store for chat '{evicted}' from memory cache")

    def pop(self, key: str) -> None:
        self._cache.pop(key, None)

    def __contains__(self, key: str) -> bool:
        return key in self._cache


_stores = _LRUStoreCache(_MAX_CACHED_STORES)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_store(chat_id: str) -> QdrantVectorStore | None:
    """Return a QdrantVectorStore for *chat_id*, or None if no collection exists yet."""
    cached = _stores.get(chat_id)
    if cached is not None:
        return cached

    name = _collection_name(chat_id)
    if not _collection_exists(name):
        return None

    store = QdrantVectorStore(
        client=get_client(),
        collection_name=name,
        embedding=get_embeddings(),
    )
    _stores.set(chat_id, store)
    return store


async def add_documents(docs: list[Document], chat_id: str) -> None:
    """Upsert *docs* into the collection for *chat_id*, creating it when needed."""
    async with _get_lock(chat_id):
        name = _collection_name(chat_id)
        _ensure_collection(name)

        store = _stores.get(chat_id)
        if store is None:
            store = QdrantVectorStore(
                client=get_client(),
                collection_name=name,
                embedding=get_embeddings(),
            )
            _stores.set(chat_id, store)

        store.add_documents(docs)
        print(f"[VectorStore] Upserted {len(docs)} chunks for chat '{chat_id}'")


# ---------------------------------------------------------------------------
# Visual query routing
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


def _type_filter(doc_type: str) -> Filter:
    return Filter(
        must=[FieldCondition(key="metadata.type", match=MatchValue(value=doc_type))]
    )


def search(query: str, chat_id: str, k: int = TOP_K_RESULTS) -> list[Document]:
    store = get_store(chat_id)
    if store is None:
        return []

    fetch_k = k * 3  # over-fetch so both buckets have enough candidates

    text_chunks = store.similarity_search(query, k=fetch_k, filter=_type_filter("content"))
    image_chunks = store.similarity_search(query, k=fetch_k, filter=_type_filter("embedded_image"))

    if _is_visual_query(query):
        merged = (image_chunks + text_chunks)[:k]
        print(
            f"[VectorStore] Visual query → images first: "
            f"{len(image_chunks)} img + {len(text_chunks)} text"
        )
    else:
        merged = (text_chunks + image_chunks)[:k]
        print(
            f"[VectorStore] Text query → text first: "
            f"{len(text_chunks)} text + {len(image_chunks)} img"
        )

    return merged


def delete_by_source(filename: str, chat_id: str) -> None:
    """Delete all points whose metadata.source matches *filename*."""
    client = get_client()
    name = _collection_name(chat_id)

    if not _collection_exists(name):
        print(f"[VectorStore] No collection for chat '{chat_id}' — nothing to delete")
        return

    client.delete(
        collection_name=name,
        points_selector=FilterSelector(
            filter=Filter(
                must=[
                    FieldCondition(
                        key="metadata.source",
                        match=MatchValue(value=filename),
                    )
                ]
            )
        ),
    )

    remaining = client.count(collection_name=name).count
    if remaining == 0:
        # Collection is empty — drop it entirely
        client.delete_collection(collection_name=name)
        _stores.pop(chat_id)
        print(
            f"[VectorStore] Deleted collection '{name}' "
            f"(no documents left after removing '{filename}')"
        )
    else:
        print(
            f"[VectorStore] Deleted chunks for '{filename}' in chat '{chat_id}'. "
            f"Remaining points: {remaining}"
        )


async def archive_message(chat_id: str, role: str, content: str) -> None:
    """Embed and persist a single chat turn for long-term memory retrieval."""
    if not content or len(content.strip()) < 5:
        return

    doc = Document(
        page_content=f"Past Chat ({role}): {content}",
        metadata={
            "source": "chat_history",
            "role": role,
            "type": "content",
            "chat_id": chat_id,
        },
    )

    print(f"[VectorStore] Archiving message from '{role}' for chat '{chat_id}'…")
    try:
        await add_documents([doc], chat_id)
    except Exception as e:
        print(f"[VectorStore] Failed to archive message: {e}")