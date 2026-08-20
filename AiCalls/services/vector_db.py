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
from lib.litellm_config import get_current_config
from services.embeddings import get_embeddings

EMBED_TIER = "free-embed"

# Singleton Client Initialization
_qdrant_client: QdrantClient | None = None
_vector_size: int | None = None
_vector_size_key: str | None = None

def get_client() -> QdrantClient:
    global _qdrant_client
    if _qdrant_client is None:
        _qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
        print(f"[VectorDB] Connected to Qdrant at {QDRANT_URL}")
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
        print(f"[VectorDB] Detected embedding dimension: {_vector_size}")
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

async def search(
    query: str,
    chat_id: str,
    k: int = 4,
    active_path: list = None
) -> list[Document]:
    """
    Search for relevant documents in the vector store.
    When active_path is provided, only searches documents from messages in the active path.
    """
    from langchain_qdrant import QdrantVectorStore
    
    collection_name = get_collection_name(chat_id)
    
    if not collection_exists(collection_name):
        return []
    
    vector_store = instantiate_vector_store(collection_name)
    
    # If active_path is provided, filter search to only include messages in the path
    if active_path:
        # Build a filter to only include messages from the active path
        message_ids = [msg.get("_id") for msg in active_path if msg.get("_id")]
        if message_ids:
            # Create a filter for specific message IDs
            must_conditions = []
            for msg_id in message_ids:
                must_conditions.append(FieldCondition(key="metadata.message_id", match=MatchValue(value=str(msg_id))))
            
            results = await vector_store.asimilarity_search(
                query=query,
                k=k,
                filter=Filter(must=must_conditions) if must_conditions else None
            )
            return results
    
    # Default search without path filtering
    return await vector_store.asimilarity_search(query=query, k=k)