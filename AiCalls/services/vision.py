import base64
import tempfile
import os
import time  # Added for minor delay if needed
from config import client, LLM_MODEL

# EasyOCR reader — loaded once, reused
_ocr_reader = None

def get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr # type: ignore
        print("[Vision] Loading EasyOCR (fallback)...")
        # FIX: verbose=False prevents the progress bar encoding error
        _ocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False) 
        print("[Vision] EasyOCR ready")
    return _ocr_reader

async def describe_image(image_bytes: bytes, media_type: str = "image/png") -> str:
    # ── Attempt 1: vision LLM ────────────────────────────────────────────────
    b64 = base64.b64encode(image_bytes).decode()
    try:
        response = await client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{media_type};base64,{b64}"}
                    },
                    {
                        "type": "text",
                        "text": (
                            "1. Describe this image in full detail.\n"
                            "2. Transcribe ALL visible text exactly as it appears.\n"
                            "3. Describe any charts, diagrams, or tables."
                        )
                    }
                ]
            }],
            max_tokens=1000
        )
        result = response.choices[0].message.content or ""
        if result:
            print(f"[Vision] LLM described image ({len(result)} chars)")
            return result
    except Exception as e:
        print(f"[Vision] LLM vision failed ({e}), falling back to OCR...")

    # ── Attempt 2: EasyOCR fallback ───────────────────────────────────────────
    try:
        reader = get_ocr_reader()

        # write bytes to a temp file
        ext = media_type.split("/")[-1]
        suffix = f".{ext}"
        
        # Using a context manager for the temp file is safer
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            # detail=0 returns just the text strings
            results = reader.readtext(tmp_path, detail=0)
        finally:
            # Ensure the file is deleted even if readtext fails
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        if results:
            text = "\n".join(results)
            print(f"[Vision] OCR extracted {len(results)} text blocks")
            return f"[OCR extracted text]:\n{text}"
        
        print("[Vision] OCR found no text in image")
        return ""

    except Exception as e:
        # This will now catch other errors without crashing on encoding
        print(f"[Vision] OCR fallback failed: {e}")
        return ""