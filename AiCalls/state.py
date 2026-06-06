import asyncio
from dataclasses import dataclass, field
from typing import Optional, Any

@dataclass
class StreamState:
    active: bool = True
    raw_stream: Optional[Any] = None
    completion_task: Optional[asyncio.Task] = None
    tool_tasks: list[asyncio.Task] = field(default_factory=list)
    
active_streams: dict[str, StreamState] = {}