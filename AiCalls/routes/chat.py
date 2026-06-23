import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from litellm.exceptions import RateLimitError

from config import LLM_SMALL_MODEL, client, LLM_HIGH_MODEL, SYSTEM_PROMPT, CONCURRENT_STREAMS
from services import vector_store as vs
from services import session_state as ss
from state import active_streams, StreamState
from services import tool_manager
from lib.mongodb import chat_logs

router = APIRouter()

_log     = logging.getLogger("chat")
_IST     = ZoneInfo("Asia/Kolkata")

concurrency_limit   = asyncio.Semaphore(CONCURRENT_STREAMS)
_active_stream_count = 0

MAX_ITERATIONS  = 5
MAX_TOOL_RESULT = 4000
_WINDOW_SIZE    = 10

# Per-chunk silence timeout: if no chunk arrives within this many seconds, abort.
_CHUNK_SILENCE_TIMEOUT = 45.0
# Absolute cap on total stream duration in seconds.
_TOTAL_STREAM_TIMEOUT = 120.0


def build_thinking_kwargs(mode: str, enable_thinking: bool) -> dict:
    if mode != "thinking" or not enable_thinking:
        return {}
    return {"thinking": {"type": "enabled", "budget_tokens": 8000}}


async def _write_chat_log(doc: dict):
    """Fire-and-forget lifecycle log for a chat request."""
    try:
        doc["timestamp"] = datetime.now(_IST)
        await chat_logs.insert_one(doc)
    except Exception as exc:
        _log.error(f"[ChatLog] MongoDB write error: {exc}")


