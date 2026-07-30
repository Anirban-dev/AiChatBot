import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from litellm.exceptions import RateLimitError

from config import LLM_SMALL_MODEL, client, LLM_HIGH_MODEL, SYSTEM_PROMPT, CONCURRENT_STREAMS
from services import vector_store as vs
from services import vector_db as vdb
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
        active_path     = body.get("activePath", [])  # New: Active linear path
        enable_thinking = body.get("enable_thinking", False)
        mode            = body.get("mode", "small")

        user_text       = body.get("text", "")
        file_info       = body.get("fileInfo")
        file_data       = body.get("file")

        # Map current user content and text for LLM message format
        current_prompt = user_prompt
        current_text = user_text
        if file_info and file_data:
            current_prompt = file_data
            current_text = user_prompt

        _log.info(
            f"[Request] chat={chat_id} user={user_id} mode={mode} "
            f"history_len={len(history)} prompt_len={len(user_prompt)}"
        )

        # ── 2. BUILD SYSTEM PROMPT ────────────────────────────────────────────
        system = SYSTEM_PROMPT

        # Check if vector DB tool is available
        vector_db_available = tool_manager.is_vector_db_available(mode)
        
        state_block = ss.get_state_block(chat_id)
        if state_block:
            system += state_block
        
        # If vector DB is available, note it in system prompt
        if vector_db_available:
            system += "\n\n━━━ VECTOR DATABASE ━━━\n- You have access to a vector database containing uploaded documents.\n- Use the vector_db_search tool when you need information from files.\n- Only call this tool if the user has uploaded relevant documents."

        if mode == "thinking":
            system += (
                "\n\n━━━ MODE DIRECTIVE: NATIVE REASONING ━━━\n"
                "- Use your native thinking capabilities to break down logic step-by-step.\n"
            )

        def format_message_content(role: str, content: str, text: str = None, file_info: dict = None):
            is_image = False
            if file_info:
                ext = file_info.get("extension", "").lower()
                mime = file_info.get("mimeType", "").lower()
                if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff"} or mime.startswith("image/"):
                    is_image = True
            elif content and content.startswith("data:image/"):
                is_image = True

            if is_image:
                content_list = [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": content
                        }
                    }
                ]
                if text:
                    content_list.append({
                        "type": "text",
                        "text": text
                    })
                return content_list
            elif file_info:
                filename = file_info.get("name", "Unknown File")
                val = f"[Uploaded File: {filename}]\n{content}"
                if text:
                    val += f"\n\nUser Message:\n{text}"
                return val
            else:
                return content

        # ── 4. BUILD MESSAGE HISTORY ──────────────────────────────────────────
        # Use only active linear path for conversation branching
        messages = [{"role": "system", "content": system}]
        for msg in active_path:
            msg_content = msg.get("content", "")
            msg_text = msg.get("text")
            if msg.get("fileInfo") and msg.get("file"):
                msg_content = msg.get("file", "")
                msg_text = msg.get("content", "")

            messages.append({
                "role": msg["role"],
                "content": format_message_content(
                    msg["role"],
                    msg_content,
                    msg_text,
                    msg.get("fileInfo")
                )
            })
        messages.append({
            "role": "user",
            "content": format_message_content(
                "user",
                current_prompt,
                current_text,
                file_info
            )
        })

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
                # For small mode, don't pass tools (including vector DB)
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
                        if delta:
                            reasoning = getattr(delta, "reasoning_content", None)
                            content = getattr(delta, "content", None)
                            if reasoning:
                                yield f"data: {json.dumps({'reasoning_token': reasoning})}\n\n"
                            if content:
                                if not ttft_logged:
                                    ttft_ms = int((time.monotonic() - gen_start) * 1000)
                                    _log.info(f"[TTFT] chat={chat_id} ttft={ttft_ms}ms tier={target_model}")
                                    ttft_logged = True
                                total_tokens += 1
                                yield f"data: {json.dumps({'token': content})}\n\n"
                            await asyncio.sleep(0)
                except RateLimitError:
                    _log.warning(f"[RateLimit] Mid-stream hit: tier={target_model} chat={chat_id}")
                    yield f"event: error\ndata: {json.dumps({'message': 'Rate limit hit — please wait a moment and try again.'})}\n\n"
                return

            # ── ALL OTHER MODES: ──────────────────────────────────────────────────────
            for iteration in range(MAX_ITERATIONS):
                st = active_streams.get(chat_id)
                if st is None or not st.active:
                    return

                _log.info(f"[LLM Call] iteration={iteration+1}/{MAX_ITERATIONS} tier={target_model} chat={chat_id}")

                stream = await client.chat.completions.create(
                    model=target_model,
                    messages=messages,
                    tools=tool_manager.get_schemas(mode),
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

                # Inline tag streaming state
                _think_buffer      = ""   # accumulates text seen inside <think>...</think>
                _in_think_block    = False
                _residual          = ""   # partial tag seen at the edge of a chunk

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

                    elif (
                        getattr(delta, "content", None) is not None or
                        getattr(delta, "reasoning_content", None) is not None
                    ):
                        native_reasoning = getattr(delta, "reasoning_content", None)
                        content = getattr(delta, "content", None)

                        # Native reasoning field → pass straight through
                        if native_reasoning:
                            yield f"data: {json.dumps({'reasoning_token': native_reasoning})}\n\n"

                        if content:
                            # Combine with any unprocessed residual from the previous chunk
                            working = _residual + content
                            _residual = ""
                            out_tokens = ""

                            i = 0
                            while i < len(working):
                                if _in_think_block:
                                    end = working.find("</think>", i)
                                    if end == -1:
                                        # Haven't seen </think> yet — buffer everything
                                        _think_buffer += working[i:]
                                        i = len(working)
                                    else:
                                        # Found </think> — capture up to it
                                        _think_buffer += working[i:end]
                                        _in_think_block = False
                                        i = end + len("</think>")
                                        # Emit the full thought block as a reasoning event
                                        if _think_buffer.strip():
                                            yield f"data: {json.dumps({'reasoning_token': _think_buffer})}\n\n"
                                            _think_buffer = ""
                                else:
                                    start = working.find("<think>", i)
                                    if start == -1:
                                        # No opening tag found — check for a partial tag at the tail
                                        # so we don't accidentally yield "<thi" as a token
                                        tail = working[i:]
                                        OPEN_TAG = "<think>"
                                        partial = ""
                                        for k in range(1, len(OPEN_TAG)):
                                            if tail.endswith(OPEN_TAG[:k]):
                                                partial = OPEN_TAG[:k]
                                                break
                                        if partial:
                                            out_tokens += tail[: len(tail) - len(partial)]
                                            _residual = partial
                                        else:
                                            out_tokens += tail
                                        i = len(working)
                                    else:
                                        # Yield everything before the tag, then enter think mode
                                        out_tokens += working[i:start]
                                        _in_think_block = True
                                        i = start + len("<think>")

                            if out_tokens:
                                if not ttft_logged:
                                    ttft_ms = int((time.monotonic() - gen_start) * 1000)
                                    _log.info(f"[TTFT] chat={chat_id} ttft={ttft_ms}ms iter={iteration+1} tier={target_model}")
                                    ttft_logged = True
                                text_content_buffer.append(out_tokens)
                                total_tokens += 1
                                yield f"data: {json.dumps({'token': out_tokens})}\n\n"
                                await asyncio.sleep(0)

                # Flush any unclosed <think> block (model didn't emit </think>)
                if _in_think_block and _think_buffer.strip():
                    yield f"data: {json.dumps({'reasoning_token': _think_buffer})}\n\n"
                    _think_buffer = ""
                # Flush any partial-tag residual as normal content
                if _residual:
                    text_content_buffer.append(_residual)
                    yield f"data: {json.dumps({'token': _residual})}\n\n"
                    _residual = ""

                # Stream finished for this iteration
                full_text = "".join(text_content_buffer)

                # Clean up Qwen/DeepSeek control tokens & inline tool tokens if model outputted them into text
                if not is_tool_call and ("<|message|>" in full_text or "commentary" in full_text or "<function>" in full_text or "<tool_call>" in full_text):
                    # Check for inline function / tool call patterns (e.g. commentary<|message|>... or <function>web_search{...}</function>)
                    tool_matches = re.findall(
                        r"(?:<function>|<tool_call>|commentary<\|message\|>)?\s*(\w+)\s*(?:\{.*?\})?\s*(?:</function>|</tool_call>|<\|end\|>|$)",
                        full_text,
                        re.DOTALL,
                    )
                    # Also match standard tool calls like "Use web_search to find..."
                    tool_names_known = set(tool_manager.get_tools().keys())
                    inline_calls = []
                    for match_name in re.findall(r"\b([a-zA-Z_0-9]+)\b", full_text):
                        if match_name in tool_names_known and match_name not in inline_calls:
                            inline_calls.append(match_name)

                    if "<function>" in full_text or "<tool_call>" in full_text:
                        func_matches = re.findall(
                            r"(?:<function>|<tool_call>)\s*(\w+)\s*(\{.*?\})?\s*(?:</function>|</tool_call>|$)",
                            full_text,
                            re.DOTALL,
                        )
                        if func_matches:
                            is_tool_call = True
                            for idx, (func_name, raw_args) in enumerate(func_matches):
                                raw_args = raw_args.strip() if raw_args else "{}"
                                try:
                                    json.loads(raw_args)
                                    args_str = raw_args
                                except json.JSONDecodeError:
                                    args_str = "{}"
                                call_id = f"call_inline_{iteration}_{idx}"
                                tool_calls_buffer[len(tool_calls_buffer)] = {
                                    "id": call_id,
                                    "type": "function",
                                    "function": {"name": func_name, "arguments": args_str},
                                }

                if not is_tool_call:
                    # Clean any leaked control tokens from visible output buffer
                    clean_text = re.sub(r"<\|message\|>|<\|end\|>|commentary<\|message\|>", "", full_text).strip()
                    if clean_text != full_text:
                        text_content_buffer = [clean_text]

                    # No tools called → text was already streamed → done
                    _log.info(f"[Generate] Complete: chat={chat_id} iter={iteration+1} tokens={total_tokens}")
                    break

                # ── Execute tool calls ────────────────────────────────────────
                tool_calls = list(tool_calls_buffer.values())
                tool_calls_count += len(tool_calls)
                tool_names = [tc["function"]["name"] for tc in tool_calls]
                _log.info(f"[Tools] Executing: {tool_names} chat={chat_id}")

                # 1. Inform Node.js that tools are running (Triggers MongoDB log)
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
                    
                    # For vector_db_search, inject active_path and chat_id into arguments
                    if func_name == "vector_db_search":
                        args = json.loads(tc["function"]["arguments"])
                        args["active_path"] = active_path
                        args["chat_id"] = chat_id
                        _log.debug(f"[Tool] vector_db_search with chat_id={chat_id} and active_path of {len(active_path)} messages")
                    else:
                        args = json.loads(tc["function"]["arguments"])
                    
                    try:
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