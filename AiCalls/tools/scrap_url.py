import re
import urllib.parse
from urllib.parse import urlparse, unquote
import httpx  # type: ignore
from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
from langchain_core.tools import tool  # type: ignore

from lib.redis import redis as cache
from services.vision import describe_image
from config import CRAWL4AI_URL, CRAWL4AI_API_TOKEN

MAX_CONTENT_CHARS = 3000
MAX_IMAGES_PER_PAGE = 2

VOLATILE_DOMAINS = {
    # Global Finance & Markets
    "finance.yahoo.com", "bloomberg.com", "reuters.com", "cnbc.com",
    "marketwatch.com", "investing.com", "coinbase.com", "binance.com",
    "coingecko.com", "tradingview.com",
    
    # Indian Financial & Stock Portals
    "groww.in", "nseindia.com", "bseindia.com", "moneycontrol.com",
    "icicidirect.com", "screener.in", "economictimes.indiatimes.com",
    "livemint.com", "sharekhan.com", "hdfcsec.com", "axisdirect.in",
    
    # News & Tech
    "bbc.com", "cnn.com", "theguardian.com", "nytimes.com", "apnews.com",
    "techcrunch.com", "theverge.com", "wired.com", "weather.com",
    "accuweather.com", "windy.com",
    
    # Social & Community
    "twitter.com", "x.com", "reddit.com", "news.ycombinator.com",
    "espn.com", "sports.yahoo.com", "linkedin.com", "indeed.com",
    "glassdoor.com",
}

def is_volatile(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower().split(":")[0]
        return any(host == domain or host.endswith("." + domain) for domain in VOLATILE_DOMAINS)
    except Exception:
        return False

def is_pdf(url: str) -> bool:
    return urlparse(url).path.lower().endswith(".pdf")

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
            desc = await describe_image(r.content, media_type)
            descriptions.append(f"[Image at {url}]: {desc}")
        except Exception:
            pass
    return "\n".join(descriptions)

async def crawl4ai_scrape(client: httpx.AsyncClient, url: str) -> str:
    """Scrape web page content using unclecode/crawl4ai REST API container."""
    base_url = CRAWL4AI_URL.rstrip("/")
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {CRAWL4AI_API_TOKEN}",
    }

    async def _extract_content(data: dict | list) -> str:
        """Extract markdown content from various crawl4ai response shapes.
        
        crawl4ai 0.9+ returns `markdown` as a MarkdownGenerationResult dict
        (keys: raw_markdown, fit_markdown, markdown_with_citations) rather than
        a plain string. This function handles both old and new formats.
        """
        if isinstance(data, list) and len(data) > 0:
            data = data[0]
        if isinstance(data, dict):
            # Unwrap nested result/results fields
            if "results" in data and isinstance(data["results"], list) and len(data["results"]) > 0:
                data = data["results"][0]
            elif "result" in data and isinstance(data["result"], dict):
                data = data["result"]

            # crawl4ai 0.9+: markdown is a MarkdownGenerationResult dict
            markdown = data.get("markdown", "")
            if isinstance(markdown, dict):
                # Prefer fit_markdown (cleaned), fall back to raw_markdown
                markdown = (
                    markdown.get("fit_markdown", "")
                    or markdown.get("raw_markdown", "")
                    or markdown.get("markdown_with_citations", "")
                    or ""
                )
            if not isinstance(markdown, str):
                markdown = ""

            cleaned_html = data.get("cleaned_html", "") or ""
            if not isinstance(cleaned_html, str):
                cleaned_html = ""

            return markdown or cleaned_html or ""
        return ""

    try:
        # ── Strategy 1: synchronous crawl endpoint ────────────────────────────
        res = await client.post(
            f"{base_url}/crawl/sync",
            headers=headers,
            json={"urls": [url], "priority": 10},
        )

        if res.status_code == 200:
            content = await _extract_content(res.json())
            return content[:MAX_CONTENT_CHARS] or "No readable text content extracted."

        # ── Strategy 2: async /crawl with task polling ────────────────────────
        if res.status_code in (404, 405):
            res = await client.post(
                f"{base_url}/crawl",
                headers=headers,
                json={"urls": [url], "priority": 10},
            )

        if res.status_code == 200:
            data = res.json()
            # If crawl4ai returns a task_id we need to poll for the result
            task_id = data.get("task_id") if isinstance(data, dict) else None
            if task_id:
                import asyncio
                for _ in range(20):           # poll up to 20×0.5s = 10 seconds
                    await asyncio.sleep(0.5)
                    poll = await client.get(
                        f"{base_url}/task/{task_id}",
                        headers=headers,
                    )
                    if poll.status_code == 200:
                        poll_data = poll.json()
                        status = poll_data.get("status", "")
                        if status == "completed":
                            content = await _extract_content(poll_data)
                            return content[:MAX_CONTENT_CHARS] or "No readable text content extracted."
                        if status == "failed":
                            raise Exception(f"Crawl task failed: {poll_data.get('error', 'unknown error')}")
                raise Exception("Crawl task timed out after 10 seconds")
            else:
                # Response was immediate (no task_id)
                content = await _extract_content(data)
                return content[:MAX_CONTENT_CHARS] or "No readable text content extracted."

        # ── Strategy 3: legacy /scrape endpoint (older crawl4ai builds) ───────
        res = await client.post(
            f"{base_url}/scrape",
            headers=headers,
            json={"url": url},
        )
        if res.status_code != 200:
            raise Exception(f"HTTP {res.status_code}: {res.text[:200]}")

        content = await _extract_content(res.json())
        return content[:MAX_CONTENT_CHARS] or "No readable text content extracted."

    except Exception as e:
        raise Exception(f"Crawl4AI extraction error: {e}")
    
    
