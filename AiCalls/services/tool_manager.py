from langchain_openai import ChatOpenAI # type: ignore
from langgraph.prebuilt import create_react_agent # type: ignore
from langgraph.checkpoint.memory import MemorySaver # type: ignore
from tools.deep_research import deep_research
import config

tools = [deep_research]

llm = ChatOpenAI(
    base_url=config.LLM_API,
    api_key=config.LLM_SECRET,
    model=config.LLM_MODEL,
    temperature=0
)

tool_manager = create_react_agent(
    model=llm,
    tools=tools,
    prompt=config.SYSTEM_PROMPT,
    checkpointer=MemorySaver()
)

async def run_agent(user_query: str, thread_id: str = "default"):
    inputs = {"messages": [("user", user_query)]}
    config_dict = {"configurable": {"thread_id": thread_id}}
    
    event = None
    async for event in tool_manager.astream(inputs, config=config_dict, stream_mode="updates"):
        for node, state in event.items():
            print(f"\n[{node}]")
            state["messages"][-1].pretty_print()

    if not event:
        return "Agent returned no response."

    last_content = event[next(iter(event))]["messages"][-1].content
    return last_content if isinstance(last_content, str) else str(last_content)

def get_schemas():
    """Return JSON schemas for all registered tools for OpenAI function calling."""
    from langchain_core.utils.function_calling import convert_to_openai_tool
    return [convert_to_openai_tool(tool) for tool in tools]

async def execute(tool_name: str, args: dict):
    """Execute a registered tool by its name."""
    for t in tools:
        if t.name == tool_name:
            return await t.ainvoke(args)
    raise ValueError(f"Tool {tool_name} not found.")