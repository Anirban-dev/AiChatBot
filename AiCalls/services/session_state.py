# session_state.py

import asyncio
import json
from pathlib import Path

from config import client, LLM_SUMM_MODEL

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

STATE_DIR = Path(__file__).resolve().parents[2] / "dump" / "state"
STATE_DIR.mkdir(parents=True, exist_ok=True)

_STATE_MODEL = LLM_SUMM_MODEL
_MAX_STATE_TOKENS = 1000

_UPDATE_SYSTEM_PROMPT = """\
You are a silent background state-tracker for a technical chat assistant.
Your only job is to merge new conversation turns into the existing JSON state object.

Rules:
- Output ONLY a valid JSON object — no markdown fences, no explanation.
- Capture: tech stack choices, architectural decisions, environment details, \
current bugs/focus, key user preferences or constraints.
- Ignore: greetings, pleasantries, retries, duplicate errors, and anything \
that doesn't change the technical picture.
- If nothing meaningful changed, return the existing state unchanged.
- Keep the JSON compact (no unnecessary nesting).
"""

# ---------------------------------------------------------------------------
# Per-chat async locks (prevent concurrent writes to the same file)
# ---------------------------------------------------------------------------

_locks: dict[str, asyncio.Lock] = {}


def _lock(chat_id: str) -> asyncio.Lock:
    if chat_id not in _locks:
        _locks[chat_id] = asyncio.Lock()
    return _locks[chat_id]


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------

def _state_path(chat_id: str) -> Path:
    return STATE_DIR / f"{chat_id}.json"


def _load(chat_id: str) -> dict:
    p = _state_path(chat_id)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {}


def _save(chat_id: str, state: dict) -> None:
    _state_path(chat_id).write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_state_block(chat_id: str) -> str:
    """
    Return a short system-prompt snippet with the current state JSON.
    Empty string if no state exists yet.
    """
    state = _load(chat_id)
    if not state:
        return ""
    return f"\n\n=== Session State (current technical context) ===\n{json.dumps(state, ensure_ascii=False)}\n"


async def schedule_update(chat_id: str, sliding_messages: list[dict]) -> None:
    """
    Fire-and-forget: call this as a BackgroundTask every 10 messages.

    `sliding_messages` — the messages that are about to leave the active
    window (i.e. the oldest ~10 turns from history).
    """
    if not sliding_messages:
        return
    asyncio.create_task(_update_state(chat_id, sliding_messages))


async def _update_state(chat_id: str, sliding_messages: list[dict]) -> None:
    async with _lock(chat_id):
        current_state = _load(chat_id)

        # Format the sliding messages for the LLM
        turns_text = "\n".join(
            f"{m['role'].upper()}: {m['content']}"
            for m in sliding_messages
            if isinstance(m.get("content"), str)
        )

        user_prompt = (
            f"Current state:\n{json.dumps(current_state, ensure_ascii=False)}\n\n"
            f"New messages to process:\n{turns_text}\n\n"
            "Return the updated JSON state object."
        )

        try:
            response = await client.chat.completions.create(
                model=_STATE_MODEL,
                max_tokens=_MAX_STATE_TOKENS,
                messages=[
                    {"role": "system", "content": _UPDATE_SYSTEM_PROMPT},
                    {"role": "user",   "content": user_prompt},
                ],
            )
            raw = response.choices[0].message.content.strip()

            # Strip markdown fences if the model adds them anyway
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            new_state = json.loads(raw)
            _save(chat_id, new_state)
            print(f"[SessionState] Updated state for chat '{chat_id}': {new_state}")

        except json.JSONDecodeError as e:
            print(f"[SessionState] LLM returned invalid JSON for chat '{chat_id}': {e}")
        except Exception as e:
            print(f"[SessionState] State update failed for chat '{chat_id}': {e}")


def delete_state(chat_id: str) -> None:
    """Call this when a chat session is fully deleted."""
    p = _state_path(chat_id)
    if p.exists():
        p.unlink()
        print(f"[SessionState] Deleted state for chat '{chat_id}'")