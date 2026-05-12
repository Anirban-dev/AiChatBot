import base64
from config import client, LLM_VISION_MODEL
from PIL import Image
import io

async def describe_image(image_bytes: bytes, media_type: str = "image/png") -> str:
    """
    Directly uses the Vision-Language Model API to analyze images.
    Removes the need for local OCR libraries like EasyOCR.
    """

    # --- cOMPRESS THE IMAGE ---
    try:
        img = Image.open(io.BytesIO(image_bytes))
        # Convert to RGB if it's RGBA (transparency can sometimes cause issues)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        
        # Resize if the image is larger than 1024px on any side
        if max(img.size) > 1024:
            img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            
        # Re-encode to a smaller buffer
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85) # JPEG is much lighter than PNG
        image_bytes = buffer.getvalue()
        media_type = "image/jpeg"
    except Exception as e:
        print(f"[Vision] Pre-processing failed: {e}")
    # -----------------------


    # 1. Prepare Image Data
    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    
    # 2. Call Vision LLM API
    try:
        response = await client.chat.completions.create(
            model=LLM_VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Analyze this image and provide a structured response:\n"
                            "1. Detailed Description: What is happening in the image?\n"
                            "2. Full Transcription: Extract all visible text exactly.\n"
                            "3. Data Analysis: Describe any charts, tables, or diagrams found."
                        )
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{b64_image}",
                            "detail": "low"  # High detail ensures better OCR accuracy
                        }
                    },
                ]
            }],
            max_tokens=1500,
            temperature=0.2 # Lower temperature for more accurate text extraction
        )

        result = response.choices[0].message.content or ""\
        
        if result:
            print(f"[Vision] API analyzed image ({len(result)} chars)")
            return result
        
        return "Image processed but no content returned."

    except Exception as e:
        print(f"[Vision] API Error: {e}")
        return f"Error analyzing image: {str(e)}"