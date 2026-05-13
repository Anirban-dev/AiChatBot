import asyncio
import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from config import client, LLM_MODEL, SYSTEM_PROMPT
from services import vector_store as vs
from state import active_streams
from services.tool_manager import tool_manager

router = APIRouter()

MAX_ITERATIONS = 5      # guard against infinite agentic loops
MAX_TOOL_RESULT = 4000  # truncate large tool outputs


@router.post("/agent/chat")
async def stream_chat(request: Request):
    body        = await request.json()
    chat_id     = body.get("chat_id", "")
    user_prompt = body.get("message", "")

    # ── RAG retrieval ──────────────────────────────────────────
    context_docs = vs.search(user_prompt, chat_id, k=4)
    context      = "\n\n---\n\n".join(d.page_content for d in context_docs)

    system = SYSTEM_PROMPT
    if context:
        system += (
            f"\n\n=== Context from user's uploaded documents ===\n"
            f"{context}\n"
            f"=== End of context — answer using the above ===\n"
        )
    else:
        system += "\n\n=== No documents uploaded yet ==="

    # ── Build initial message history ─────────────────────────
    messages = [{"role": "system", "content": system}]
    for msg in body.get("history", []):
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_prompt})

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

    return StreamingResponse(generate(), media_type="text/plain")