import os
import shutil
from langchain_community.vectorstores import FAISS  # type: ignore
from langchain_core.documents import Document  # type: ignore
from services.embeddings import get_embeddings
from config import VECTOR_STORE_PATH, TOP_K_RESULTS

# Cache stores in memory: { chat_id: FAISS }
_stores: dict[str, FAISS] = {}

def get_store_path(chat_id: str) -> str:
    if not chat_id:
        return VECTOR_STORE_PATH
    return os.path.join(VECTOR_STORE_PATH, chat_id)

def get_store(chat_id: str) -> FAISS | None:
    global _stores
    if chat_id in _stores:
        return _stores[chat_id]
    
    path = get_store_path(chat_id)
    if os.path.exists(path):
        print(f"[VectorStore] Loading store for chat {chat_id} from {path}...")
        try:
            store = FAISS.load_local(
                path,
                get_embeddings(),
                allow_dangerous_deserialization=True
            )
            _stores[chat_id] = store
            return store
        except Exception as e:
            print(f"[VectorStore] Error loading store for chat {chat_id}: {e}")
            return None
    return None

def add_documents(docs: list[Document], chat_id: str):
    global _stores
    emb = get_embeddings()
    store = get_store(chat_id)
    
    if store is None:
        store = FAISS.from_documents(docs, emb)
    else:
        store.add_documents(docs)
    
    _stores[chat_id] = store
    path = get_store_path(chat_id)
    os.makedirs(path, exist_ok=True)
    store.save_local(path)
    print(f"[VectorStore] Saved {len(docs)} chunks for chat {chat_id} to disk")

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

def search(query: str, chat_id: str, k: int = TOP_K_RESULTS) -> list[Document]:
    store = get_store(chat_id)
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

def delete_by_source(filename: str, chat_id: str):
    global _stores
    store = get_store(chat_id)
    if store is None:
        return
    
    # Filter documents
    docs = store.docstore._dict.values()
    remaining_docs = [d for d in docs if d.metadata.get("source") != filename]
    
    if len(remaining_docs) == len(docs):
        print(f"[VectorStore] No chunks found for '{filename}' in chat {chat_id}")
        return

    path = get_store_path(chat_id)
    if not remaining_docs:
        print(f"[VectorStore] Clearing store for chat {chat_id} after deleting '{filename}'")
        _stores.pop(chat_id, None)
        if os.path.exists(path):
            shutil.rmtree(path)
    else:
        new_store = FAISS.from_documents(remaining_docs, get_embeddings())
        _stores[chat_id] = new_store
        new_store.save_local(path)
        print(f"[VectorStore] Deleted chunks for '{filename}' in chat {chat_id}. Remaining: {len(remaining_docs)}")


def archive_message(chat_id: str, role: str, content: str):
    """
    Archives a single chat message into the FAISS store for long-term memory.
    """
    if not content or len(content.strip()) < 5:
        return

    # 1. Create a LangChain Document object
    # We tag it as 'content' so your search() function picks it up correctly
    doc = Document(
        page_content=f"Past Chat ({role}): {content}",
        metadata={
            "source": "chat_history", 
            "role": role, 
            "type": "content", # Matches your search() filter
            "chat_id": chat_id
        }
    )

    print(f"[VectorStore] Archiving message from {role} for chat {chat_id}...")
    
    # 2. Reuse your existing add_documents function
    # This handles loading the store, adding the doc, and saving to disk
    try:
        add_documents([doc], chat_id)
    except Exception as e:
        print(f"[VectorStore] Failed to archive message: {e}")