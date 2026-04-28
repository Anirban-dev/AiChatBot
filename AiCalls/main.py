from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
import os
import asyncio
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

active_streams = {}

# Setup the client to talk to your local model
client = AsyncOpenAI(
    base_url=os.getenv("AI_API"),
    api_key="not-needed"
)

system_prompt = {
    "role": "system",
    "content": (
        "You are ChatAI, a helpful and friendly assistant. "
        "IMPORTANT: Your name is ChatAI - you are ChatAI and you were developed by AP Corporation. "
        "Follow these rules: "
        "- Be concise and to the point "
        "- If you don't know something, say so honestly "
        "- Use markdown formatting when helpful (code blocks, lists, etc.) "
        "- For code questions, always include working examples "
        "- Be conversational but professional"
    )
}

@app.post("/agent/chat")
async def stream_chat(request: Request):
    body = await request.json()
    chat_id = body.get("chat_id")
    user_prompt = body.get("message", "")
    
    # System Prompt
    messages = [system_prompt]
    
    # Previous Messages
    history = body.get("history", [])
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    # 3. User Prompt
    messages.append({"role": "user", "content": user_prompt})

    async def generate():
        try:
            # Call the local AI
            stream = await client.chat.completions.create(
                model=os.getenv("AI_MODEL"),
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    yield content
                    await asyncio.sleep(0)
        finally:
            # CLEANUP: Remove from dict when done or cancelled
            if chat_id in active_streams:
                del active_streams[chat_id]

    return StreamingResponse(generate(), media_type="text/plain")


@app.post("/agent/stop")
async def stop_chat(request: Request):
    body = await request.json()
    chat_id = body.get("chat_id")
    
    task = active_streams.get(chat_id)
    if task:
        task.cancel() # 🔥 The Kill Switch
        return {"message": "Stream stopped"}
    return {"message": "No active stream found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, loop="asyncio")