# ── Specialized Site Handlers ─────────────────────────────────────────────

async def _github(client: httpx.AsyncClient, url: str) -> str | None:
    gh = re.search(r'github\.com/([^/]+)/([^/]+)', url)
    if not gh: return None
    owner, repo = gh.group(1), gh.group(2).removesuffix(".git")
    try:
        meta_res = await client.get(f"https://api.github.com/repos/{owner}/{repo}", headers={"Accept": "application/vnd.github+json"})
        meta_res.raise_for_status()
        meta = meta_res.json()

        readme_res = await client.get(f"https://api.github.com/repos/{owner}/{repo}/readme", headers={"Accept": "application/vnd.github.raw+json"})
        readme = readme_res.text[:MAX_CONTENT_CHARS] if readme_res.status_code == 200 else "No README."

        return (
            f"Repo: {meta.get('full_name')}\n"
            f"Description: {meta.get('description', 'N/A')}\n"
            f"Stars: {meta.get('stargazers_count')} | Forks: {meta.get('forks_count')} | Language: {meta.get('language', 'N/A')}\n"
            f"Topics: {', '.join(meta.get('topics', [])) or 'N/A'}\n"
            f"License: {(meta.get('license') or {}).get('name', 'N/A')}\n\n"
            f"README:\n{readme}"
        )
    except Exception:
        return None

async def _reddit(client: httpx.AsyncClient, url: str) -> str | None:
    if "reddit.com" not in url: return None
    try:
        clean_url = url.split("?")[0].rstrip("/")
        res = await client.get(clean_url + ".json", headers={"User-Agent": "research-agent/1.0"})
        res.raise_for_status()
        data = res.json()
        post = data[0]["data"]["children"][0]["data"]
        comments_raw = data[1]["data"]["children"]

        def extract_comments(children, depth=0, limit=10) -> list[str]:
            out = []
            for child in children[:limit]:
                c = child.get("data", {})
                body = c.get("body", "")
                if not body or body == "[deleted]": continue
                out.append(f"{'  ' * depth}- {body[:300]}")
                replies = c.get("replies", {})
                if isinstance(replies, dict):
                    out.extend(extract_comments(replies.get("data", {}).get("children", []), depth + 1, 5))
            return out

        return (
            f"Title: {post.get('title')}\nSubreddit: r/{post.get('subreddit')}\n"
            f"Score: {post.get('score')} | Comments: {post.get('num_comments')}\nAuthor: u/{post.get('author')}\n\n"
            f"Post:\n{post.get('selftext', post.get('url', ''))[:MAX_CONTENT_CHARS]}\n\n"
            f"Top Comments:\n" + "\n".join(extract_comments(comments_raw))
        )
    except Exception:
        return None

