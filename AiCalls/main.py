from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Setup the client to talk to your local model
client = AsyncOpenAI(
    base_url=os.getenv("AI_BASE_URL"),
    api_key="not-needed"
)

@app.post("/agent/chat")
async def stream_chat(request: Request):
    body = await request.json()
    user_prompt = body.get("message", "")
    
    # System Prompt
    messages = [
        {
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
    ]
    
    # Previous Messages
    history = body.get("history", [])
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    # 3. User Prompt
    messages.append({"role": "user", "content": user_prompt})

    async def generate():
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

    return StreamingResponse(generate(), media_type="text/plain")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)