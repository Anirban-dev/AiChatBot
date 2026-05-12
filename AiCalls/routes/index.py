import os
import tempfile
from fastapi import Request # type: ignore
from fastapi import APIRouter, UploadFile, File, Form, HTTPException # type: ignore
from services.loaders import load_and_chunk, SUPPORTED
from services import vector_store as vs

router = APIRouter()

@router.post("/agent/index")
async def index_document(
    file: UploadFile = File(...),
    chat_id: str     = Form("")
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED:
        raise HTTPException(
            status_code=400,
            detail=f"'{ext}' is not supported. Allowed: {', '.join(sorted(SUPPORTED))}"
        )

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    temp_path = tmp.name

    try:
        contents = await file.read()
        tmp.write(contents)
        tmp.close()
        print(f"[Index] Received '{file.filename}' ({len(contents):,} bytes)")

        chunks = await load_and_chunk(temp_path, file.filename)

        if not chunks:
            raise HTTPException(
                status_code=422,
                detail="No content could be extracted from this file"
            )

        vs.add_documents(chunks, chat_id)
        return {"message": f"'{file.filename}' indexed successfully", "chunks": len(chunks)}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Index] Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            print(f"{temp_path} is being removed")
            os.remove(temp_path)

@router.post("/agent/delete")
async def delete_document(request: Request):
    body     = await request.json()
    filename = body.get("filename", "")
    chat_id  = body.get("chat_id", "")
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    
    vs.delete_by_source(filename, chat_id)
    return {"message": f"'{filename}' removed from vector store"}