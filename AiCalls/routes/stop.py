from fastapi import APIRouter, Request # type: ignore
from state import active_streams

router = APIRouter()

@router.post("/agent/stop")
async def stop_chat(request: Request):
    body    = await request.json()
    chat_id = body.get("chat_id")
    task    = active_streams.pop(chat_id, None)
    if task:
        task.cancel()
        return {"message": "Stream stopped"}
    return {"message": "No active stream for this chat"}