async def _wikipedia(client: httpx.AsyncClient, url: str) -> str | None:
    if "wikipedia.org" not in url: return None
    try:
        path = urlparse(url).path
        title = unquote(path.rsplit("/wiki/", 1)[-1])
        lang = urlparse(url).hostname.split(".")[0]
        headers = {"User-Agent": "ResearchAgent/1.0 (contact@example.com)"}

        summary_res = await client.get(f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}", headers=headers)
        summary_res.raise_for_status()
        summary = summary_res.json()

        sections_res = await client.get(f"https://{lang}.wikipedia.org/api/rest_v1/page/mobile-sections/{title}", headers=headers)
        body_text = ""
        if sections_res.status_code == 200:
            for section in sections_res.json().get("remaining", {}).get("sections", [])[:5]:
                text = re.sub(r'<[^>]+>', '', section.get("text", ""))[:500]
                body_text += f"\n## {section.get('line', '')}\n{text}"

        return f"Title: {summary.get('title')}\nDescription: {summary.get('description', '')}\n\nSummary:\n{summary.get('extract', '')}\n{body_text[:MAX_CONTENT_CHARS]}"
    except Exception:
        return None

async def _youtube(client: httpx.AsyncClient, url: str) -> str | None:
    """
    Returns content for YouTube URLs. Always returns a non-None string for any
    YouTube URL so the crawl4ai fallback is never triggered (crawl4ai cannot
    scrape YouTube and will error with cryptic slice exceptions).
    """
    if "youtube.com" not in url and "youtu.be" not in url: return None
    try:
        match = re.search(r'(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})', url)
        if not match:
            return f"Could not extract a video ID from the YouTube URL: {url}"
        vid = match.group(1)
        is_short = "/shorts/" in url

        video_title = "Unknown Title"
        try:
            meta_res = await client.get(
                f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json",
                timeout=5.0,
            )
            if meta_res.status_code == 200:
                video_title = meta_res.json().get("title", "Unknown Title")
        except Exception:
            pass

        import asyncio
        try:
            transcript_list = await asyncio.to_thread(YouTubeTranscriptApi.get_transcript, vid)
            transcript = " ".join(t["text"] for t in transcript_list)
            return (
                f"Title: {video_title}\n"
                f"YouTube {'Short' if is_short else 'Video'} ID: {vid}\n"
                f"URL: {url}\n\nTranscript:\n{transcript[:MAX_CONTENT_CHARS]}"
            )
        except Exception as transcript_err:
            # Transcript unavailable (disabled captions, Shorts restriction, etc.)
            # Still return a meaningful response so crawl4ai is NOT invoked.
            return (
                f"Title: {video_title}\n"
                f"YouTube {'Short' if is_short else 'Video'} ID: {vid}\n"
                f"URL: {url}\n\n"
                f"Transcript unavailable: {transcript_err}\n"
                f"This video does not have accessible captions/subtitles."
            )
    except Exception:
        # Even on total failure, return a string to block crawl4ai fallback
        return f"Could not retrieve YouTube content for: {url}"

async def _arxiv(client: httpx.AsyncClient, url: str) -> str | None:
    if "arxiv.org" not in url: return None
    try:
        match = re.search(r'arxiv\.org/(?:abs|pdf)/([0-9]+\.[0-9]+|[a-z\-]+/[0-9]+)', url)
        if not match: return None
        paper_id = match.group(1)
        res = await client.get(f"https://export.arxiv.org/api/query?id_list={paper_id}")
        res.raise_for_status()

        entry = res.text
        title = re.search(r'<title>(.*?)</title>', entry, re.DOTALL)
        summary = re.search(r'<summary>(.*?)</summary>', entry, re.DOTALL)
        authors = re.findall(r'<name>(.*?)</name>', entry)
        published = re.search(r'<published>(.*?)</published>', entry)

        return (
            f"arXiv ID: {paper_id}\nTitle: {title.group(1).strip() if title else 'N/A'}\n"
            f"Authors: {', '.join(authors)}\nPublished: {published.group(1)[:10] if published else 'N/A'}\n"
            f"PDF: https://arxiv.org/pdf/{paper_id}\n\nAbstract:\n{summary.group(1).strip() if summary else 'N/A'}"
        )
    except Exception:
        return None

