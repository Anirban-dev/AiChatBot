from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, MessagesState, START
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.utils.function_calling import convert_to_openai_tool
from langchain_core.messages import SystemMessage
from tools.scrap_url import scrape_url
from tools.deep_research import deep_research
from lib.litellm_config import router

tools = [deep_research, scrape_url]

TOOL_SYSTEM_PROMPT = """
TOOL: url_scrape
─────────────────────────────────────────────────────
Fetches content from a single URL provided by the user.

RULES:
1. Call ONCE per request. No retries, no chaining.
2. If fetch fails, tell the user and stop. Do not try another URL.
3. Return only content relevant to the question. No raw HTML dumps.
4. Do not follow links inside the fetched page unless user asks.
5. Keep response under 300 words unless asked for more.


TOOL: deep_research
─────────────────────────────────────────────────────
Searches the web across multiple sources to research a topic.
Use when no specific URL is given and broad information is needed.

RULES:
1. Plan first. Use a maximum of 3 sources. Never exceed 5.
2. Stop fetching the moment the question is answered. Don't over-fetch.
3. Never re-fetch a URL already visited in the same request.
4. Failed sources count toward the cap. Do not retry them.
5. Respond with one combined summary, sources listed at the end.
6. Keep response under 500 words unless user asks for a full report.
"""


class LiteLLMClientAdapter:
    def __init__(self, router_instance):
        self.completions = router_instance

llm = ChatOpenAI(
    model="lowllm",
    client=LiteLLMClientAdapter(router),
    async_client=LiteLLMClientAdapter(router),
    temperature=0
)

# ── Graph nodes ──────────────────────────────────────────
def call_model(state: MessagesState):
    messages = [SystemMessage(content=TOOL_SYSTEM_PROMPT)] + state["messages"]
    response = llm.bind_tools(tools).invoke(messages)
    return {"messages": [response]}

tool_node = ToolNode(tools)

# ── Build graph ───────────────────────────────────────────
graph = StateGraph(MessagesState)
graph.add_node("agent", call_model)
graph.add_node("tools", tool_node)
graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", tools_condition)
graph.add_edge("tools", "agent")

tool_manager = graph.compile(checkpointer=MemorySaver())

# ── Run ───────────────────────────────────────────────────
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

# ── Helpers ───────────────────────────────────────────────
def get_schemas():
    schemas = []
    for tool_obj in tools:
        try:
            schema = convert_to_openai_tool(tool_obj)
            schemas.append(schema)
        except Exception as e:
            print(f"Error converting tool {tool_obj}: {e}")
    return schemas

async def execute(tool_name: str, args: dict):
    for t in tools:
        if t.name == tool_name:
            return await t.ainvoke(args)
    raise ValueError(f"Tool {tool_name} not found.")