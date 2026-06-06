# tool_manager.py

from langchain_core.utils.function_calling import convert_to_openai_tool
from tools.scrap_url import scrape_url
from tools.deep_research import deep_research

# ── Tool registry ─────────────────────────────────────────────────────────────
tools = [deep_research, scrape_url]
_tool_map: dict = {t.name: t for t in tools}


# ── Public API (same contract as before) ──────────────────────────────────────

def get_schemas() -> list[dict]:
    """Return OpenAI-format function schemas for all registered tools."""
    schemas = []
    for tool_obj in tools:
        try:
            schemas.append(convert_to_openai_tool(tool_obj))
        except Exception as e:
            print(f"[ToolManager] Schema error for '{tool_obj}': {e}")
    return schemas


async def execute(tool_name: str, args: dict):
    """
    Directly invoke a tool by name.

    FIX: The original version was identical but lived inside a module that also
    built a LangGraph at import time — which called ChatOpenAI() synchronously
    and registered a MemorySaver, causing import-time side-effects and an event-
    loop conflict when the first streaming request came in.
    """
    tool_obj = _tool_map.get(tool_name)
    if tool_obj is None:
        raise ValueError(f"Tool '{tool_name}' not found. Available: {list(_tool_map)}")
    return await tool_obj.ainvoke(args)