from langchain_huggingface import HuggingFaceEmbeddings  # type: ignore
from config import EMBED_MODEL, EMBED_DEVICE,  EMBED_DIM

_embeddings = None

def get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        print(f"[Embeddings] Loading {EMBED_MODEL} on {EMBED_DEVICE}...")
        _embeddings = HuggingFaceEmbeddings(
            model_name=EMBED_MODEL,
            model_kwargs={"device": EMBED_DEVICE}
        )
        print(f"[Embeddings] Ready (dim={EMBED_DIM})")
    return _embeddings