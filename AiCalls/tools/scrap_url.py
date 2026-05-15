import re
import httpx # type: ignore
from urllib.parse import urlparse
from youtube_transcript_api import YouTubeTranscriptApi # type: ignore
from tools.shared import (
    cache, firecrawl_scrape, extract_image_urls,
    analyze_page_images, is_pdf, MAX_CONTENT_CHARS
)


# ── site handlers ─────────────────────────────────────────────────────────

async def _github(client: httpx.AsyncClient, url: str) -> str | None:
    gh = re.match(r'https?://github\.com/([^/]+/[^/]+?)(?:\.git)?/?$', url)
    if not gh:
        return None
    repo = gh.group(1)
    try:
        meta_res = await client.get(
            f"https://api.github.com/repos/{repo}",
            headers={"Accept": "application/vnd.github+json"}
        )
        meta_res.raise_for_status()
        meta = meta_res.json()

        readme_res = await client.get(
            f"https://api.github.com/repos/{repo}/readme",
            headers={"Accept": "application/vnd.github.raw+json"}
        )
        readme = readme_res.text[:MAX_CONTENT_CHARS] if readme_res.status_code == 200 else "No README."

        return (
            f"Repo: {meta.get('full_name')}\n"
            f"Description: {meta.get('description', 'N/A')}\n"
            f"Stars: {meta.get('stargazers_count')} | "
            f"Forks: {meta.get('forks_count')} | "
            f"Language: {meta.get('language', 'N/A')}\n"
            f"Topics: {', '.join(meta.get('topics', [])) or 'N/A'}\n"
            f"License: {(meta.get('license') or {}).get('name', 'N/A')}\n\n"
            f"README:\n{readme}"
        )
    except Exception:
        return None


async def _reddit(client: httpx.AsyncClient, url: str) -> str | None:
    if "reddit.com" not in url:
        return None
    try:
        json_url = url.rstrip("/") + ".json"
        res = await client.get(
            json_url,
            headers={"User-Agent": "research-agent/1.0"}
        )
        res.raise_for_status()
        data = res.json()

        post = data[0]["data"]["children"][0]["data"]
        comments_raw = data[1]["data"]["children"]

        def extract_comments(children, depth=0, limit=10) -> list[str]:
            out = []
            for child in children[:limit]:
                c = child.get("data", {})
                body = c.get("body", "")
                if not body or body == "[deleted]":
                    continue
                indent = "  " * depth
                out.append(f"{indent}- {body[:300]}")
                replies = c.get("replies", {})
                if isinstance(replies, dict):
                    sub = replies.get("data", {}).get("children", [])
                    out.extend(extract_comments(sub, depth + 1, 5))
            return out

        comments = extract_comments(comments_raw)

        return (
            f"Title: {post.get('title')}\n"
            f"Subreddit: r/{post.get('subreddit')}\n"
            f"Score: {post.get('score')} | Comments: {post.get('num_comments')}\n"
            f"Author: u/{post.get('author')}\n\n"
            f"Post:\n{post.get('selftext', post.get('url', ''))[:MAX_CONTENT_CHARS]}\n\n"
            f"Top Comments:\n" + "\n".join(comments)
        )
    except Exception:
        return None


async def _wikipedia(client: httpx.AsyncClient, url: str) -> str | None:
    if "wikipedia.org" not in url:
        return None
    try:
        # extract article title from url
        title = url.rstrip("/").split("/wiki/")[-1]
        lang = urlparse(url).hostname.split(".")[0]  # e.g. "en", "fr"

        summary_res = await client.get(
            f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}"
        )
        summary_res.raise_for_status()
        summary = summary_res.json()

        sections_res = await client.get(
            f"https://{lang}.wikipedia.org/api/rest_v1/page/mobile-sections/{title}"
        )
        body_text = ""
        if sections_res.status_code == 200:
            sections = sections_res.json().get("remaining", {}).get("sections", [])
            for section in sections[:5]:  # first 5 sections
                heading = section.get("line", "")
                text = re.sub(r'<[^>]+>', '', section.get("text", ""))[:500]
                body_text += f"\n## {heading}\n{text}"

        return (
            f"Title: {summary.get('title')}\n"
            f"Description: {summary.get('description', '')}\n\n"
            f"Summary:\n{summary.get('extract', '')}\n"
            f"{body_text[:MAX_CONTENT_CHARS]}"
        )
    except Exception:
        return None


async def _youtube(url: str) -> str | None:
    if "youtube.com" not in url and "youtu.be" not in url:
        return None
    try:
        # extract video id
        vid = None
        if "youtu.be/" in url:
            vid = url.split("youtu.be/")[-1].split("?")[0]
        else:
            match = re.search(r'v=([^&]+)', url)
            if match:
                vid = match.group(1)
        if not vid:
            return None

        transcript_list = YouTubeTranscriptApi.get_transcript(vid)
        transcript = " ".join(t["text"] for t in transcript_list)

        return (
            f"YouTube Video ID: {vid}\n"
            f"URL: {url}\n\n"
            f"Transcript:\n{transcript[:MAX_CONTENT_CHARS]}"
        )
    except Exception:
        return None


