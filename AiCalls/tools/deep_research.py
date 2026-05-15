import httpx # type: ignore
from tools.shared import (
    cache, is_volatile, firecrawl_scrape, extract_image_urls,
    analyze_page_images, is_pdf
)
from langchain_core.tools import tool # type: ignore

@tool
async def deep_research(query: str) -> str:
    """Search the web and scrape top results for a query. Use for open-ended research questions."""

    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:

        search_res = await client.get(
            "http://localhost:8888/search",
            params={"q": query, "format": "json"}
        )
        search_res.raise_for_status()
        results = search_res.json().get("results", [])[:3]

        research_data = []

        for item in results:
            url = item.get("url", "")
            if not url:
                continue

            volatile = is_volatile(url)

            if not volatile:
                cached = await cache.get(url)
                if cached:
                    research_data.append(f"Source: {url}\nContent: {cached}")
                    continue

            try:
                content = await firecrawl_scrape(client, url)
            except Exception as e:
                research_data.append(f"Source: {url}\nContent: Failed to scrape: {e}")
                continue

            image_desc = ""
            if not is_pdf(url):
                img_urls = extract_image_urls(content)
                if img_urls:
                    image_desc = await analyze_page_images(client, img_urls)

            full = content + (f"\n\nImages:\n{image_desc}" if image_desc else "")

            if not is_volatile:
                await cache.setex(url, 86400, full)

            research_data.append(f"Source: {url}\nContent: {full}")

    return "\n---\n".join(research_data) if research_data else "No results found."