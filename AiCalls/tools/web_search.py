import httpx # type: ignore
from tools.shared import (
    is_volatile, firecrawl_scrape, extract_image_urls,
    analyze_page_images, is_pdf
)
from langchain_core.tools import tool # type: ignore
from lib.redis import redis as cache
from config import SEARXNG_URL

@tool
async def web_search(query: str) -> str:
    """Search the web and scrape top results for a query. Use for open-ended research questions."""

    base_url = SEARXNG_URL.rstrip("/")

    # CRITICAL: Added follow_redirects=True to match curl's "-L" flag
    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0), follow_redirects=True) as client:
        try:
            search_res = await client.get(
                f"{base_url}/search",
                params={"q": query, "format": "json"},
                auth=("admin", "ce4r3fcq34cqvnfq33quf") # CRITICAL: Added the "-u" credentials
            )
            search_res.raise_for_status()
        except httpx.HTTPStatusError as e:
            return f"Search engine error: {e.response.status_code}. Did you enable JSON format in SearXNG settings.yml?"
        except Exception as e:
            return f"Failed to connect to SearXNG at {base_url}. Error: {e}"

        try:
            results = search_res.json().get("results", [])[:3]
            print(f"DEBUG: SearXNG successfully found {len(results)} links!")
            for r in results:
                print(f"DEBUG Link: {r.get('url')}")
        except ValueError:
            return f"SearXNG did not return JSON. It returned: {search_res.text[:200]}"

        # If SearXNG returned nothing at all due to engine dropouts
        if not results:
            return "SearXNG returned zero search results for this query."

        research_data = []

        for item in results:
            url = item.get("url", "")
            if not url: continue

            # Extract the raw snippet SearXNG already scraped from the engine search cards
            searxng_snippet = item.get("content", "No snippet preview available from search engine.")

            volatile = is_volatile(url)
            if not volatile:
                cached = await cache.get(url)
                if cached:
                    research_data.append(f"Source: {url}\nContent: {cached}")
                    continue

            # Core Scraping Flow with Dynamic Failback
            is_fallback_used = False
            try:
                content = await firecrawl_scrape(client, url)
                
                # Check if Firecrawl returned empty text or was successfully blocked by a basic 403/CAPTCHA wall
                if not content or len(content.strip()) < 50:
                    print(f"DEBUG: Firecrawl returned empty or blocked body for {url}. Using SearXNG fallback.")
                    content = f"[Scrape Blocked - Showing Preview]: {searxng_snippet}"
                    is_fallback_used = True
            except Exception as e:
                # FALLBACK CRITICAL FIX: If Firecrawl crashes, immediately swap in the search snippet
                print(f"DEBUG: Firecrawl failed on {url} ({e}). Falling back to SearXNG snippet.")
                content = f"[Scrape Failed - Showing Preview]: {searxng_snippet}"
                is_fallback_used = True

            # Image processing (only run if Firecrawl actually succeeded; skip if we used the snippet fallback)
            image_desc = ""
            if not is_fallback_used and not is_pdf(url):
                img_urls = extract_image_urls(content)
                if img_urls:
                    image_desc = await analyze_page_images(client, img_urls)

            full = content + (f"\n\nImages:\n{image_desc}" if image_desc else "")

            # Cache the result only if it's not a volatile source and we didn't use a degraded fallback snippet
            if not volatile and not is_fallback_used:
                await cache.setex(url, 86400, full)

            research_data.append(f"Source: {url}\nContent: {full}")

    return "\n---\n".join(research_data) if research_data else "No results found."