async def _arxiv(client: httpx.AsyncClient, url: str) -> str | None:
    if "arxiv.org" not in url:
        return None
    try:
        # support both /abs/ and /pdf/ urls
        arxiv_id = re.search(r'arxiv\.org/(?:abs|pdf)/([^\s/]+?)(?:\.pdf)?$', url)
        if not arxiv_id:
            return None
        paper_id = arxiv_id.group(1)

        res = await client.get(
            f"https://export.arxiv.org/api/query?id_list={paper_id}"
        )
        res.raise_for_status()

        # parse the atom xml response
        entry = res.text
        title   = re.search(r'<title>(.*?)</title>', entry, re.DOTALL)
        summary = re.search(r'<summary>(.*?)</summary>', entry, re.DOTALL)
        authors = re.findall(r'<name>(.*?)</name>', entry)
        published = re.search(r'<published>(.*?)</published>', entry)

        return (
            f"arXiv ID: {paper_id}\n"
            f"Title: {title.group(1).strip() if title else 'N/A'}\n"
            f"Authors: {', '.join(authors)}\n"
            f"Published: {published.group(1)[:10] if published else 'N/A'}\n"
            f"PDF: https://arxiv.org/pdf/{paper_id}\n\n"
            f"Abstract:\n{summary.group(1).strip() if summary else 'N/A'}"
        )
    except Exception:
        return None


async def _hackernews(client: httpx.AsyncClient, url: str) -> str | None:
    if "news.ycombinator.com" not in url:
        return None
    try:
        item_id = re.search(r'id=(\d+)', url)
        if not item_id:
            return None

        res = await client.get(
            f"https://hacker-news.firebaseio.com/v0/item/{item_id.group(1)}.json"
        )
        res.raise_for_status()
        post = res.json()

        # fetch top comments
        comment_ids = post.get("kids", [])[:10]
        comments = []
        for cid in comment_ids:
            c_res = await client.get(
                f"https://hacker-news.firebaseio.com/v0/item/{cid}.json"
            )
            c = c_res.json()
            text = re.sub(r'<[^>]+>', '', c.get("text", ""))
            if text:
                comments.append(f"- {text[:300]}")

        return (
            f"Title: {post.get('title')}\n"
            f"URL: {post.get('url', 'N/A')}\n"
            f"Score: {post.get('score')} | By: {post.get('by')}\n"
            f"Comments: {post.get('descendants', 0)}\n\n"
            f"Top Comments:\n" + "\n".join(comments)
        )
    except Exception:
        return None


async def _stackoverflow(client: httpx.AsyncClient, url: str) -> str | None:
    if "stackoverflow.com" not in url:
        return None
    try:
        q_id = re.search(r'/questions/(\d+)', url)
        if not q_id:
            return None
        question_id = q_id.group(1)

        q_res = await client.get(
            f"https://api.stackexchange.com/2.3/questions/{question_id}",
            params={"site": "stackoverflow", "filter": "withbody"}
        )
        q_res.raise_for_status()
        question = q_res.json()["items"][0]

        a_res = await client.get(
            f"https://api.stackexchange.com/2.3/questions/{question_id}/answers",
            params={"site": "stackoverflow", "filter": "withbody",
                    "sort": "votes", "pagesize": 3}
        )
        a_res.raise_for_status()
        answers = a_res.json().get("items", [])

        def strip(html: str) -> str:
            return re.sub(r'<[^>]+>', '', html)[:500]

        answers_text = "\n\n".join(
            f"Answer (votes: {a.get('score')}):\n{strip(a.get('body', ''))}"
            for a in answers
        )

        return (
            f"Question: {question.get('title')}\n"
            f"Tags: {', '.join(question.get('tags', []))}\n"
            f"Score: {question.get('score')} | Views: {question.get('view_count')}\n\n"
            f"Question Body:\n{strip(question.get('body', ''))}\n\n"
            f"Top Answers:\n{answers_text}"
        )
    except Exception:
        return None


# ── main tool ─────────────────────────────────────────────────────────────

async def scrape_url(url: str) -> str:
    """Scrape any URL — webpage, PDF, GitHub, Reddit, Wikipedia, YouTube, arXiv, HN, StackOverflow."""

    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:

        # cache check
        cached = await cache.get(url)
        if cached:
            return f"Source: {url}\nContent: {cached}"

        # try each site handler in order
        result = (
            await _github(client, url)
            or await _reddit(client, url)
            or await _wikipedia(client, url)
            or await _youtube(url)
            or await _arxiv(client, url)
            or await _hackernews(client, url)
            or await _stackoverflow(client, url)
        )

        # fallback: generic firecrawl
        if not result:
            try:
                content = await firecrawl_scrape(client, url)
            except Exception as e:
                return f"Failed to scrape {url}: {e}"

            image_desc = ""
            if not is_pdf(url):
                img_urls = extract_image_urls(content)
                if img_urls:
                    image_desc = await analyze_page_images(client, img_urls)

            result = content + (f"\n\nImages:\n{image_desc}" if image_desc else "")

        await cache.setex(url, 86400, result)
        return f"Source: {url}\nContent: {result}"