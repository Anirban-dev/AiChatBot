# tool_manager.py

from langchain_core.utils.function_calling import convert_to_openai_tool
from tools.scrap_url import scrape_url
from tools.web_search import web_search
from tools.vector_db_search import vector_db_tool

# ── Tool registry ─────────────────────────────────────────────────────────────
_base_tools = [web_search, scrape_url]
_tool_map: dict = {t.name: t for t in _base_tools}
# Add vector DB tool but track separately for conditional availability
_vector_db_tool = vector_db_tool
_tool_map[_vector_db_tool.name] = _vector_db_tool


# ── Public API (same contract as before) ──────────────────────────────────────

def get_schemas(mode: str = 'large') -> list[dict]:
    """
    Return OpenAI-format function schemas for available tools based on mode.
    
    Args:
        mode: The current mode ('small', 'large', 'thinking', 'critiq')
              Vector DB is available for 'large', 'thinking' and 'critiq' modes
    """
    schemas = []
    available_tools = _base_tools.copy()
    
    # Vector DB is available for large, thinking, and critiq modes
    if mode in ('large', 'thinking', 'critiq'):
        available_tools.append(_vector_db_tool)
        print(f"[ToolManager] Vector DB tool enabled for mode: {mode}")
    else:
        print(f"[ToolManager] Vector DB tool disabled for mode: {mode}")
    
    for tool_obj in available_tools:
        try:
            schemas.append(convert_to_openai_tool(tool_obj))
        except Exception as e:
            print(f"[ToolManager] Schema error for '{tool_obj}': {e}")
    
    return schemas


def get_tools(mode: str = 'large') -> dict:
    """
    Get the available tools map for the current mode.
    
    Args:
        mode: The current mode ('small', 'large', 'thinking', 'critiq')
    """
    available_tools = _tool_map.copy()
    
    # Remove vector DB tool for small mode
    if mode == 'small':
        available_tools.pop(_vector_db_tool.name, None)
    
    return available_tools


async def execute(tool_name: str, args: dict):
    """
    Directly invoke a tool by name.
    
    Args:
        tool_name: The name of the registered tool to call
        args: Dictionary of arguments to pass to the tool's execution function
    """
    tool_obj = _tool_map.get(tool_name)
    if tool_obj is None:
        raise ValueError(f"Tool '{tool_name}' not found. Available: {list(_tool_map)}")
    return await tool_obj.ainvoke(args)


def is_vector_db_available(mode: str) -> bool:
    """
    Check if vector DB tool is available for the given mode.
    
    Args:
        mode: The current mode ('small', 'large', 'thinking', 'critiq')
    
    Returns:
        True if vector DB is available (all modes except 'small'), False otherwise
    """
    return mode in ('large', 'thinking', 'critiq')