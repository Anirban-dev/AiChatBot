import httpx  # type: ignore
from langchain_core.tools import tool  # type: ignore
from config import SEARXNG_URL

# Domains that push high-level background info instead of live/volatile numbers
STATIC_DOMAINS_TO_DEPRIORITIZE = {
    "wikipedia.org",
    "wikimedia.org",
    "wiktionary.org",
    "dictionary.com",
    "britannica.com",
}

@tool
async def web_search(query: str) -> str:
    """Search the web using SearXNG. Returns top search titles, URLs, and snippets."""

    base_url = SEARXNG_URL.rstrip("/")

    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0), follow_redirects=True) as client:
        try:
            search_res = await client.get(
                f"{base_url}/search",
                params={"q": query, "format": "json"},
                auth=("admin", "ce4r3fcq34cqvnfq33quf")
            )
            search_res.raise_for_status()
        except httpx.HTTPStatusError as e:
            return f"Search engine error: {e.response.status_code}. Check SearXNG config."
        except Exception as e:
            return f"Failed to connect to SearXNG at {base_url}. Error: {e}"

        try:
            raw_results = search_res.json().get("results", [])
        except ValueError:
            return f"SearXNG returned non-JSON format: {search_res.text[:200]}"

        if not raw_results:
            return "SearXNG returned zero search results for this query."

        # Separate static/background sites from dynamic live-data sources
        dynamic_results = []
        static_results = []

        for item in raw_results:
            url = item.get("url", "").lower()
            if any(domain in url for domain in STATIC_DOMAINS_TO_DEPRIORITIZE):
                static_results.append(item)
            else:
                dynamic_results.append(item)

        # Re-rank: prioritize dynamic live sources first, expanding capacity to top 10
        prioritized_results = (dynamic_results + static_results)[:10]

        search_output = []
        for idx, item in enumerate(prioritized_results, 1):
            title = item.get("title", "No Title")
            url = item.get("url", "")
            snippet = item.get("content", "No snippet available.").strip()

            search_output.append(
                f"{idx}. Title: {title}\n"
                f"   URL: {url}\n"
                f"   Snippet: {snippet}"
            )

        return "\n\n".join(search_output)