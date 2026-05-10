import os
import shutil
from langchain_community.vectorstores import FAISS  # type: ignore
from langchain_core.documents import Document  # type: ignore
from services.embeddings import get_embeddings
from config import VECTOR_STORE_PATH, TOP_K_RESULTS

_store: FAISS | None = None

def get_store() -> FAISS | None:
    global _store
    if _store is None and os.path.exists(VECTOR_STORE_PATH):
        print("[VectorStore] Loading from disk...")
        _store = FAISS.load_local(
            VECTOR_STORE_PATH,
            get_embeddings(),
            allow_dangerous_deserialization=True
        )
    return _store

def add_documents(docs: list[Document]):
    global _store
    emb = get_embeddings()
    if _store is None:
        _store = FAISS.from_documents(docs, emb)
    else:
        _store.add_documents(docs)
    _store.save_local(VECTOR_STORE_PATH)
    print(f"[VectorStore] Saved {len(docs)} chunks to disk")

# Visual intent keywords
_VISUAL_KEYWORDS = {
    "image", "images", "picture", "pictures", "photo", "photos",
    "diagram", "diagrams", "figure", "figures", "chart", "charts",
    "illustration", "graphic", "visual", "screenshot", "what does it look like",
    "show", "depicted", "drawn", "displayed"
}

def _is_visual_query(query: str) -> bool:
    q = query.lower()
    return any(kw in q for kw in _VISUAL_KEYWORDS)

def search(query: str, k: int = TOP_K_RESULTS) -> list[Document]:
    store = get_store()
    if store is None:
        return []

    results = store.similarity_search(query, k=k * 3)

    text_chunks  = [d for d in results if d.metadata.get("type") == "content"]
    image_chunks = [d for d in results if d.metadata.get("type") == "embedded_image"]

    if _is_visual_query(query):
        # Images first, text fills remaining slots
        merged = (image_chunks + text_chunks)[:k]
        print(f"[VectorStore] Visual query → images first: {len(image_chunks)} img + {len(text_chunks)} text")
    else:
        # Text first, images fill remaining slots
        merged = (text_chunks + image_chunks)[:k]
        print(f"[VectorStore] Text query → text first: {len(text_chunks)} text + {len(image_chunks)} img")

    return merged

def delete_by_source(filename: str):
    global _store
    store = get_store()
    if store is None:
        return
    
    # Filter documents
    docs = store.docstore._dict.values()
    remaining_docs = [d for d in docs if d.metadata.get("source") != filename]
    
    if len(remaining_docs) == len(docs):
        print(f"[VectorStore] No chunks found for '{filename}'")
        return

    if not remaining_docs:
        print(f"[VectorStore] Clearing store after deleting '{filename}'")
        _store = None
        if os.path.exists(VECTOR_STORE_PATH):
            shutil.rmtree(VECTOR_STORE_PATH)
    else:
        _store = FAISS.from_documents(remaining_docs, get_embeddings())
        _store.save_local(VECTOR_STORE_PATH)
        print(f"[VectorStore] Deleted chunks for '{filename}'. Remaining: {len(remaining_docs)}")