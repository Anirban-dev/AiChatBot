import asyncio
from collections import OrderedDict
from langchain_core.documents import Document
from langchain_qdrant import QdrantVectorStore  # type: ignore
from qdrant_client import QdrantClient  # type: ignore
from qdrant_client.models import (  # type: ignore
    Distance,
    FieldCondition,
    Filter,
    FilterSelector,
    MatchValue,
    VectorParams,
)

from config import QDRANT_API_KEY, QDRANT_COLLECTION_PREFIX, QDRANT_URL, TOP_K_RESULTS
from lib.litellm_config import get_current_config
from services.embeddings import get_embeddings

EMBED_TIER = "free-embed"

# ---------------------------------------------------------------------------
# Singleton Qdrant Client Initialization & Metadata
# ---------------------------------------------------------------------------
_qdrant_client: QdrantClient | None = None
_vector_size: int | None = None
_vector_size_key: str | None = None


def get_client() -> QdrantClient:
    global _qdrant_client
    if _qdrant_client is None:
        _qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
        print(f"[VectorStore] Connected to Qdrant at {QDRANT_URL}")
    return _qdrant_client


def get_collection_name(chat_id: str) -> str:
    """Computes the physical collection name in Qdrant."""
    return f"{QDRANT_COLLECTION_PREFIX}_{chat_id}" if chat_id else QDRANT_COLLECTION_PREFIX


def _embed_signature() -> str:
    """Signature of the live embeddings model (name + base URL), so the cached
    vector dimension is invalidated whenever the admin switches providers."""
    for entry in get_current_config().get("model_list", []):
        if entry.get("model_name") == EMBED_TIER:
            p = entry.get("litellm_params", {}) or {}
            return f"{p.get('model')}|{p.get('api_base')}"
    return ""


def _get_vector_size() -> int:
    global _vector_size, _vector_size_key
    sig = _embed_signature()
    if _vector_size is None or sig != _vector_size_key:
        _vector_size = len(get_embeddings().embed_query("ping"))
        _vector_size_key = sig
        print(f"[VectorStore] Detected embedding dimension: {_vector_size}")
    return _vector_size


def embed_vector_info() -> dict:
    """Dimension of the live embeddings model vs. dimensions of existing Qdrant
    collections. Used so the admin is warned when a configured embedding model
    would not be compatible with already-indexed documents."""
    model = _embed_signature() or None

    dimension = None
    error: str | None = None
    try:
        dimension = _get_vector_size()
    except Exception as e:
        error = str(e).splitlines()[0][:300]

    indexed_collections = 0
    indexed_dimensions: list[int] = []
    try:
        cols = get_client().get_collections().collections
        indexed_collections = len(cols)
        seen = set()
        for c in cols:
            try:
                info = get_client().get_collection(c.name)
                vs = info.config.params.vectors
                if isinstance(vs, dict):
                    sizes = [v.get("size") for v in vs.values() if v]
                else:
                    sizes = [getattr(vs, "size", None)]
                for s in sizes:
                    if s:
                        seen.add(int(s))
            except Exception:
                continue
        indexed_dimensions = sorted(seen)
    except Exception as e:
        if error is None:
            error = str(e).splitlines()[0][:300]

    return {
        "model": model,
        "dimension": dimension,
        "error": error,
        "indexed_collections": indexed_collections,
        "indexed_dimensions": indexed_dimensions,
    }


def collection_exists(name: str) -> bool:
    return any(c.name == name for c in get_client().get_collections().collections)


def ensure_collection(name: str) -> None:
    if not collection_exists(name):
        get_client().create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=_get_vector_size(), distance=Distance.COSINE),
        )
        print(f"[VectorStore] Created Qdrant collection '{name}'")


def type_filter(doc_type: str) -> Filter:
    return Filter(
        must=[FieldCondition(key="metadata.type", match=MatchValue(value=doc_type))]
    )


def instantiate_vector_store(collection_name: str) -> QdrantVectorStore:
    """Wraps Qdrant client into LangChain interface."""
    return QdrantVectorStore(
        client=get_client(),
        collection_name=collection_name,
        embedding=get_embeddings(),
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


async def search(
    query: str,
    chat_id: str,
    k: int = TOP_K_RESULTS,
    active_path: list | None = None,
) -> list[Document]:
    store = get_store(chat_id)
    if store is None:
        return []

    # If active_path is provided, build condition for message IDs in active linear path
    path_filter_conditions: list[FieldCondition] = []
    if active_path:
        message_ids = [msg.get("_id") for msg in active_path if msg.get("_id")]
        for msg_id in message_ids:
            path_filter_conditions.append(
                FieldCondition(key="metadata.message_id", match=MatchValue(value=str(msg_id)))
            )

    def _build_filter(doc_type: str) -> Filter:
        must = [FieldCondition(key="metadata.type", match=MatchValue(value=doc_type))]
        if path_filter_conditions:
            must.extend(path_filter_conditions)
        return Filter(must=must)

    text_task = asyncio.to_thread(
        store.similarity_search, query, k=k, filter=_build_filter("content")
    )
    image_task = asyncio.to_thread(
        store.similarity_search, query, k=k, filter=_build_filter("embedded_image")
    )

    text_chunks, image_chunks = await asyncio.gather(text_task, image_task)

    if _is_visual_query(query):
        merged = (image_chunks + text_chunks)[:k]
    else:
        merged = (text_chunks + image_chunks)[:k]

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