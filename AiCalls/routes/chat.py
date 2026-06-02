import asyncio
import json
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from litellm.exceptions import RateLimitError
from config import LLM_SMALL_MODEL, client, LLM_HIGH_MODEL, SYSTEM_PROMPT, CONCURRENT_STREAMS
from services import vector_store as vs
from services import session_state as ss
from state import active_streams
from services import tool_manager

router = APIRouter()

concurrency_limit = asyncio.Semaphore(CONCURRENT_STREAMS)

MAX_ITERATIONS  = 5
MAX_TOOL_RESULT = 4000
_WINDOW_SIZE = 10


def build_thinking_kwargs(mode: str, enable_thinking: bool) -> dict:
    # Strict gate: Native thinking configurations are ONLY valid for the thinking tier
    if mode != "thinking" or not enable_thinking:
        return {}
    return {"thinking": {"type": "enabled", "budget_tokens": 8000}}


def strip_thinking_blocks(message_dict: dict) -> dict:
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
    enable_thinking = body.get("enable_thinking", False)
    mode            = body.get("mode", "small")  # small, high, thinking
    user_tier       = body.get("user_tier", "free")
    user_id         = body.get("user_id", "unknown_user")

    # ── 2. LAYERED RAG RETRIEVAL  ────────────────────────────
    context_docs = vs.search(user_prompt, chat_id, k=4)
    context = "\n\n---\n\n".join(d.page_content for d in context_docs)

    # ── 3. BUILD SYSTEM PROMPT ────────────────────────────────
    system = SYSTEM_PROMPT

    # 3a. Inject structured session state
    state_block = ss.get_state_block(chat_id)
    if state_block:
        system += state_block
    
    # 3b. Inject document context if any
    if context:
        system += f"\n\n=== Relevant Document Context ===\n{context}\n"

    # 3c. Inject Behavior Directives contextually
    if mode == "thinking":
        system += (
            "\n\n━━━ MODE DIRECTIVE: NATIVE REASONING ━━━\n"
            "- You are running in a deep-thinking environment with extended computational overhead.\n"
            "- Use your native thinking capabilities to break down logic comprehensively step-by-step before synthesis.\n"
        )
    elif mode == "small":
        system += (
            "\n\n━━━ MODE DIRECTIVE: STANDARD CHAT ━━━\n"
            "- Provide direct, clear, conversational small-talk feedback.\n"
        )

    # ── 4. BUILD MESSAGE HISTORY ──────────────────────────────
    messages = [{"role": "system", "content": system}]
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_prompt})

    # ── 5. SLIDING WINDOW → STATE UPDATE ─────────────────────
    if len(history) >= _WINDOW_SIZE and len(history) % _WINDOW_SIZE == 0:
        sliding_out = history[:_WINDOW_SIZE]
        background_tasks.add_task(ss.schedule_update, chat_id, sliding_out)

    # Evaluates safe assignment of the native reasoning token window schema
    thinking_kwargs = build_thinking_kwargs(mode, enable_thinking)

    # ── Streaming generator ───────────────────────────────────
    async def generate():
        try:
            active_streams[chat_id] = True

            # ── small MODE: EXCLUSIVE CHAT (No Tools, No Thinking Parameters) ──
            if mode == "small":
                stream = await client.chat.completions.create(
                    model=LLM_SMALL_MODEL,
                    messages=messages,
                    stream=True,
                    client_id=user_id,
                    user_tier=user_tier,
                    # Explicitly omit tool and thinking tokens configurations to prevent execution errors
                )
                try:
                    async for chunk in stream:
                        if not active_streams.get(chat_id):
                            break
                        content = chunk.choices[0].delta.content
                        if content is not None:
                            yield f"data: {json.dumps({'token': content})}\n\n"
                            await asyncio.sleep(0)
                except RateLimitError:
                    quota_payload = {
                        "type": "QUOTA_EXHAUSTED",
                        "message": "Your user token/request tier limits for this minute have been exhausted mid-stream."
                    }
                    yield f"event: error\ndata: {json.dumps(quota_payload)}\n\n"
                return

            # ── ALL OTHER EXPERT MODES: REASONING & TOOL CALL LOOPS ──
            # Map target model routing variants cleanly
            target_model = LLM_HIGH_MODEL
            if mode == "thinking":
                from config import LLM_THINKING_MODEL
                target_model = LLM_THINKING_MODEL

            iteration = 0
            while iteration < MAX_ITERATIONS:
                iteration += 1

                # Static check pass to evaluate tool routing
                response = await client.chat.completions.create(
                    model=target_model,
                    messages=messages,
                    tools=tool_manager.get_schemas(),
                    tool_choice="auto",
                    client_id=user_id,
                    user_tier=user_tier,
                    **thinking_kwargs,
                )

                message    = response.choices[0].message
                tool_calls = message.tool_calls

                if not tool_calls:
                    # Final synthesis token streaming loop
                    stream = await client.chat.completions.create(
                        model=target_model,
                        messages=messages,
                        stream=True,
                        client_id=user_id,
                        user_tier=user_tier,
                        **thinking_kwargs,
                    )

                    try:
                        async for chunk in stream:
                            if not active_streams.get(chat_id):
                                break
                            content = chunk.choices[0].delta.content
                            if content is not None:
                                yield f"data: {json.dumps({'token': content})}\n\n"
                                await asyncio.sleep(0)
                    except RateLimitError:
                        quota_payload = {
                            "type": "QUOTA_EXHAUSTED",
                            "message": "Your user token/request tier limits for this minute have been exhausted mid-stream."
                        }
                        yield f"event: error\ndata: {json.dumps(quota_payload)}\n\n"
                    break

                # Append running message context to execution context window state
                messages.append(
                    strip_thinking_blocks(message.model_dump(exclude_unset=True))
                )

                # Push tool orchestration event metadata up to Express
                for tc in tool_calls:
                    payload = {"tool_call": {"name": tc.function.name, "id": tc.id}, "status": "running"}
                    yield f"data: {json.dumps(payload)}\n\n"

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
                err_payload = {"message": "Agent hit the maximum iteration limit without a final answer."}
                yield f"event: error\ndata: {json.dumps(err_payload)}\n\n"

        except RateLimitError:
            quota_payload = {
                "type": "QUOTA_EXHAUSTED",
                "message": "Your structural user token/request tier limits for this minute have been exhausted. Please wait a moment before trying again."
            }
            yield f"event: error\ndata: {json.dumps(quota_payload)}\n\n"

        except Exception as e:
            err_payload = {"message": f"AI Generation pipeline execution error: {str(e)}"}
            yield f"event: error\ndata: {json.dumps(err_payload)}\n\n"

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