async def _hackernews(client: httpx.AsyncClient, url: str) -> str | None:
    if "news.ycombinator.com" not in url: return None
    try:
        match = re.search(r'id=(\d+)', url)
        if not match: return None
        item_id = match.group(1)
        res = await client.get(f"https://hacker-news.firebaseio.com/v0/item/{item_id}.json")
        res.raise_for_status()
        post = res.json()

        comments = []
        for cid in post.get("kids", [])[:10]:
            c = (await client.get(f"https://hacker-news.firebaseio.com/v0/item/{cid}.json")).json()
            if c and "text" in c:
                text = re.sub(r'<[^>]+>', '', c.get("text", ""))
                if text: comments.append(f"- {text[:300]}")

        return f"Title: {post.get('title')}\nURL: {post.get('url', 'N/A')}\nScore: {post.get('score')} | By: {post.get('by')}\nComments: {post.get('descendants', 0)}\n\nTop Comments:\n" + "\n".join(comments)
    except Exception:
        return None

async def _stackoverflow(client: httpx.AsyncClient, url: str) -> str | None:
    if "stackoverflow.com" not in url: return None
    try:
        match = re.search(r'/questions/(\d+)', url)
        if not match: return None
        q_id = match.group(1)
        q_res = await client.get(f"https://api.stackexchange.com/2.3/questions/{q_id}", params={"site": "stackoverflow", "filter": "withbody"})
        question = q_res.json()["items"][0]

        a_res = await client.get(f"https://api.stackexchange.com/2.3/questions/{q_id}/answers", params={"site": "stackoverflow", "filter": "withbody", "sort": "votes", "pagesize": 3})
        answers = a_res.json().get("items", [])

        def strip(html: str) -> str: return re.sub(r'<[^>]+>', '', html)[:500]

        answers_text = "\n\n".join(f"Answer (votes: {a.get('score')}):\n{strip(a.get('body', ''))}" for a in answers)

        return f"Question: {question.get('title')}\nTags: {', '.join(question.get('tags', []))}\nScore: {question.get('score')} | Views: {question.get('view_count')}\n\nQuestion Body:\n{strip(question.get('body', ''))}\n\nTop Answers:\n{answers_text}"
    except Exception:
        return None


# ── Main Tool Definition ──────────────────────────────────────────────────

@tool
async def scrape_url(url: str) -> str:
    """Scrape full content from a URL using specialized API handlers or Crawl4AI."""

    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0)) as client:

        # Cache check (Only use cache if NOT a volatile URL)
        volatile = is_volatile(url)
        if not volatile:
            cached = await cache.get(url)
            if cached:
                return f"Source: {url}\nContent: {cached}"

        # Try specialized site handlers first
        result = (
            await _github(client, url)
            or await _reddit(client, url)
            or await _wikipedia(client, url)
            or await _youtube(client, url)
            or await _arxiv(client, url)
            or await _hackernews(client, url)
            or await _stackoverflow(client, url)
        )

        # Fallback to Crawl4AI REST container
        if not result:
            try:
                content = await crawl4ai_scrape(client, url)
            except Exception as e:
                return f"Failed to scrape {url}: {e}. DO NOT RETRY this URL."

            image_desc = ""
            if not is_pdf(url):
                img_urls = extract_image_urls(content)
                if img_urls:
                    image_desc = await analyze_page_images(client, img_urls)

            result = content + (f"\n\nImages:\n{image_desc}" if image_desc else "")

        # Only store non-volatile URLs in Redis cache
        if not volatile:
            await cache.setex(url, 86400, result)

        return f"Source: {url}\nContent: {result}"