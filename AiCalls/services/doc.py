import io
from langchain_core.documents import Document  # type: ignore
from services.vision import describe_image

# Docling Imports
from docling.document_converter import DocumentConverter, PdfFormatOption  # type: ignore
from docling.datamodel.pipeline_options import PdfPipelineOptions  # type: ignore
from docling.datamodel.base_models import InputFormat  # type: ignore
from docling.datamodel.document import (  # type: ignore
    TextItem,
    SectionHeaderItem,
    TableItem,
    PictureItem,
    Figure,
)

# ── DOCLING SETUP ─────────────────────────────────────────────────────────────

pipeline_options = PdfPipelineOptions()
pipeline_options.do_ocr = False               # Skip OCR for text-based PDFs (faster)
pipeline_options.images_scale = 2.0           # High-res for Vision AI
pipeline_options.generate_page_images = False
pipeline_options.generate_picture_images = True  # Per-element images only

converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
    }
)

# ── LOADER ────────────────────────────────────────────────────────────────────

async def load_structured_doc(path: str, filename: str) -> list[Document]:
    """
    Unified loader for PDF, DOCX, and PPTX using Docling.

    Produces:
      - One Document per page (text + inline tables) → type: 'content'
      - One Document per embedded image (Vision AI description) → type: 'embedded_image'
    """
    docs: list[Document] = []
    result = converter.convert(path)

    # ── 1. Text & Tables (grouped by page) ───────────────────────────────────
    page_contents: dict[int, list[str]] = {}

    for element, _level in result.document.iterate_items():
        page_num = element.prov[0].page_no if element.prov else 1

        if isinstance(element, (TextItem, SectionHeaderItem)):
            page_contents.setdefault(page_num, []).append(element.text)

        elif isinstance(element, TableItem):
            try:
                table_md = element.export_to_markdown()
                page_contents.setdefault(page_num, []).append(table_md)
            except Exception:
                pass  # Skip malformed tables silently

    for page_num, parts in sorted(page_contents.items()):
        content = "\n\n".join(parts).strip()
        if content:
            docs.append(Document(
                page_content=content,
                metadata={
                    "source": filename,
                    "page": page_num,
                    "type": "content",
                }
            ))

    # ── 2. Embedded Images (Vision AI descriptions) ───────────────────────────
    for element, _level in result.document.iterate_items():
        if isinstance(element, (PictureItem, Figure)):
            try:
                pil_img = getattr(element.image, "pil_image", element.image)
                if pil_img is None:
                    continue

                img_byte_arr = io.BytesIO()
                pil_img.save(img_byte_arr, format="PNG")

                page_num = element.prov[0].page_no if element.prov else 1
                description = await describe_image(img_byte_arr.getvalue(), "image/png")

                if description:
                    docs.append(Document(
                        page_content=f"[Image on page {page_num} of {filename}]:\n{description}",
                        metadata={
                            "source": filename,
                            "page": page_num,
                            "type": "embedded_image",
                        }
                    ))
            except Exception as e:
                print(f"[Doc] Skipping image in {filename} (page {page_num}): {e}")

    print(f"[Doc] '{filename}' → {len(docs)} raw docs (text pages + images)")
    return docs