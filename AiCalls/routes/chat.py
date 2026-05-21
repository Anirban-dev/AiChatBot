import asyncio
import json
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException # type: ignore
from fastapi.responses import StreamingResponse # type: ignore
from config import client, LLM_MODEL, SYSTEM_PROMPT
from services import vector_store as vs
from state import active_streams
from services.tool_manager import tool_manager
from config import CONCURRENT_STREAMS

router = APIRouter()

# This prevents your VRAM or CPU from choking.
concurrency_limit = asyncio.Semaphore(CONCURRENT_STREAMS)

MAX_ITERATIONS = 5      # guard against infinite agentic loops
MAX_TOOL_RESULT = 4000  # truncate large tool outputs


@router.post("/agent/chat")
async def stream_chat(request: Request, background_tasks: BackgroundTasks):
    
    # ── 1. CONCURRENCY CHECK ────────────────────────────────
    # Check if we have an available "slot" for a new stream
    if concurrency_limit._value <= 0:
        raise HTTPException(
            status_code=503,
            detail="AI Engine is at capacity. Please wait a few seconds."
        )
    await concurrency_limit.acquire()
        
        
    body        = await request.json()
    chat_id     = body.get("chat_id", "")
    user_prompt = body.get("message", "")
    history     = body.get("history", [])

    # ── 1. LAYERED RAG RETRIEVAL ────────────────────────────────
    # Fetch from both Uploaded Docs AND Past Chat History
    context_docs = vs.search(user_prompt, chat_id, k=4) 
    
    # NEW: Your vector store search should now naturally include 
    # archived messages if they are stored in the same upload/namespace.
    context = "\n\n---\n\n".join(d.page_content for d in context_docs)

    system = SYSTEM_PROMPT
    if context:
        system += f"\n\n=== Relevant Context (Docs & Past Conversations) ===\n{context}\n"
    else:
        system += "\n\n=== No previous context found ==="

    # ── 2. BUILD MESSAGE HISTORY ──────────────────────────────
    messages = [{"role": "system", "content": system}]
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_prompt})

    # ── 3. ARCHIVING LOGIC (The "Archive-after-10") ───────────
    # If JS sent 10 messages, the oldest one (history[0]) is sliding out.
    # We send it to the background so the user doesn't wait for the embedding.
    if len(history) >= 10:
        oldest_msg = history[0]
        # We only archive if it's a substantive message
        if len(oldest_msg.get("content", "")) > 10:
            background_tasks.add_task(
                await vs.archive_message, 
                chat_id, 
                oldest_msg["role"], 
                oldest_msg["content"]
            )

    # ── Streaming generator ────────────────────────────────────
    async def generate():
        try:
            active_streams[chat_id] = True
            iteration = 0

            while iteration < MAX_ITERATIONS:
                iteration += 1

                # ── Non-streaming call to check for tool use ──
                response = await client.chat.completions.create(
                    model=LLM_MODEL,
                    messages=messages,
                    tools=tool_manager.get_schemas(),
                    tool_choice="auto",
                )

                message    = response.choices[0].message
                tool_calls = message.tool_calls

                # ── No tool calls → stream the final answer ───
                if not tool_calls:
                    messages.append(message.model_dump(exclude_unset=True))

                    stream = await client.chat.completions.create(
                        model=LLM_MODEL,
                        messages=messages,
                        stream=True,
                    )

                    async for chunk in stream:
                        # Honour cancellation request
                        if not active_streams.get(chat_id):
                            break

                        content = chunk.choices[0].delta.content
                        if content:
                            yield content
                            await asyncio.sleep(0)  # keep event loop responsive

                    break  # done — exit the while loop

                # ── Tool calls detected ───────────────────────
                # FIX: convert Pydantic object → plain dict before appending
                messages.append(message.model_dump(exclude_unset=True))

                # Notify the client which tools are being called
                tool_names = [tc.function.name for tc in tool_calls]
                yield f"\n\n[Action: Calling tool(s): {', '.join(tool_names)}...]\n\n"

                # FIX: run all tool calls in parallel with asyncio.gather
                async def _run(tc):
                    # FIX: arguments is a JSON string — must parse it
                    args = json.loads(tc.function.arguments)
                    try:
                        result = await tool_manager.execute(tc.function.name, args)
                        return str(result)[:MAX_TOOL_RESULT]
                    except Exception as exc:
                        return f"Tool error: {exc}"

                results = await asyncio.gather(*[_run(tc) for tc in tool_calls])

                # Append each tool result as a "tool" role message
                for tc, result in zip(tool_calls, results):
                    messages.append({
                        "role":         "tool",
                        "tool_call_id": tc.id,
                        "name":         tc.function.name,
                        "content":      result,
                    })

            else:
                # while loop exhausted without a break → hit iteration limit
                yield "\n\n[Agent hit the maximum iteration limit without a final answer.]"

        except Exception as e:
            yield f"\n\n[Error: {e}]"

        finally:
            active_streams.pop(chat_id, None)
            concurrency_limit.release()

    return StreamingResponse(generate(), media_type="text/plain")


@router.post("/agent/stop")
async def stop_chat(request: Request):
    body    = await request.json()
    chat_id = body.get("chat_id")
    existed = active_streams.pop(chat_id, None)
    if existed:
        return {"message": "Stream stopped"}
    return {"message": "No active stream for this chat"}