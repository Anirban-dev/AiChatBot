import asyncio
import json
import logging
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from litellm.exceptions import RateLimitError
from config import LLM_SMALL_MODEL, client, LLM_HIGH_MODEL, SYSTEM_PROMPT, CONCURRENT_STREAMS
from services import vector_store as vs
from services import session_state as ss
from state import active_streams, StreamState
from services import tool_manager

router = APIRouter()

concurrency_limit = asyncio.Semaphore(CONCURRENT_STREAMS)
_active_stream_count = 0

MAX_ITERATIONS  = 5
MAX_TOOL_RESULT = 4000
_WINDOW_SIZE = 10


def build_thinking_kwargs(mode: str, enable_thinking: bool) -> dict:
    if mode != "thinking" or not enable_thinking:
        return {}
    return {"thinking": {"type": "enabled", "budget_tokens": 8000}}


@router.post("/agent/chat")
async def stream_chat(request: Request, background_tasks: BackgroundTasks):
    global _active_stream_count
    
    # ── 1. PRE-CHECK CAPACITY SAFELY ─────────────────────────
    if _active_stream_count >= CONCURRENT_STREAMS or concurrency_limit.locked():
        logging.warning("AI Engine is at capacity.")
        raise HTTPException(
            status_code=503,
            detail="AI Engine is at capacity. Please wait a few seconds."
        )

    # ── 2. ACQUIRE THREAD SLOT VIA TIMEOUT TO PREVENT LOCKS ──
    try:
        await asyncio.wait_for(concurrency_limit.acquire(), timeout=2.0)
        _active_stream_count += 1
    except asyncio.TimeoutError:
        logging.warning("AI Engine is at capacity.")
        raise HTTPException(
            status_code=503,
            detail="AI Engine is at capacity. Please wait a few seconds."
        )

    slot_acquired = True
    try:
        body            = await request.json()
        chat_id         = body.get("chat_id", "")
        user_prompt     = body.get("message", "")
        history         = body.get("history", [])
        enable_thinking = body.get("enable_thinking", False)
        mode            = body.get("mode", "small")

        # ── 3. LAYERED RAG RETRIEVAL ─────────────────────────────
        context_docs = await vs.search(user_prompt, chat_id, k=4)
        context = "\n\n---\n\n".join(d.page_content for d in context_docs)

        # ── 4. BUILD SYSTEM PROMPT ────────────────────────────────
        system = SYSTEM_PROMPT

        state_block = ss.get_state_block(chat_id)
        if state_block:
            system += state_block

        if context:
            system += f"\n\n=== Relevant Document Context ===\n{context}\n"

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

        # ── 5. BUILD INITIAL MESSAGE HISTORY ──────────────────────
        messages = [{"role": "system", "content": system}]
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_prompt})

        # ── 6. SLIDING WINDOW → STATE UPDATE ─────────────────────
        if len(history) >= _WINDOW_SIZE and len(history) % _WINDOW_SIZE == 0:
            sliding_out = history[:_WINDOW_SIZE]
            background_tasks.add_task(ss.schedule_update, chat_id, sliding_out)

        thinking_kwargs = build_thinking_kwargs(mode, enable_thinking)
    except Exception as e:
        if slot_acquired:
            concurrency_limit.release()
            _active_stream_count = max(0, _active_stream_count - 1)
        raise HTTPException(status_code=500, detail=str(e))

    # ── Streaming generator ───────────────────────────────────
    async def generate():
        global _active_stream_count
        try:
            state = StreamState()
            active_streams[chat_id] = state

            # ── SMALL MODE: EXCLUSIVE CHAT (No Tools, No Thinking) ──────────
            if mode == "small":
                stream = await client.chat.completions.create(
                    model=LLM_SMALL_MODEL,
                    messages=messages,
                    stream=True,
                )
                state.raw_stream = getattr(stream, '_raw_stream', stream)
                try:
                    async for chunk in stream:
                        if not active_streams.get(chat_id, StreamState()).active:
                            break
                        delta = chunk.choices[0].delta if chunk.choices else None
                        val = getattr(delta, "content", None) or getattr(delta, "reasoning_content", None)
                        if val is not None:
                            yield f"data: {json.dumps({'token': val})}\n\n"
                            await asyncio.sleep(0)
                except RateLimitError:
                    quota_payload = {
                        "type": "QUOTA_EXHAUSTED",
                        "message": "The AI provider rate limit was hit mid-stream. Please wait a moment before trying again."
                    }
                    yield f"event: error\ndata: {json.dumps(quota_payload)}\n\n"
                return

            # ── ALL OTHER EXPERT MODES: REASONING & TOOL CALL LOOPS ─────────
            target_model = LLM_HIGH_MODEL
            if mode == "thinking":
                from config import LLM_THINKING_MODEL
                target_model = LLM_THINKING_MODEL

            for iteration in range(MAX_ITERATIONS):
                st = active_streams.get(chat_id)
                if st is None or not st.active:
                    return

                completion_coro = client.chat.completions.create(
                    model=target_model, messages=messages,
                    tools=tool_manager.get_schemas(), tool_choice="auto",
                    stream=True,
                    max_retries=0, **thinking_kwargs,
                )
                completion_task = asyncio.create_task(completion_coro)
                st.completion_task = completion_task
                try:
                    stream = await completion_task
                except asyncio.CancelledError:
                    return 
                st.raw_stream = getattr(stream, '_raw_stream', stream)
                raw = st.raw_stream
                if not st.active:
                    if hasattr(raw, 'aclose'):
                        await raw.aclose()
                    return
                tool_calls_buffer: dict = {}
                text_content_buffer: list = []
                is_tool_call = False

                async for chunk in stream:
                    if not active_streams.get(chat_id, StreamState()).active:
                        raw = getattr(stream, '_raw_stream', None)
                        if raw and hasattr(raw, 'aclose'):
                            await raw.aclose()
                        return

                    if not chunk.choices:
                        continue
                        
                    delta = chunk.choices[0].delta

                    # A. Tool call delta chunks
                    if getattr(delta, "tool_calls", None) is not None:
                        is_tool_call = True
                        for tc in delta.tool_calls:
                            idx = tc.index
                            if idx not in tool_calls_buffer:
                                tool_calls_buffer[idx] = {
                                    "id": tc.id or "",
                                    "type": "function",
                                    "function": {"name": tc.function.name or "", "arguments": ""}
                                }
                            if tc.id:
                                tool_calls_buffer[idx]["id"] = tc.id
                            if tc.function and tc.function.name:
                                tool_calls_buffer[idx]["function"]["name"] = tc.function.name
                                yield f"data: {json.dumps({'tool_call': {'name': tc.function.name, 'id': tool_calls_buffer[idx]['id']}, 'status': 'running'})}\n\n"
                            if tc.function and tc.function.arguments:
                                tool_calls_buffer[idx]["function"]["arguments"] += tc.function.arguments

                    # B. Regular text content or reasoning content
                    elif getattr(delta, "content", None) is not None or getattr(delta, "reasoning_content", None) is not None:
                        val = getattr(delta, "content", None) or getattr(delta, "reasoning_content", None)
                        text_content_buffer.append(val)
                        yield f"data: {json.dumps({'token': val})}\n\n"
                        await asyncio.sleep(0)

                # If no tools were called during this pass, we are done!
                if not is_tool_call:
                    break

                # ── Process Tool Actions ──
                tool_calls = list(tool_calls_buffer.values())
                
                # Append assistant tool-choice payload to message stack
                messages.append({
                    "role": "assistant",
                    "tool_calls": tool_calls,
                    "content": "".join(text_content_buffer) if text_content_buffer else None,
                })

                async def _run(tc):
                    func_name = tc["function"]["name"]
                    try:
                        args = json.loads(tc["function"]["arguments"])
                        result = await tool_manager.execute(func_name, args)
                        return {"status": "completed", "result": str(result)}
                    except json.JSONDecodeError as je:
                        return {"status": "failed", "error": f"Bad arguments JSON: {je}"}
                    except Exception as exc:
                        return {"status": "failed", "error": str(exc)}

                tool_tasks = [asyncio.create_task(_run(tc)) for tc in tool_calls]
                if st:
                    st.tool_tasks = tool_tasks
                try:
                    results = await asyncio.gather(*tool_tasks)
                except asyncio.CancelledError:
                    return 

                for tc, res in zip(tool_calls, results):
                    func_name = tc["function"]["name"]
                    tc_id     = tc["id"]
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
                # Loop moves to next pass allowing model to synthesize tool outputs into text!

        except RateLimitError:
            quota_payload = {
                "type": "QUOTA_EXHAUSTED",
                "message": "The AI provider rate limit was hit. Please wait a moment before trying again."
            }
            yield f"event: error\ndata: {json.dumps(quota_payload)}\n\n"

        except Exception as e:
            err_payload = {"message": f"AI Generation pipeline execution error: {str(e)}"}
            yield f"event: error\ndata: {json.dumps(err_payload)}\n\n"

        finally:
            st = active_streams.get(chat_id)
            if st and st.raw_stream and hasattr(st.raw_stream, 'aclose'):
                try:
                    await st.raw_stream.aclose()
                except Exception:
                    pass
            active_streams.pop(chat_id, None)
            concurrency_limit.release()
            _active_stream_count = max(0, _active_stream_count - 1)

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/agent/stop")
async def stop_chat(request: Request):
    body    = await request.json()
    chat_id = body.get("chat_id")
    state   = active_streams.get(chat_id)
    if not state:
        return {"message": "No active stream for this chat"}
    state.active = False
    
    if state.completion_task and not state.completion_task.done():
        state.completion_task.cancel()
    for task in state.tool_tasks:
        if not task.done():
            task.cancel()
    if state.raw_stream and hasattr(state.raw_stream, 'aclose'):
        try:
            await state.raw_stream.aclose()
        except Exception:
            pass
        
    active_streams.pop(chat_id, None)
    return {"message": "Stream stopped"}