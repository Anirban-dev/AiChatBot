import os
import pandas as pd
from langchain_core.documents import Document  # type: ignore
from langchain_community.document_loaders import TextLoader  # type: ignore
from config import splitter
from services.vision import describe_image
from services.doc import load_structured_doc  # ← delegated

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff"}
MEDIA_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png",  ".gif": "image/gif",
    ".webp": "image/webp", ".bmp": "image/bmp",
    ".tiff": "image/tiff",
}

# ── STANDALONE IMAGE ──────────────────────────────────────────────────────────

async def load_image(path: str, filename: str) -> list[Document]:
    ext = os.path.splitext(filename)[1].lower()
    media_type = MEDIA_TYPES.get(ext, "image/png")

    with open(path, "rb") as f:
        image_bytes = f.read()

    description = await describe_image(image_bytes, media_type)
    if not description:
        return []

    return [Document(
        page_content=f"[Image file: {filename}]:\n{description}",
        metadata={"source": filename, "type": "embedded_image"},
    )]

# ── TABLES & TEXT (EXCEL, CSV, TXT) ──────────────────────────────────────────

def load_excel(path: str, filename: str) -> list[Document]:
    docs = []
    xl = pd.ExcelFile(path)
    for sheet in xl.sheet_names:
        df = xl.parse(sheet)
        text = f"Sheet: {sheet}\n{df.to_markdown(index=False)}"
        docs.append(Document(
            page_content=text,
            metadata={"source": filename, "sheet": sheet, "type": "content"},
        ))
    return docs

def load_csv(path: str, filename: str) -> list[Document]:
    df = pd.read_csv(path)
    return [Document(
        page_content=df.to_markdown(index=False),
        metadata={"source": filename, "type": "content"},
    )]

def load_text(path: str, filename: str) -> list[Document]:
    loader = TextLoader(path, encoding="utf-8")
    docs = loader.load()
    for d in docs:
        d.metadata["type"] = "content"
    return docs

# ── DISPATCHER & SMART CHUNKING ───────────────────────────────────────────────

SUPPORTED = {
    ".pdf", ".docx", ".doc", ".pptx", ".ppt",
    ".txt", ".md", ".csv", ".xlsx", ".xls",
    *IMAGE_EXTENSIONS,
}

async def load_and_chunk(path: str, filename: str) -> list[Document]:
    ext = os.path.splitext(filename)[1].lower()

    if ext not in SUPPORTED:
        raise ValueError(f"Unsupported file type: '{ext}'")

    # ── Routing ───────────────────────────────────────────────────────────────
    if ext in {".pdf", ".docx", ".doc", ".pptx", ".ppt"}:
        raw = await load_structured_doc(path, filename)
    elif ext in IMAGE_EXTENSIONS:
        raw = await load_image(path, filename)
    elif ext in {".xlsx", ".xls"}:
        raw = load_excel(path, filename)
    elif ext == ".csv":
        raw = load_csv(path, filename)
    else:
        raw = load_text(path, filename)

    # ── Smart Chunking ────────────────────────────────────────────────────────
    # Images (standalone or embedded) are kept whole — never split
    if ext in IMAGE_EXTENSIONS:
        return raw

    final_chunks: list[Document] = []
    to_split: list[Document] = []

    for d in raw:
        if d.metadata.get("type") in {"image", "embedded_image"}:
            final_chunks.append(d)
        else:
            to_split.append(d)

    if to_split:
        final_chunks.extend(splitter.split_documents(to_split))

    print(f"[Loader] '{filename}' → {len(final_chunks)} chunks total")
    return final_chunks