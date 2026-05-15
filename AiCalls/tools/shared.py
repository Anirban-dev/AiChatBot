import re
from config import REDIS_URL
from services.vision import describe_image
import httpx # type: ignore
import redis.asyncio as aioredis # type: ignore

cache = aioredis.from_url(
    REDIS_URL, 
    decode_responses=True,
    encoding="utf-8"
)

MAX_CONTENT_CHARS = 3000
MAX_IMAGES_PER_PAGE = 2
VOLATILE_PATTERNS = [
    # finance
    r'finance\.yahoo\.com', r'bloomberg\.com', r'reuters\.com/markets',
    r'cnbc\.com', r'marketwatch\.com', r'investing\.com',
    r'coinbase\.com', r'binance\.com', r'coingecko\.com',
    r'tradingview\.com',

    # news (changes every hour)
    r'bbc\.com/news', r'cnn\.com', r'theguardian\.com',
    r'nytimes\.com', r'apnews\.com', r'techcrunch\.com',
    r'theverge\.com', r'wired\.com',

    # weather
    r'weather\.com', r'accuweather\.com', r'windy\.com',

    # social / live feeds
    r'twitter\.com', r'x\.com', r'reddit\.com',
    r'news\.ycombinator\.com',

    # sports
    r'espn\.com', r'sports\.yahoo\.com',

    # job boards (change daily)
    r'linkedin\.com/jobs', r'indeed\.com', r'glassdoor\.com',
]

def is_volatile(url: str) -> bool:
    return any(re.search(p, url) for p in VOLATILE_PATTERNS)


def is_pdf(url: str) -> bool:
    return url.lower().endswith(".pdf")


def extract_image_urls(markdown: str) -> list[str]:
    return re.findall(r'!\[.*?\]\((https?://[^\)]+)\)', markdown)


async def analyze_page_images(client: httpx.AsyncClient, image_urls: list[str]) -> str:
    descriptions = []
    for url in image_urls[:MAX_IMAGES_PER_PAGE]:
        try:
            r = await client.get(url, timeout=10)
            r.raise_for_status()
            media_type = r.headers.get("content-type", "image/jpeg").split(";")[0]
            if not media_type.startswith("image/"):
                continue
            desc = describe_image(r.content, media_type)  # your function
            descriptions.append(f"[Image at {url}]: {desc}")
        except Exception:
            pass
    return "\n".join(descriptions)


async def firecrawl_scrape(client: httpx.AsyncClient, url: str) -> str:
    res = await client.post(
        "http://localhost:3002/v1/scrape",
        json={"url": url, "formats": ["markdown"]}
    )
    res.raise_for_status()
    content = res.json().get("data", {}).get("markdown", "")
    return content[:MAX_CONTENT_CHARS] or "No content found."