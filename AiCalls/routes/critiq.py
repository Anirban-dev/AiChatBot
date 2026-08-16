"""
critiq.py — Multi-agent Critiq pipeline
────────────────────────────────────────
Design principles
  • Token-efficient: workers are single-shot, no tools, no loops.
  • Orchestrator does all heavy lifting: tool calls, reasoning, planning.
  • Workers do one thing only: parallel text generation for a focused sub-task.

Architecture
  ┌─────────────────────────────────────────────┐
  │  ORCHESTRATOR  (critiq model)               │
  │  • All tools: web_search, scrape_url,       │
  │    vector_db_search + delegate_to_worker    │
  │  • Thinking kwargs (if enable_thinking)     │
  │  • Full system prompt + directives          │
  │  • Up to MAX_ITERATIONS tool-call loops     │
  └──────────────┬──────────────────────────────┘
                 │  delegate_to_worker (≤ 2 parallel)
       ┌─────────┴─────────┐
       ▼                   ▼
  ┌─────────┐         ┌─────────┐
  │ WORKER1 │         │ WORKER2 │
  │  small  │         │  small  │
  │  model  │         │  model  │
  │ no tools│         │ no tools│
  │ 1 call  │         │ 1 call  │
  └─────────┘         └─────────┘

Workers are for: parallel drafting, synthesis, analysis of known context.
Workers are NOT for: research, tool calls, multi-step reasoning.
The orchestrator does all research/tool work before delegating synthesis tasks.

SSE events (in addition to standard token / tool_call events):
  • {"worker_start": {"worker_id": str, "task": str}}
  • {"worker_done":  {"worker_id": str, "result": str}}
  • {"worker_error": {"worker_id": str, "error": str}}
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import AsyncGenerator

from config import LLM_CRITIQ_MODEL, LLM_SMALL_MODEL, client, SYSTEM_PROMPT
from services import tool_manager
from state import active_streams, StreamState

_log = logging.getLogger("critiq")

# ── Constants ──────────────────────────────────────────────────────────────────
MAX_WORKERS     = 2    # hard cap on concurrent sub-workers
MAX_ITERATIONS  = 6    # orchestrator tool-call iterations
MAX_TOOL_RESULT = 4000 # chars, mirrors chat.py

# ── Delegate-to-worker tool schema ─────────────────────────────────────────────
# Workers have NO tools and do ONE call — describe them accurately so the
# orchestrator uses them for the right kind of work.
_DELEGATE_TOOL_SCHEMA: dict = {
    "type": "function",
    "function": {
        "name": "delegate_to_worker",
        "description": (
            "Delegate a focused text-generation sub-task to a lightweight parallel "
            "worker. Workers run concurrently (max 2) and are best for: drafting a "
            "section of the answer, summarising provided context, writing code for "
            "a specific sub-problem, or generating a self-contained analysis. "
            "Workers have NO tool access and cannot search the web or look up "
            "documents — the orchestrator must supply all necessary context inside "
            "the task description. Do not use workers for research; use web_search "
            "or scrape_url directly instead."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "worker_id": {
                    "type": "string",
                    "description": "Short unique label for this worker, e.g. 'worker_1'.",
                },
                "task": {
                    "type": "string",
                    "description": (
                        "Complete, self-contained task description. Include all "
                        "context the worker needs — it has no memory of the conversation."
                    ),
                },
            },
            "required": ["worker_id", "task"],
        },
    },
}


def _get_orchestrator_schemas(mode: str) -> list[dict]:
    """All normal tool schemas PLUS the delegate_to_worker pseudo-tool."""
    schemas = tool_manager.get_schemas(mode)  # includes vector_db_search for critiq
    schemas.append(_DELEGATE_TOOL_SCHEMA)
    return schemas


# ── Sub-worker: pure single-shot text generation ───────────────────────────────

async def _run_worker(
    worker_id: str,
    task: str,
    user_id: str,
    chat_id: str,
) -> str:
    """
    Single non-streaming LLM call on the small model.
    No tools, no loops — maximum token efficiency.
    Returns the worker's text output (or an error string).
    """
    system = (
        "You are a focused text-generation assistant. "
        "Complete the task below precisely and concisely. "
        "Do not ask questions or add preamble. Output only the result."
    )
    try:
        response = await client.chat.completions.create(
            model=LLM_SMALL_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": task},
            ],
            stream=False,
            user_id=user_id,
            chat_id=chat_id,
            mode="critiq_worker",
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as exc:
        _log.warning(f"[Worker:{worker_id}] LLM error: {exc}")
        return f"Worker error: {exc}"


# ── Orchestrator streaming generator ──────────────────────────────────────────

async def run_critiq(
    *,
    chat_id:        str,
    user_id:        str,
    messages:       list[dict],
    active_path:    list,
    mode:           str  = "critiq",
    enable_thinking: bool = False,
) -> AsyncGenerator[str, None]:
    """
    Main critiq multi-agent generator. Yields SSE-formatted strings.
    Orchestrator has full tool access + optional thinking.
    Workers are cheap, parallel, tool-free text generators.
    """
    gen_start        = time.monotonic()
    ttft_logged      = False
    total_tokens     = 0
    tool_calls_count = 0

    try:
        state = active_streams.get(chat_id)
        if state is None:
            state = StreamState()
            active_streams[chat_id] = state

        # ── Augment system prompt for critiq-specific directives ───────────────
        # messages[0] is the system message built by chat.py (already has
        # state_block, vector_db note, etc.).  We append critiq + thinking hints.
        if messages and messages[0].get("role") == "system":
            extra = (
                "\n\n━━━ CRITIQ MODE: MULTI-AGENT ORCHESTRATOR ━━━\n"
                "- You are the orchestrator. Plan, research with tools, then synthesise.\n"
                "- Use delegate_to_worker to parallelise pure writing/analysis tasks "
                "(max 2 workers). Workers have no tools — give them all context they need.\n"
                "- Do your own research (web_search, scrape_url, vector_db_search) "
                "before delegating; workers cannot search.\n"
                "- Be token-efficient: delegate only when parallel generation saves "
                "meaningful time or improves quality."
            )
            if enable_thinking:
                extra += (
                    "\n\n━━━ MODE DIRECTIVE: NATIVE REASONING ━━━\n"
                    "- Use your native thinking capabilities to break down logic step-by-step.\n"
                )
            messages[0]["content"] = messages[0]["content"] + extra

        # ── Thinking kwargs (only if model + flag support it) ─────────────────
        thinking_kwargs: dict = {}
        if enable_thinking:
            thinking_kwargs = {"thinking": {"type": "enabled", "budget_tokens": 8000}}

        orchestrator_schemas = _get_orchestrator_schemas(mode)

        # ── Orchestrator agentic loop ──────────────────────────────────────────
        for iteration in range(MAX_ITERATIONS):
            st = active_streams.get(chat_id)
            if st is None or not st.active:
                return

            _log.info(
                f"[Critiq] Orchestrator iter={iteration+1}/{MAX_ITERATIONS} "
                f"chat={chat_id} thinking={enable_thinking}"
            )

            stream = await client.chat.completions.create(
                model=LLM_CRITIQ_MODEL,
                messages=messages,
                tools=orchestrator_schemas,
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
                    if hasattr(stream, "aclose"):
                        await stream.aclose()
                    return

                if not chunk.choices:
                    continue

                delta = chunk.choices[0].delta

                # Accumulate tool-call fragments
                if getattr(delta, "tool_calls", None) is not None:
                    is_tool_call = True
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_buffer:
                            tool_calls_buffer[idx] = {
                                "id":       tc.id or "",
                                "type":     "function",
                                "function": {"name": tc.function.name or "", "arguments": ""},
                            }
                        if tc.id:
                            tool_calls_buffer[idx]["id"] = tc.id
                        if tc.function and tc.function.name:
                            tool_calls_buffer[idx]["function"]["name"] = tc.function.name
                        if tc.function and tc.function.arguments:
                            tool_calls_buffer[idx]["function"]["arguments"] += tc.function.arguments

                else:
                    # Reasoning tokens (thinking models)
                    native_reasoning = getattr(delta, "reasoning_content", None)
                    content          = getattr(delta, "content", None)

                    if native_reasoning:
                        yield f"data: {json.dumps({'reasoning_token': native_reasoning})}\n\n"

                    if content:
                        if not ttft_logged:
                            ttft_ms = int((time.monotonic() - gen_start) * 1000)
                            _log.info(
                                f"[TTFT] chat={chat_id} ttft={ttft_ms}ms "
                                f"iter={iteration+1} tier={LLM_CRITIQ_MODEL}"
                            )
                            ttft_logged = True
                        text_content_buffer.append(content)
                        total_tokens += 1
                        yield f"data: {json.dumps({'token': content})}\n\n"
                        await asyncio.sleep(0)

            # ── Iteration finished ─────────────────────────────────────────────
            if not is_tool_call:
                _log.info(
                    f"[Critiq] Done: chat={chat_id} iter={iteration+1} "
                    f"tokens={total_tokens}"
                )
                break

            # ── Dispatch all tool calls ────────────────────────────────────────
            tool_calls = list(tool_calls_buffer.values())
            tool_calls_count += len(tool_calls)

            delegate_calls = [tc for tc in tool_calls if tc["function"]["name"] == "delegate_to_worker"]
            normal_calls   = [tc for tc in tool_calls if tc["function"]["name"] != "delegate_to_worker"]

            # Notify client of running tools
            for tc in tool_calls:
                yield f"data: {json.dumps({'tool_call': {'id': tc['id'], 'name': tc['function']['name']}, 'status': 'running'})}\n\n"

            # Append assistant turn to history
            messages.append({
                "role":       "assistant",
                "tool_calls": tool_calls,
                "content":    "".join(text_content_buffer) or None,
            })

            # ── Execute normal tools concurrently ──────────────────────────────
            async def _run_tool(tc: dict) -> str:
                func_name = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"]["arguments"] or "{}")
                    if func_name == "vector_db_search":
                        args["active_path"] = active_path
                        args["chat_id"]     = chat_id
                    result = await tool_manager.execute(func_name, args)
                    _log.debug(f"[Critiq:Tool] {func_name} OK")
                    return str(result)[:MAX_TOOL_RESULT]
                except Exception as exc:
                    _log.warning(f"[Critiq:Tool] {func_name} error: {exc}")
                    return f"Tool error: {exc}"

            if normal_calls:
                normal_results = await asyncio.gather(
                    *[_run_tool(tc) for tc in normal_calls]
                )
                for tc, result in zip(normal_calls, normal_results):
                    is_error = str(result).startswith("Tool error:")
                    yield f"data: {json.dumps({'tool_call': {'id': tc['id'], 'name': tc['function']['name']}, 'status': 'failed' if is_error else 'completed', 'result': result if not is_error else '', 'error': result if is_error else ''})}\n\n"
                    messages.append({
                        "role":         "tool",
                        "tool_call_id": tc["id"],
                        "name":         tc["function"]["name"],
                        "content":      result,
                    })

            # ── Spin up workers (capped at MAX_WORKERS, no tools, single call) ─
            if delegate_calls:
                capped = delegate_calls[:MAX_WORKERS]
                if len(delegate_calls) > MAX_WORKERS:
                    _log.warning(
                        f"[Critiq] Orchestrator requested {len(delegate_calls)} workers; "
                        f"capping to {MAX_WORKERS}."
                    )

                # Kick off all workers concurrently
                worker_infos: list[tuple] = []
                for tc in capped:
                    args      = json.loads(tc["function"]["arguments"] or "{}")
                    worker_id = args.get("worker_id", tc["id"])
                    task_desc = args.get("task", "")
                    yield f"data: {json.dumps({'worker_start': {'worker_id': worker_id, 'task': task_desc}})}\n\n"
                    _log.info(f"[Critiq] Spawning worker={worker_id} chat={chat_id}")
                    atask = asyncio.create_task(
                        _run_worker(
                            worker_id=worker_id,
                            task=task_desc,
                            user_id=user_id,
                            chat_id=chat_id,
                        )
                    )
                    worker_infos.append((tc, worker_id, atask))

                # Collect results
                for tc, worker_id, atask in worker_infos:
                    try:
                        worker_result = await atask
                        _log.info(
                            f"[Critiq] Worker={worker_id} done "
                            f"result_len={len(worker_result)}"
                        )
                        yield f"data: {json.dumps({'worker_done': {'worker_id': worker_id, 'result': worker_result[:500]}})}\n\n"
                        yield f"data: {json.dumps({'tool_call': {'id': tc['id'], 'name': 'delegate_to_worker'}, 'status': 'completed', 'result': f'[{worker_id}]: {worker_result[:200]}', 'error': ''})}\n\n"
                        messages.append({
                            "role":         "tool",
                            "tool_call_id": tc["id"],
                            "name":         "delegate_to_worker",
                            "content":      f"[{worker_id} result]:\n{worker_result}",
                        })
                    except Exception as exc:
                        _log.error(f"[Critiq] Worker={worker_id} exception: {exc}")
                        yield f"data: {json.dumps({'worker_error': {'worker_id': worker_id, 'error': str(exc)}})}\n\n"
                        yield f"data: {json.dumps({'tool_call': {'id': tc['id'], 'name': 'delegate_to_worker'}, 'status': 'failed', 'result': '', 'error': str(exc)})}\n\n"
                        messages.append({
                            "role":         "tool",
                            "tool_call_id": tc["id"],
                            "name":         "delegate_to_worker",
                            "content":      f"[{worker_id} failed]: {exc}",
                        })

            # Reset per-iteration buffers
            text_content_buffer = []
            tool_calls_buffer   = {}
            is_tool_call        = False

        else:
            fallback = "\n\n[Critiq orchestrator hit the maximum iteration limit.]"
            yield f"data: {json.dumps({'token': fallback})}\n\n"

    except Exception as exc:
        _log.error(
            f"[Critiq] Pipeline error: chat={chat_id} user={user_id} error={exc}",
            exc_info=True,
        )
        yield f"event: error\ndata: {json.dumps({'message': f'Critiq Engine Error: {str(exc)}'})}\n\n"

    finally:
        elapsed = int((time.monotonic() - gen_start) * 1000)
        _log.info(
            f"[Critiq:Done] chat={chat_id} elapsed={elapsed}ms "
            f"tokens={total_tokens} tool_calls={tool_calls_count}"
        )
