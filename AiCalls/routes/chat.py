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
            target_model = LLM_HIGH_MODEL
            if mode == "thinking":
                from config import LLM_THINKING_MODEL
                target_model = LLM_THINKING_MODEL

            iteration = 0
            while iteration < MAX_ITERATIONS:
                iteration += 1

                # 🌟 Stream EVERYTHING. One single call per iteration loop turn.
                stream = await client.chat.completions.create(
                    model=target_model,
                    messages=messages,
                    tools=tool_manager.get_schemas(),
                    tool_choice="auto",
                    stream=True,
                    client_id=user_id,
                    user_tier=user_tier,
                    max_retries=0,  # 🌟 explicitly silence max_retries warning frames
                    **thinking_kwargs,
                )

                tool_calls_buffer = {}
                text_content_buffer = []
                is_tool_call = False

                async for chunk in stream:
                    if not active_streams.get(chat_id):
                        break
                    
                    delta = chunk.choices[0].delta
                    
                    # A. Handle Streaming Tool Interactions
                    if delta.tool_calls:
                        is_tool_call = True
                        for tc in delta.tool_calls:
                            idx = tc.index
                            if idx not in tool_calls_buffer:
                                tool_calls_buffer[idx] = {
                                    "id": tc.id,
                                    "type": "function",
                                    "function": {"name": "", "arguments": ""}
                                }
                            
                            if tc.id:
                                tool_calls_buffer[idx]["id"] = tc.id
                            if tc.function.name:
                                tool_calls_buffer[idx]["function"]["name"] = tc.function.name
                                # Stream status up to Express instantly so connection stays hot!
                                yield f"data: {json.dumps({'tool_call': {'name': tc.function.name, 'id': tool_calls_buffer[idx]['id']}, 'status': 'running'})}\n\n"
                            if tc.function.arguments:
                                tool_calls_buffer[idx]["function"]["arguments"] += tc.function.arguments

                    # B. Handle Standard Content Streaming
                    elif delta.content is not None:
                        text_content_buffer.append(delta.content)
                        yield f"data: {json.dumps({'token': delta.content})}\n\n"
                        await asyncio.sleep(0)

                # Differentiate based on what the stream delivered
                if not is_tool_call:
                    # Model provided a text response and no tools. We are done!
                    break

                # Reconstruct tool_calls array from collected delta chunks
                tool_calls = list(tool_calls_buffer.values())

                # Append assistant tool intent back into tracking history
                messages.append({
                    "role": "assistant",
                    "tool_calls": tool_calls,
                    "content": "".join(text_content_buffer) if text_content_buffer else None
                })

                # Orchestrate execution block parallel threads
                async def _run(tc):
                    func_name = tc["function"]["name"]
                    try:
                        args = json.loads(tc["function"]["arguments"])
                        result = await tool_manager.execute(func_name, args)
                        return {"status": "completed", "result": str(result)}
                    except Exception as exc:
                        return {"status": "failed", "error": str(exc)}

                results = await asyncio.gather(*[_run(tc) for tc in tool_calls])

                # Append execution tracking updates back into active history frames and yield events
                for tc, res in zip(tool_calls, results):
                    func_name = tc["function"]["name"]
                    tc_id = tc["id"]
                    if res["status"] == "completed":
                        result_content = res["result"][:MAX_TOOL_RESULT]
                        yield f"data: {json.dumps({'tool_call': {'name': func_name, 'id': tc_id}, 'status': 'completed', 'result': result_content[:200]})}\n\n"
                    else:
                        result_content = f"Tool error: {res['error']}"
                        yield f"data: {json.dumps({'tool_call': {'name': func_name, 'id': tc_id}, 'status': 'failed', 'error': res['error']})}\n\n"

                    messages.append({
                        "role":         "tool",
                        "tool_call_id": tc_id,
                        "name":         func_name,
                        "content":      result_content,
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