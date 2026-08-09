"""
Vector DB Search Tool

This tool searches the uploaded documents in the conversation's vector store.
Only available for 'large' and above models where vector DB is enabled.
"""

from langchain_core.tools import tool
from typing import Any, Optional
import logging

_log = logging.getLogger("vector_db_tool")

@tool
async def vector_db_search(
    query: str,
    chat_id: Optional[str] = None,
    k: int = 4,
    active_path: Optional[list] = None
) -> str:
    """Search through uploaded documents in the current conversation.
    
    Use this when you need information from files that were uploaded in this chat.
    Searches are constrained to the active conversation path.
    Only use this tool when the user has uploaded relevant documents.
    
    Args:
        query: The search query string
        chat_id: The current chat ID
        k: Number of top results to return (default: 4)
        active_path: List of messages in the active conversation path (auto-injected by system)
    
    Returns:
        A formatted string containing the search results
    """
    try:
        from services.vector_store import search as vector_store_search
        
        # Import embeddings for validation
        from services.embeddings import get_embeddings
        
        # Check if embeddings are available
        embeddings = get_embeddings()
        
        # Perform vector search using vector_store for optimized top-2 retrieval
        results = await vector_store_search(
            query=query,
            chat_id=chat_id,
            k=min(k, 2)
        )
        
        if not results:
            return "No relevant documents found in the uploaded files for this chat."
        
        # Format results (compact to minimize context window & RAM overhead on CPU)
        formatted = []
        formatted.append(f"Found {len(results)} relevant snippet(s):")
        
        for i, doc in enumerate(results, 1):
            metadata = doc.metadata or {}
            page_content = doc.page_content[:350] + "..." if len(doc.page_content) > 350 else doc.page_content
            formatted.append(f"[{i}] Source: {metadata.get('source', 'Unknown')} | Content:\n{page_content}")
        
        return "\n\n".join(formatted)
        
    except Exception as e:
        _log.error(f"Vector DB search error: {e}")
        return f"Error searching vector database: {str(e)}"

# Create an alias to match the import in tool_manager.py
vector_db_tool = vector_db_search
