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

_log  = logging.getLogger("chat")
_IST  = ZoneInfo("Asia/Kolkata")

concurrency_limit    = asyncio.Semaphore(CONCURRENT_STREAMS)
_active_stream_count = 0

MAX_ITERATIONS  = 5
MAX_TOOL_RESULT = 4000
_WINDOW_SIZE    = 10


def build_thinking_kwargs(mode: str, enable_thinking: bool) -> dict:
    if mode != "thinking" or not enable_thinking:
        return {}
    return {"thinking": {"type": "enabled", "budget_tokens": 8000}}


async def _write_chat_log(doc: dict):
    try:
        doc["timestamp"] = datetime.now(_IST)
        await chat_logs.insert_one(doc)
    except Exception as exc:
        _log.error(f"[ChatLog] MongoDB write error: {exc}")


@router.post("/agent/chat")
async def stream_chat(request: Request, background_tasks: BackgroundTasks):
    global _active_stream_count

    user_id     = request.headers.get("X-User-Id", "unknown")
    chat_id_hdr = request.headers.get("X-Chat-Id", "")

    # ── 1. CAPACITY CHECK ─────────────────────────────────────────────────────
    if _active_stream_count >= CONCURRENT_STREAMS or concurrency_limit.locked():
        _log.warning(f"[Capacity] At capacity. user={user_id}")
        raise HTTPException(status_code=503, detail="AI Engine is at capacity. Please wait a few seconds.")

    try:
        await asyncio.wait_for(concurrency_limit.acquire(), timeout=2.0)
        _active_stream_count += 1
    except asyncio.TimeoutError:
        _log.warning(f"[Capacity] Semaphore timeout. user={user_id}")
        raise HTTPException(status_code=503, detail="AI Engine is at capacity. Please wait a few seconds.")

    slot_acquired = True

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

        # ── 2. RAG RETRIEVAL ──────────────────────────────────────────────────
        context_docs = await vs.search(user_prompt, chat_id, k=4)
        context = "\n\n---\n\n".join(d.page_content for d in context_docs)

        # ── 3. BUILD SYSTEM PROMPT ────────────────────────────────────────────
        system = SYSTEM_PROMPT

        state_block = ss.get_state_block(chat_id)
        if state_block:
            system += state_block

        if context:
            system += f"\n\n=== Relevant Document Context ===\n{context}\n"

        if mode == "thinking":
            system += (
                "\n\n━━━ MODE DIRECTIVE: NATIVE REASONING ━━━\n"
                "- Use your native thinking capabilities to break down logic step-by-step.\n"
            )

        # ── 4. BUILD MESSAGE HISTORY ──────────────────────────────────────────
        messages = [{"role": "system", "content": system}]
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_prompt})

        # ── 5. SLIDING WINDOW STATE UPDATE ───────────────────────────────────
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

        gen_start        = time.monotonic()
        ttft_logged      = False
        total_tokens     = 0
        tool_calls_count = 0

        try:
            state = StreamState()
            active_streams[chat_id] = state

            if mode == "thinking":
                from config import LLM_THINKING_MODEL
                target_model = LLM_THINKING_MODEL
            elif mode == "small":
                target_model = LLM_SMALL_MODEL
            else:
                target_model = LLM_HIGH_MODEL

            _log.info(f"[Generate] Starting: tier={target_model} mode={mode} chat={chat_id}")

            # ── SMALL MODE: no tools, pure streaming ──────────────────────────
            if mode == "small":
                stream = await client.chat.completions.create(
                    model=target_model,
                    messages=messages,
                    stream=True,
                    user_id=user_id,
                    chat_id=chat_id,
                    mode=mode,
                )
                state.raw_stream = stream._raw_stream

                try:
                    async for chunk in stream:
                        if not active_streams.get(chat_id, StreamState()).active:
                            break
                        delta = chunk.choices[0].delta if chunk.choices else None
                        val   = getattr(delta, "content", None) or getattr(delta, "reasoning_content", None)
                        if val is not None:
                            if not ttft_logged:
                                ttft_ms = int((time.monotonic() - gen_start) * 1000)
                                _log.info(f"[TTFT] chat={chat_id} ttft={ttft_ms}ms tier={target_model}")
                                ttft_logged = True
                            total_tokens += 1
                            yield f"data: {json.dumps({'token': val})}\n\n"
                            await asyncio.sleep(0)
                except RateLimitError:
                    _log.warning(f"[RateLimit] Mid-stream hit: tier={target_model} chat={chat_id}")
                    yield f"event: error\ndata: {json.dumps({'message': 'Rate limit hit — please wait a moment and try again.'})}\n\n"
                return

            # ── ALL OTHER MODES: streaming with tool-call accumulation ─────────
            # IMPORTANT: We ONLY use streaming here — never a non-streaming probe.
            # Passing tools= to router.acompletion() in non-streaming mode triggers
            # a litellm bug ("coroutine was never awaited"). Always stream and
            # accumulate tool_call deltas from chunks instead.
            for iteration in range(MAX_ITERATIONS):
                st = active_streams.get(chat_id)
                if st is None or not st.active:
                    return

                _log.info(f"[LLM Call] iteration={iteration+1}/{MAX_ITERATIONS} tier={target_model} chat={chat_id}")

                stream = await client.chat.completions.create(
                    model=target_model,
                    messages=messages,
                    tools=tool_manager.get_schemas(),
                    tool_choice="auto",
                    stream=True,
                    user_id=user_id,
                    chat_id=chat_id,
                    mode=mode,
                    **thinking_kwargs,
                )
                state.raw_stream = stream._raw_stream

                tool_calls_buffer:   dict = {}
                text_content_buffer: list = []
                is_tool_call = False

                async for chunk in stream:
                    if not active_streams.get(chat_id, StreamState()).active:
                        if hasattr(stream, 'aclose'):
                            await stream.aclose()
                        return

                    if not chunk.choices:
                        continue

                    delta = chunk.choices[0].delta

                    # A. Tool call delta chunks — accumulate, don't yield yet
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
                            if tc.function and tc.function.arguments:
                                tool_calls_buffer[idx]["function"]["arguments"] += tc.function.arguments

                    # B. Regular text / reasoning — yield directly as raw text
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

                # Stream finished for this iteration
                if not is_tool_call:
                    # No tools called → text was already streamed → done
                    _log.info(f"[Generate] Complete: chat={chat_id} iter={iteration+1} tokens={total_tokens}")
                    break

                # ── Execute tool calls ────────────────────────────────────────
                tool_calls = list(tool_calls_buffer.values())
                tool_calls_count += len(tool_calls)
                tool_names = [tc["function"]["name"] for tc in tool_calls]
                _log.info(f"[Tools] Executing: {tool_names} chat={chat_id}")

                # 1. Output visual text to the user
                notice = f"\n\n[Action: Calling tool(s): {', '.join(tool_names)}...]\n\n"
                yield f"data: {json.dumps({'token': notice})}\n\n"

                # 2. Inform Node.js that tools are running (Triggers MongoDB log)
                for tc in tool_calls:
                    tool_payload = {
                        "tool_call": {
                            "id": tc["id"],
                            "name": tc["function"]["name"]
                        },
                        "status": "running"
                    }
                    yield f"data: {json.dumps(tool_payload)}\n\n"

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
                        return str(result)[:MAX_TOOL_RESULT]
                    except Exception as exc:
                        _log.warning(f"[Tool] {func_name} → error: {exc}")
                        return f"Tool error: {exc}"

                results = await asyncio.gather(*[_run(tc) for tc in tool_calls])

                for tc, result in zip(tool_calls, results):
                    # 1. Tell Node.js the tool finished (Updates MongoDB)
                    is_error = str(result).startswith("Tool error:")
                    tool_payload = {
                        "tool_call": {
                            "id": tc["id"],
                            "name": tc["function"]["name"]
                        },
                        "status": "failed" if is_error else "completed",
                        "result": result if not is_error else "",
                        "error": result if is_error else ""
                    }
                    yield f"data: {json.dumps(tool_payload)}\n\n"

                    # 2. Append to Python's internal history
                    messages.append({
                        "role":         "tool",
                        "tool_call_id": tc["id"],
                        "name":         tc["function"]["name"],
                        "content":      result,
                    })

            else:
                fallback_notice = "\n\n[Agent hit the maximum iteration limit without a final answer.]"
                yield f"data: {json.dumps({'token': fallback_notice})}\n\n"

        except RateLimitError:
            _log.warning(f"[RateLimit] Quota hit: chat={chat_id} user={user_id}")
            # Use standard SSE error event
            yield f"event: error\ndata: {json.dumps({'message': 'Rate limit hit — please wait a moment and try again.'})}\n\n"

        except Exception as e:
            _log.error(f"[Generate] Pipeline error: chat={chat_id} user={user_id} error={e}", exc_info=True)
            yield f"event: error\ndata: {json.dumps({'message': f'Engine Error: {str(e)}'})}\n\n"

        finally:
            elapsed = int((time.monotonic() - gen_start) * 1000)
            _log.info(
                f"[Done] chat={chat_id} user={user_id} elapsed={elapsed}ms "
                f"tokens={total_tokens} tool_calls={tool_calls_count}"
            )
            asyncio.ensure_future(_write_chat_log({
                "chat_id":      chat_id,
                "user_id":      user_id,
                "mode":         mode,
                "elapsed_ms":   elapsed,
                "total_tokens": total_tokens,
                "tool_calls":   tool_calls_count,
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