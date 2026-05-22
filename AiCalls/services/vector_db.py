import asyncio
from qdrant_client import QdrantClient #type: ignore
from qdrant_client.models import ( #type: ignore
    Distance,
    FieldCondition,
    Filter,
    FilterSelector,
    MatchValue,
    VectorParams,
)
from langchain_core.documents import Document
from langchain_qdrant import QdrantVectorStore #type: ignore

from config import QDRANT_API_KEY, QDRANT_COLLECTION_PREFIX, QDRANT_URL
from services.embeddings import get_embeddings

# Singleton Client Initialization
_qdrant_client: QdrantClient | None = None
_vector_size: int | None = None

def get_client() -> QdrantClient:
    global _qdrant_client
    if _qdrant_client is None:
        _qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
        print(f"[VectorDB] Connected to Qdrant at {QDRANT_URL}")
    return _qdrant_client

def get_collection_name(chat_id: str) -> str:
    """Computes the physical collection name in Qdrant."""
    return f"{QDRANT_COLLECTION_PREFIX}_{chat_id}" if chat_id else QDRANT_COLLECTION_PREFIX

def _get_vector_size() -> int:
    global _vector_size
    if _vector_size is None:
        _vector_size = len(get_embeddings().embed_query("ping"))
        print(f"[VectorDB] Detected embedding dimension: {_vector_size}")
    return _vector_size

def collection_exists(name: str) -> bool:
    return any(c.name == name for c in get_client().get_collections().collections)

def ensure_collection(name: str) -> None:
    if not collection_exists(name):
        get_client().create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=_get_vector_size(), distance=Distance.COSINE),
        )
        print(f"[VectorDB] Created Qdrant collection '{name}'")

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