@router.post("/agent/chat")
async def stream_chat(request: Request, background_tasks: BackgroundTasks):
    global _active_stream_count

    # ── Extract user context from headers (forwarded by Node.js) ──────────────
    user_id = request.headers.get("X-User-Id", "unknown")
    chat_id_hdr = request.headers.get("X-Chat-Id", "")

    # ── 1. PRE-CHECK CAPACITY SAFELY ──────────────────────────────────────────
    if _active_stream_count >= CONCURRENT_STREAMS or concurrency_limit.locked():
        _log.warning(f"[Capacity] At capacity. user={user_id}")
        raise HTTPException(status_code=503, detail="AI Engine is at capacity. Please wait a few seconds.")

    # ── 2. ACQUIRE THREAD SLOT VIA TIMEOUT ────────────────────────────────────
    try:
        await asyncio.wait_for(concurrency_limit.acquire(), timeout=2.0)
        _active_stream_count += 1
    except asyncio.TimeoutError:
        _log.warning(f"[Capacity] Semaphore timeout. user={user_id}")
        raise HTTPException(status_code=503, detail="AI Engine is at capacity. Please wait a few seconds.")

    slot_acquired = True
    req_start = time.monotonic()

    try:
        body            = await request.json()
        chat_id         = body.get("chat_id", chat_id_hdr or "unknown")
        user_prompt     = body.get("message", "")
        history         = body.get("history", [])
        enable_thinking = body.get("enable_thinking", False)
        mode            = body.get("mode", "small")

        _log.info(
            f"[Request] chat={chat_id} user={user_id} mode={mode} "
            f"history_len={len(history)} prompt_len={len(user_prompt)}"
        )

        # ── 3. LAYERED RAG RETRIEVAL ───────────────────────────────────────────
        context_docs = await vs.search(user_prompt, chat_id, k=4)
        context = "\n\n---\n\n".join(d.page_content for d in context_docs)
        if context_docs:
            _log.debug(f"[RAG] Retrieved {len(context_docs)} docs for chat={chat_id}")

        # ── 4. BUILD SYSTEM PROMPT ─────────────────────────────────────────────
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

        # ── 5. BUILD INITIAL MESSAGE HISTORY ──────────────────────────────────
        messages = [{"role": "system", "content": system}]
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_prompt})

        # ── 6. SLIDING WINDOW → STATE UPDATE ──────────────────────────────────
        if len(history) >= _WINDOW_SIZE and len(history) % _WINDOW_SIZE == 0:
            sliding_out = history[:_WINDOW_SIZE]
            background_tasks.add_task(ss.schedule_update, chat_id, sliding_out)

        thinking_kwargs = build_thinking_kwargs(mode, enable_thinking)

    except Exception as e:
        if slot_acquired:
            concurrency_limit.release()
            _active_stream_count = max(0, _active_stream_count - 1)
        _log.error(f"[Request] Setup error for chat={chat_id_hdr} user={user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # ── Streaming generator ───────────────────────────────────────────────────
    async def generate():
        global _active_stream_count

        gen_start     = time.monotonic()
        ttft_logged   = False
        total_tokens  = 0
        tool_calls_count = 0

        try:
            state = StreamState()
            active_streams[chat_id] = state

            # Determine which model we'll hit
            if mode == "small":
                target_model = LLM_SMALL_MODEL
            elif mode == "thinking":
                from config import LLM_THINKING_MODEL
                target_model = LLM_THINKING_MODEL
            else:
                target_model = LLM_HIGH_MODEL

            _log.info(f"[Generate] Starting stream: tier={target_model} mode={mode} chat={chat_id}")

            # ── SMALL MODE: EXCLUSIVE CHAT (No Tools, No Thinking) ────────────
            if mode == "small":
                _log.debug(f"[LLM Call] tier={target_model} chat={chat_id} stream=True")
                stream = await client.chat.completions.create(
                    model=target_model,
                    messages=messages,
                    stream=True,
                    user_id=user_id,
                    chat_id=chat_id,
                    mode=mode,
                )
                state.raw_stream = getattr(stream, '_raw_stream', stream)
                try:
                    async for chunk in stream:
                        if not active_streams.get(chat_id, StreamState()).active:
                            break
                        delta = chunk.choices[0].delta if chunk.choices else None
                        val = getattr(delta, "content", None) or getattr(delta, "reasoning_content", None)
                        if val is not None:
                            if not ttft_logged:
                                ttft_ms = int((time.monotonic() - gen_start) * 1000)
                                _log.info(f"[TTFT] chat={chat_id} ttft={ttft_ms}ms tier={target_model}")
                                ttft_logged = True
                            total_tokens += 1
                            yield f"data: {json.dumps({'token': val})}\n\n"
                            await asyncio.sleep(0)
                except RateLimitError:
                    _log.warning(f"[RateLimit] Mid-stream quota hit: tier={target_model} chat={chat_id}")
                    quota_payload = {
                        "type":    "QUOTA_EXHAUSTED",
                        "message": "The AI provider rate limit was hit mid-stream. Please wait a moment before trying again."
                    }
                    yield f"event: error\ndata: {json.dumps(quota_payload)}\n\n"
                return

            # ── ALL OTHER EXPERT MODES: REASONING & TOOL CALL LOOPS ──────────
            if mode == "thinking":
                from config import LLM_THINKING_MODEL
                target_model = LLM_THINKING_MODEL

            for iteration in range(MAX_ITERATIONS):
                st = active_streams.get(chat_id)
                if st is None or not st.active:
                    return

                _log.info(
                    f"[LLM Call] iteration={iteration+1}/{MAX_ITERATIONS} "
                    f"tier={target_model} chat={chat_id} stream=True"
                )

                completion_coro = client.chat.completions.create(
                    model=target_model, messages=messages,
                    tools=tool_manager.get_schemas(), tool_choice="auto",
                    stream=True, max_retries=0,
                    user_id=user_id, chat_id=chat_id, mode=mode,
                    **thinking_kwargs,
                )
                completion_task = asyncio.create_task(completion_coro)
                st.completion_task = completion_task

                try:
                    stream = await completion_task
                except asyncio.CancelledError:
                    _log.warning(f"[Cancelled] Completion task cancelled: chat={chat_id}")
                    return

                st.raw_stream = getattr(stream, '_raw_stream', stream)
                raw = st.raw_stream
                if not st.active:
                    if hasattr(raw, 'aclose'):
                        await raw.aclose()
                    return

                tool_calls_buffer:  dict = {}
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
                                    "id":       tc.id or "",
                                    "type":     "function",
                                    "function": {"name": tc.function.name or "", "arguments": ""}
                                }
                            if tc.id:
                                tool_calls_buffer[idx]["id"] = tc.id
                            if tc.function and tc.function.name:
                                tool_calls_buffer[idx]["function"]["name"] = tc.function.name
                                _log.debug(f"[ToolCall] name={tc.function.name} chat={chat_id}")
                                yield f"data: {json.dumps({'tool_call': {'name': tc.function.name, 'id': tool_calls_buffer[idx]['id']}, 'status': 'running'})}\n\n"
                            if tc.function and tc.function.arguments:
                                tool_calls_buffer[idx]["function"]["arguments"] += tc.function.arguments

                    # B. Regular text / reasoning content
                    elif (
                        getattr(delta, "content", None) is not None or
                        getattr(delta, "reasoning_content", None) is not None
                    ):
                        val = getattr(delta, "content", None) or getattr(delta, "reasoning_content", None)
                        if not ttft_logged:
                            ttft_ms = int((time.monotonic() - gen_start) * 1000)
                            _log.info(f"[TTFT] chat={chat_id} ttft={ttft_ms}ms iter={iteration+1} tier={target_model}")
                            ttft_logged = True
                        text_content_buffer.append(val)
                        total_tokens += 1
                        yield f"data: {json.dumps({'token': val})}\n\n"
                        await asyncio.sleep(0)

                # No tools called this pass → done
                if not is_tool_call:
                    _log.info(
                        f"[Generate] Stream complete: chat={chat_id} iter={iteration+1} "
                        f"tokens={total_tokens} tool_calls={tool_calls_count} "
                        f"elapsed={int((time.monotonic()-gen_start)*1000)}ms"
                    )
                    break

                # ── Process Tool Actions ───────────────────────────────────────
                tool_calls = list(tool_calls_buffer.values())
                tool_calls_count += len(tool_calls)
                _log.info(f"[Tools] Processing {len(tool_calls)} tool(s): chat={chat_id}")

                messages.append({
                    "role":       "assistant",
                    "tool_calls": tool_calls,
                    "content":    "".join(text_content_buffer) if text_content_buffer else None,
                })

                async def _run(tc):
                    func_name = tc["function"]["name"]
                    try:
                        args   = json.loads(tc["function"]["arguments"])
                        result = await tool_manager.execute(func_name, args)
                        _log.debug(f"[Tool] {func_name} → OK")
                        return {"status": "completed", "result": str(result)}
                    except json.JSONDecodeError as je:
                        _log.warning(f"[Tool] {func_name} → bad args JSON: {je}")
                        return {"status": "failed", "error": f"Bad arguments JSON: {je}"}
                    except Exception as exc:
                        _log.warning(f"[Tool] {func_name} → error: {exc}")
                        return {"status": "failed", "error": str(exc)}

                tool_tasks = [asyncio.create_task(_run(tc)) for tc in tool_calls]
                if st:
                    st.tool_tasks = tool_tasks
                try:
                    results = await asyncio.gather(*tool_tasks)
                except asyncio.CancelledError:
                    return

                for tc, res in zip(tool_calls, results):
                    func_name      = tc["function"]["name"]
                    tc_id          = tc["id"]
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

        except RateLimitError:
            _log.warning(f"[RateLimit] Quota hit: chat={chat_id} user={user_id}")
            quota_payload = {
                "type":    "QUOTA_EXHAUSTED",
                "message": "The AI provider rate limit was hit. Please wait a moment before trying again."
            }
            yield f"event: error\ndata: {json.dumps(quota_payload)}\n\n"

        except Exception as e:
            _log.error(f"[Generate] Pipeline error: chat={chat_id} user={user_id} error={e}", exc_info=True)
            err_payload = {"message": f"AI Generation pipeline execution error: {str(e)}"}
            yield f"event: error\ndata: {json.dumps(err_payload)}\n\n"

        finally:
            elapsed = int((time.monotonic() - gen_start) * 1000)
            _log.info(
                f"[Done] chat={chat_id} user={user_id} elapsed={elapsed}ms "
                f"tokens={total_tokens} tool_calls={tool_calls_count}"
            )
            # Write a lifecycle log to MongoDB
            asyncio.ensure_future(_write_chat_log({
                "chat_id":        chat_id,
                "user_id":        user_id,
                "mode":           mode,
                "elapsed_ms":     elapsed,
                "total_tokens":   total_tokens,
                "tool_calls":     tool_calls_count,
            }))

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
    _log.info(f"[Stop] Stream stopped: chat={chat_id}")
    return {"message": "Stream stopped"}