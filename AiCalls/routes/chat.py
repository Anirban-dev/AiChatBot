import asyncio
from fastapi import APIRouter, Request # type: ignore
from fastapi.responses import StreamingResponse # type: ignore
from config import client, LLM_MODEL, SYSTEM_PROMPT
from services import vector_store as vs
from state import active_streams

router = APIRouter()

@router.post("/agent/chat")
async def stream_chat(request: Request):
    body        = await request.json()
    chat_id     = body.get("chat_id", "")
    user_prompt = body.get("message", "")

    # RAG retrieval
    context_docs = vs.search(user_prompt, chat_id, k=4)
    context      = "\n\n---\n\n".join(d.page_content for d in context_docs)

    system = SYSTEM_PROMPT
    if context:
        system += (
            f"\n\n=== Context from user's uploaded documents ===\n"
            f"{context}\n"
            f"=== End of context — answer using the above ===\n"
        )
    else:
        system += "\n\n=== No documents uploaded yet ==="
        
    messages = [{"role": "system", "content": system}]
    for msg in body.get("history", []):
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_prompt})

    async def generate():
        try:
            stream = await client.chat.completions.create(
                model=LLM_MODEL,
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    yield content
                    await asyncio.sleep(0)
        except Exception as e:
            print(f"[Chat] Stream error: {e}")
            yield f"\n\n[Stream error: {e}]"
        finally:
            active_streams.pop(chat_id, None)

    return StreamingResponse(generate(), media_type="text/plain")