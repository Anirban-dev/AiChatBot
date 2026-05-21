import asyncio
import json
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from config import client, LLM_MODEL, SYSTEM_PROMPT
from services import vector_store as vs
from state import active_streams
from services import tool_manager
from config import CONCURRENT_STREAMS

router = APIRouter()

concurrency_limit = asyncio.Semaphore(CONCURRENT_STREAMS)

MAX_ITERATIONS = 5
MAX_TOOL_RESULT = 4000


def build_thinking_kwargs(enable_thinking: bool) -> dict:
    """Return extra kwargs to pass to the API when thinking is enabled."""
    if not enable_thinking:
        return {}
    return {
        "thinking": {
            "type": "enabled",
            "budget_tokens": 8000,   # adjust to taste
        }
    }


def strip_thinking_blocks(message_dict: dict) -> dict:
    """
    Remove 'thinking' content blocks from an assistant message dict
    before appending it to history.  Leaving them in causes the
    'prefill incompatible with enable_thinking' 400 error on subsequent calls.
    """
    content = message_dict.get("content")
    if not isinstance(content, list):
        return message_dict

    cleaned = [
        block for block in content
        if not (isinstance(block, dict) and block.get("type") == "thinking")
    ]
    return {**message_dict, "content": cleaned}


@router.post("/agent/chat")
async def stream_chat(request: Request, background_tasks: BackgroundTasks):

    # ── 1. CONCURRENCY CHECK ─────────────────────────────────
    if concurrency_limit._value <= 0:
        raise HTTPException(
            status_code=503,
            detail="AI Engine is at capacity. Please wait a few seconds."
        )
    await concurrency_limit.acquire()

    body            = await request.json()
    chat_id         = body.get("chat_id", "")
    user_prompt     = body.get("message", "")
    history         = body.get("history", [])
    enable_thinking = body.get("enable_thinking", False)   # ← consumed below

    # ── 2. LAYERED RAG RETRIEVAL ──────────────────────────────
    context_docs = vs.search(user_prompt, chat_id, k=4)
    context = "\n\n---\n\n".join(d.page_content for d in context_docs)

    system = SYSTEM_PROMPT
    if context:
        system += f"\n\n=== Relevant Context (Docs & Past Conversations) ===\n{context}\n"
    else:
        system += "\n\n=== No previous context found ==="

    # ── 3. BUILD MESSAGE HISTORY ──────────────────────────────
    messages = [{"role": "system", "content": system}]
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_prompt})

    # ── 4. ARCHIVE OLDEST MESSAGE ─────────────────────────────
    if len(history) >= 10:
        oldest_msg = history[0]
        if len(oldest_msg.get("content", "")) > 10:
            background_tasks.add_task(
                vs.archive_message,
                chat_id,
                oldest_msg["role"],
                oldest_msg["content"]
            )

    thinking_kwargs = build_thinking_kwargs(enable_thinking)

    # ── Streaming generator ───────────────────────────────────
    async def generate():
        try:
            active_streams[chat_id] = True
            iteration = 0

            while iteration < MAX_ITERATIONS:
                iteration += 1

                # Non-streaming call — only purpose is to detect tool calls
                response = await client.chat.completions.create(
                    model=LLM_MODEL,
                    messages=messages,
                    tools=tool_manager.get_schemas(),
                    tool_choice="auto",
                    **thinking_kwargs,
                )

                message    = response.choices[0].message
                tool_calls = message.tool_calls

                # ── No tool calls → stream a FRESH call, don't append first response
                if not tool_calls:
                    # DO NOT append message here — that causes the prefill error
                    stream = await client.chat.completions.create(
                        model=LLM_MODEL,
                        messages=messages,   # ends with "user" — safe
                        stream=True,
                        **thinking_kwargs,
                    )

                    async for chunk in stream:
                        if not active_streams.get(chat_id):
                            break
                        content = chunk.choices[0].delta.content
                        if content is not None:
                            yield content
                            await asyncio.sleep(0)

                    break  # done

                # ── Tool calls detected — append (stripped) assistant message
                messages.append(
                    strip_thinking_blocks(message.model_dump(exclude_unset=True))
                )

                tool_names = [tc.function.name for tc in tool_calls]
                yield f"\n\n[Action: Calling tool(s): {', '.join(tool_names)}...]\n\n"

                async def _run(tc):
                    args = json.loads(tc.function.arguments)
                    try:
                        result = await tool_manager.execute(tc.function.name, args)
                        return str(result)[:MAX_TOOL_RESULT]
                    except Exception as exc:
                        return f"Tool error: {exc}"

                results = await asyncio.gather(*[_run(tc) for tc in tool_calls])

                for tc, result in zip(tool_calls, results):
                    messages.append({
                        "role":         "tool",
                        "tool_call_id": tc.id,
                        "name":         tc.function.name,
                        "content":      result,
                    })

            else:
                yield "\n\n[Agent hit the maximum iteration limit without a final answer.]"

        except Exception as e:
            yield f"\n\n[Error: {e}]"

        finally:
            active_streams.pop(chat_id, None)
            concurrency_limit.release()
    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/agent/stop")
async def stop_chat(request: Request):
    body    = await request.json()
    chat_id = body.get("chat_id")
    existed = active_streams.pop(chat_id, None)
    if existed:
        return {"message": "Stream stopped"}
    return {"message": "No active stream for this chat"}