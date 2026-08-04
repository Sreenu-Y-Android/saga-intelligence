"""
Political Saga RSS Scraper — adapted from Blura Engine for the Telangana political use case.
Fetches RSS feeds → filters for political/Telangana relevance → detects language + category
→ optionally generates English title/summary via Cohere → writes to MongoDB.
"""

import os
import re
import json
import time
import socket
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse
from typing import Optional, Tuple, List, Dict

import feedparser
import requests
from bs4 import BeautifulSoup

from political_config import (
    RSS_FEEDS,
    POLITICAL_RELEVANCE_KEYWORDS,
    CATEGORY_KEYWORDS,
    LOCATION_KEYWORDS,
    ANDHRA_LAT,
    ANDHRA_LNG,
)
from DB.mongo_connect import get_db
from DB.mongo_insert import upsert_article

# ── Load user-managed keywords from MongoDB ───────────────────────────────────

def load_relevance_keywords() -> List[str]:
    """Load user-managed keywords from DB. Respect disabled ones. Fall back to config if empty or error."""
    try:
        col = get_db()['rsskeywords']
        docs = list(col.find({}, {'keyword': 1, 'is_active': 1, '_id': 0}))
        if docs:
            user_active = {d['keyword'] for d in docs if d.get('is_active', True)}
            return list(user_active)
    except Exception as e:
        print(f"[WARN] Could not load keywords from DB: {e}. Using config defaults.")
    return list(POLITICAL_RELEVANCE_KEYWORDS)

# Optional Cohere — only used when COHERE_API_KEY is set in .env or .env.political
_cohere_client = None
_COHERE_KEY = os.getenv('COHERE_API_KEY', '')
if _COHERE_KEY:
    try:
        import cohere
        _cohere_client = cohere.ClientV2(_COHERE_KEY)
    except Exception as e:
        print(f"[WARN] Cohere init failed: {e}. English generation disabled.")

logging.basicConfig(
    filename='political_rss.log',
    level=logging.WARNING,
    format='%(asctime)s %(levelname)s %(message)s',
)

# Safety net: without this, any blocking call that lacks its own explicit
# timeout (e.g. a stalled connection during DNS/SSL) can hang the engine
# forever, since it runs a single sequential loop with no per-feed watchdog.
socket.setdefaulttimeout(20)

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/120.0.0.0 Safari/537.36'
    ),
    'Accept-Language': 'en-US,en;q=0.9,te;q=0.8,hi;q=0.7',
}

_SKIP_PATTERNS = re.compile(
    r'/(tag|tags|category|categories|section|topic|author|page|feed|rss|'
    r'search|trending|videos|gallery|live|breaking|sitemap)(/|$)',
    re.IGNORECASE,
)

SKIP_DOMAINS = {'indianexpress.com', 'news.google.com'}
DEFAULT_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Flag_of_India.svg/320px-Flag_of_India.svg.png'


# ── Language detection ─────────────────────────────────────────────────────────

def detect_language(text: str) -> str:
    """Heuristic: count Telugu vs Devanagari vs Latin chars."""
    if not text:
        return 'en'
    telugu     = len(re.findall(r'[ఀ-౿]', text))
    devanagari = len(re.findall(r'[ऀ-ॿ]', text))
    latin      = len(re.findall(r'[a-zA-Z]', text))
    total = telugu + devanagari + latin or 1
    if telugu / total > 0.1:
        return 'te'
    if devanagari / total > 0.1:
        return 'hi'
    return 'en'


# ── Political relevance ────────────────────────────────────────────────────────

def get_relevance_score(text: str) -> Tuple[int, List[str]]:
    """Count how many political keywords appear. Returns (score, matched_keywords)."""
    keywords = load_relevance_keywords()
    lower = text.lower()
    matched = []
    for kw in keywords:
        if kw.lower() in lower and kw not in matched:
            matched.append(kw)
    return len(matched), matched


# ── Category detection ────────────────────────────────────────────────────────

def detect_category(text: str) -> str:
    lower = text.lower()
    scores = {}
    for cat, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw.lower() in lower)
        if score:
            scores[cat] = score
    return max(scores, key=scores.get) if scores else 'general'


# ── District detection ────────────────────────────────────────────────────────

def detect_district(text: str) -> dict:
    lower = text.lower()
    for district, aliases in LOCATION_KEYWORDS.items():
        for alias in aliases:
            if alias.lower() in lower:
                return {
                    'location_found': True,
                    'district': district,
                    'city': district,
                    'state': 'Telangana',
                    'lat': ANDHRA_LAT,
                    'lng': ANDHRA_LNG,
                }
    return {'location_found': False, 'district': '', 'city': '', 'state': 'India', 'lat': None, 'lng': None}


# ── Image extraction ──────────────────────────────────────────────────────────

def extract_image(entry) -> Optional[str]:
    """Try every known RSS/Atom image field in priority order."""
    def _valid(url):
        return bool(url and isinstance(url, str) and url.startswith('http')
                    and not url.endswith('.gif'))

    for thumb in getattr(entry, 'media_thumbnail', []):
        if _valid(thumb.get('url', '')):
            return thumb['url']

    for mc in getattr(entry, 'media_content', []):
        url    = mc.get('url', '')
        medium = mc.get('medium', '')
        mtype  = mc.get('type', '')
        if _valid(url) and ('image' in medium or 'image' in mtype or medium == ''):
            return url

    for enc in getattr(entry, 'enclosures', []):
        if enc.get('type', '').startswith('image/') and _valid(enc.get('href', '')):
            return enc['href']

    for link in getattr(entry, 'links', []):
        lt = link.get('type', '')
        if lt.startswith('image/') and _valid(link.get('href', '')):
            return link['href']

    for html_src in [
        (entry.content[0].get('value', '') if getattr(entry, 'content', None) else ''),
        getattr(entry, 'summary_detail', {}).get('value', ''),
        getattr(entry, 'summary', '') or '',
    ]:
        if not html_src:
            continue
        m = re.search(r'<img[^>]+src=["\']?([^"\'>\s]+)["\']?', html_src, re.IGNORECASE)
        if m and _valid(m.group(1)):
            return m.group(1)

    return None


# ── Summary extraction ────────────────────────────────────────────────────────

def extract_summary(entry) -> str:
    """Prefer content:encoded (full HTML) over description (snippet)."""
    content_encoded = ''
    if hasattr(entry, 'content') and entry.content:
        content_encoded = entry.content[0].get('value', '')

    description = getattr(entry, 'summary', '') or ''
    raw_html = content_encoded if len(content_encoded) > len(description) else description

    if raw_html:
        soup = BeautifulSoup(raw_html, 'html.parser')
        text = soup.get_text(separator=' ', strip=True)
        return re.sub(r'\s+', ' ', text).strip()

    return ''


# ── Article page fetcher ──────────────────────────────────────────────────────

_CONTENT_SELECTORS = [
    'div[itemprop="articleBody"] p',
    'article p',
    'div[class*="article-body"] p',
    'div[class*="articleBody"] p',
    'div[class*="story-content"] p',
    'div[class*="storyContent"] p',
    'div[class*="story_content"] p',
    'div[class*="content-area"] p',
    'div[class*="article-content"] p',
    'div[class*="article_content"] p',
    'div[class*="post-content"] p',
    'div.artText p',
    'div.storytxt p',
    'div.storyDetails p',
    'section[class*="article"] p',
    '.story-body p',
    '.article p',
    'main article p',
    'main p',
]

_NOISE_KEYWORDS = [
    'subscribe', 'follow us', 'advertisement', 'also read',
    'read more', 'click here', 'download app', 'all rights reserved',
    'copyright', 'share this', 'whatsapp', 'facebook', 'twitter',
]


def fetch_article_page(url: str) -> dict:
    """Fetch article page and return image, og:description, and full body content."""
    if not url or 'news.google.com' in url:
        return {'image': None, 'description': None, 'content': ''}

    headers = {
        **HEADERS,
        'Referer': 'https://www.google.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9,te;q=0.8,hi;q=0.7',
    }
    try:
        resp = requests.get(url, headers=headers, timeout=8, allow_redirects=True)
        if resp.status_code != 200:
            return {'image': None, 'description': None, 'content': ''}

        resp.encoding = resp.apparent_encoding or 'utf-8'
        soup = BeautifulSoup(resp.text, 'html.parser')

        for tag in soup.select(
            'script, style, nav, header, footer, aside, '
            '[class*="related"], [class*="social"], [class*="share"], '
            '[class*="ad"], [class*="newsletter"], [class*="subscribe"]'
        ):
            tag.decompose()

        def meta(prop, name=None):
            tag = soup.find('meta', property=prop) or (
                soup.find('meta', attrs={'name': name}) if name else None
            )
            return tag['content'].strip() if tag and tag.get('content') else None

        image = (
            meta('og:image') or meta('og:image:secure_url')
            or meta('twitter:image', 'twitter:image')
            or meta('twitter:image:src', 'twitter:image:src')
        )
        if not image:
            for img in soup.find_all('img', src=True):
                src = img['src']
                if src.startswith('http') and not src.endswith('.gif'):
                    try:
                        if int(str(img.get('width', '0')).replace('px', '') or 0) >= 200:
                            image = src
                            break
                    except ValueError:
                        pass

        desc = meta('og:description') or meta('description', 'description')

        content = ''
        for selector in _CONTENT_SELECTORS:
            tags = soup.select(selector)
            if not tags:
                continue
            paragraphs = []
            for t in tags:
                text = t.get_text(separator=' ', strip=True)
                text = re.sub(r'\s+', ' ', text).strip()
                if len(text) < 40:
                    continue
                if any(kw in text.lower() for kw in _NOISE_KEYWORDS):
                    continue
                paragraphs.append(text)
            if paragraphs:
                content = '\n\n'.join(paragraphs)
                if len(content) > 200:
                    break

        return {
            'image': image if image and image.startswith('http') else None,
            'description': desc if desc else None,
            'content': content,
        }
    except Exception:
        return {'image': None, 'description': None, 'content': ''}


# ── Cohere: generate English title + summary ──────────────────────────────────

def generate_english(title: str, summary: str, language: str) -> Tuple[str, str]:
    """Returns (english_title, english_summary). Falls back to originals on error."""
    if not _cohere_client:
        return title, summary

    lang_label = {'te': 'Telugu', 'hi': 'Hindi'}.get(language, 'English')
    prompt = (
        f"The following is a news article in {lang_label} about Indian politics.\n\n"
        f"Title: {title}\n"
        f"Summary: {summary}\n\n"
        "Please:\n"
        "1. Translate and rewrite the title in clear English (max 15 words).\n"
        "2. Write a 2-3 sentence English summary of the article.\n\n"
        "Output format (exactly):\n"
        "Title: <english title>\n"
        "Summary: <english summary>"
    )
    try:
        resp = _cohere_client.chat(
            messages=[{'role': 'user', 'content': prompt}],
            model='command-r-plus-08-2024',
        )
        if resp and resp.finish_reason == 'COMPLETE':
            text = resp.message.content[0].text.strip()
            match = re.search(r'(?i)Title:\s*(.*?)\nSummary:\s*(.*)', text, re.DOTALL)
            if match:
                return match.group(1).strip(), match.group(2).strip()
    except Exception as e:
        print(f"[WARN] Cohere error: {e}")

    return title, summary


# ── Sentiment detection ─────────────────────────────────────────────────────────
# Same three-bucket scheme the Mentions/Alerts pipeline uses: positive /
# negative / moderate. Cohere classifies when available; a keyword heuristic is
# the offline fallback so every article still gets a label.
_POSITIVE_HINTS = [
    'welfare', 'launch', 'inaugurat', 'development', 'growth', 'wins', ' win ', 'success',
    'boost', 'approve', 'sanction', 'grant', 'relief', 'benefit', 'praise', 'achievement',
    'progress', 'investment', 'jobs', 'scheme',
    'అభివృద్ధి', 'సంక్షేమం', 'ప్రారంభం', 'విజయం', 'ప్రశంస', 'పథకం',
]
_NEGATIVE_HINTS = [
    'scam', 'corruption', 'protest', 'arrest', 'attack', 'murder', 'death', 'crime', 'fraud',
    'crisis', 'fail', 'slam', 'blast', 'oppose', 'clash', 'violence', 'controversy',
    'allegation', ' row ', 'loss', 'accident', 'assault', 'illegal', 'scandal',
    'అవినీతి', 'నిరసన', 'హత్య', 'దాడి', 'కుంభకోణం', 'ఆరోపణ', 'వివాదం',
]


def _heuristic_sentiment(text: str) -> str:
    low = f" {text.lower()} "
    pos = sum(1 for w in _POSITIVE_HINTS if w in low)
    neg = sum(1 for w in _NEGATIVE_HINTS if w in low)
    if neg > pos:
        return 'negative'
    if pos > neg:
        return 'positive'
    return 'moderate'


def detect_sentiment(title: str, summary: str) -> str:
    """Return 'positive' | 'negative' | 'moderate' for a news article."""
    text = f"{title}. {summary}".strip()
    if not text:
        return 'moderate'
    if _cohere_client:
        prompt = (
            "Classify the overall sentiment of this Telangana political news as "
            "exactly one word: positive, negative, or moderate.\n\n"
            f"Headline: {title}\nSummary: {summary}\n\n"
            "Answer with only one word."
        )
        try:
            resp = _cohere_client.chat(
                messages=[{'role': 'user', 'content': prompt}],
                model='command-r-plus-08-2024',
            )
            if resp and resp.finish_reason == 'COMPLETE':
                ans = resp.message.content[0].text.strip().lower()
                for s in ('positive', 'negative', 'moderate'):
                    if s in ans:
                        return s
                if 'neutral' in ans:
                    return 'moderate'
        except Exception as e:
            print(f"[WARN] Cohere sentiment error: {e}")
    return _heuristic_sentiment(text)


# ── Google News URL resolver ──────────────────────────────────────────────────

def resolve_google_news_url(url: str) -> str:
    """Decode a Google News RSS link to the real article URL.

    Modern Google News links (/rss/articles/CBMi...) are not plain HTTP
    redirects — the real URL is obtained via Google's batchexecute endpoint,
    using a signature + timestamp embedded in the article page. Returns '' if
    it can't be decoded (caller then keeps the Google News link, headline-only).
    """
    try:
        # Cheap path first: an old-style HTTP redirect, if any.
        resp = requests.get(url, headers=HEADERS, timeout=10, allow_redirects=True)
        if 'news.google.com' not in resp.url:
            return resp.url

        gn_id = urlparse(url).path.rstrip('/').split('/')[-1].split('?')[0]
        if not gn_id:
            return ''

        soup = BeautifulSoup(resp.text, 'html.parser')
        div = soup.select_one('c-wiz > div')
        if not div:
            return ''
        sig = div.get('data-n-a-sg')
        ts = div.get('data-n-a-ts')
        if not (sig and ts):
            return ''

        inner = json.dumps([
            'garturlreq',
            [['X', 'X', ['X', 'X'], None, None, 1, 1, 'US:en', None, 1, None, None, None, None, None, 0, 1],
             'X', 'X', 1, [1, 1, 1], 1, 1, None, 0, 0, None, 0],
            gn_id, ts, sig,
        ])
        payload = [['Fbv4je', inner]]
        r2 = requests.post(
            'https://news.google.com/_/DotsSplashUi/data/batchexecute',
            headers={'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
            data={'f.req': json.dumps([payload])},
            timeout=12,
        )
        for m in re.finditer(r'(https?://[^\s"\\]+)', r2.text):
            u = m.group(1)
            if 'google.com' not in u and 'gstatic.com' not in u:
                return u
    except Exception as e:
        print(f"[WARN] gnews decode error: {e}")
    return ''


# ── URL validation ────────────────────────────────────────────────────────────

def is_article_url(url: str) -> bool:
    if not url:
        return False
    if 'news.google.com' in url:
        return False
    parsed = urlparse(url)
    if parsed.netloc.replace('www.', '') in SKIP_DOMAINS:
        return False
    path = parsed.path.rstrip('/')
    if _SKIP_PATTERNS.search(path):
        return False
    segments = [s for s in path.split('/') if s]
    if len(segments) < 2:
        return False
    last = segments[-1]
    if len(last) < 8 and not re.search(r'\d', last):
        return False
    return True


# ── Main per-feed processor ───────────────────────────────────────────────────

def process_feed(feed_cfg: dict) -> int:
    url             = feed_cfg['url']
    source_name     = feed_cfg['source_name']
    hint_lang       = feed_cfg.get('language', 'en')
    follow_redirect = feed_cfg.get('follow_redirect', False)

    print(f"\n[RSS] Fetching: {source_name} ({url})")

    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        parsed = feedparser.parse(resp.content)
    except Exception as e:
        print(f"[ERR] feedparser failed for {url}: {e}")
        return 0

    if parsed.bozo and not parsed.entries:
        print(f"[SKIP] Bad feed ({parsed.bozo_exception}): {url}")
        return 0

    feed_domain = urlparse(url).netloc.replace('www.', '')
    inserted    = 0
    cutoff      = datetime(2025, 1, 1, tzinfo=timezone.utc)

    entries = sorted(
        parsed.entries,
        key=lambda x: x.get('published_parsed') or x.get('updated_parsed') or time.gmtime(0),
        reverse=False,
    )

    for entry in entries:
        try:
            article_url = getattr(entry, 'link', '') or ''
            is_gnews = 'news.google.com' in article_url

            # Real (non-Google-News) URLs must look like article pages. Google
            # News links are resolved later — only for NEW, relevant articles —
            # since decoding costs two extra requests each.
            if not is_gnews and not is_article_url(article_url):
                continue

            pub_date = None
            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                pub_date = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            elif hasattr(entry, 'updated_parsed') and entry.updated_parsed:
                pub_date = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)

            if pub_date and pub_date < cutoff:
                continue

            title   = (getattr(entry, 'title', '') or '').strip()
            summary = extract_summary(entry)

            if not title:
                continue

            # Google News titles end with " - Outlet". Pull the real outlet out
            # (so "coverage by outlet" shows Eenadu / Sakshi / ETV …) and clean
            # the headline. Falls back to the feed's own name.
            article_source_name = source_name
            if is_gnews and ' - ' in title:
                head, tail = title.rsplit(' - ', 1)
                if head and 0 < len(tail) <= 40:
                    article_source_name = tail.strip()
                    title = head.strip()

            full_text = f"{title} {summary}"

            lang = detect_language(full_text) if hint_lang == 'en' else hint_lang
            if hint_lang in ('hi', 'te') and detect_language(full_text) == 'en' and len(title) > 20:
                lang = 'en'

            relevance_score, keywords_matched = get_relevance_score(full_text)
            if relevance_score < 1:
                continue

            # Skip already-seen articles BEFORE the costly page fetch below — this
            # is the main speed-up, so a duplicate never costs an ~8s article
            # fetch (previously the dedup check ran only after fetching).
            col_news = get_db()['newsarticles']
            if col_news.find_one({'title': title}):
                continue

            # Now (only for a new, relevant article) decode the Google News
            # redirect to the real article URL, so we can scrape its content +
            # image below. If decoding fails we keep the Google News link.
            if follow_redirect and is_gnews:
                resolved = resolve_google_news_url(article_url)
                if resolved:
                    article_url = resolved
                    is_gnews = False

            # Google News sometimes surfaces social posts (Instagram/YouTube/X) —
            # skip those, they aren't news articles and have no scrapeable content.
            _SOCIAL = ('instagram.com', 'facebook.com', 'twitter.com', '://x.com',
                       'youtube.com', 'youtu.be', 'threads.net')
            if not is_gnews and any(s in article_url for s in _SOCIAL):
                continue

            image_url = extract_image(entry)

            if is_gnews:
                # Couldn't decode — keep RSS image/summary as-is. source_domain
                # left blank so the backend's news.google.com exclusion doesn't
                # hide the article.
                full_content = ''
                source_domain = ''
            else:
                page = fetch_article_page(article_url)
                if not image_url and page['image']:
                    image_url = page['image']
                if len(summary) < 80 and page['description']:
                    summary = page['description']
                full_content = page['content']
                source_domain = (
                    urlparse(article_url).netloc.replace('www.', '')
                    if follow_redirect else feed_domain
                )

            if not image_url:
                image_url = DEFAULT_IMAGE_URL

            if len(title) > 160:
                print(f"[SKIP] Title too long ({len(title)} chars)")
                continue

            category = detect_category(full_text)
            location = detect_district(full_text)
            # District-specific feeds carry their own canonical district — use it
            # as a fallback when the article text alone didn't reveal a district,
            # so the piece still maps onto that district's constituencies.
            feed_district = feed_cfg.get('district')
            if feed_district and not location.get('location_found'):
                location = {
                    'location_found': True,
                    'district': feed_district,
                    'city': '',
                    'state': 'Telangana',
                    'lat': None,
                    'lng': None,
                }

            title_english   = title
            summary_english = summary
            is_translated   = False

            if lang in ('te', 'hi'):
                title_english, summary_english = generate_english(title, summary, lang)
                is_translated = True

            check_title = title_english if is_translated else title
            if check_title.lower().startswith(('here is a', 'sure,', 'error generating', 'no title')):
                print(f"[SKIP] Invalid AI title: {check_title[:60]}")
                continue

            # Sentiment on the English text (positive / negative / moderate).
            sentiment = detect_sentiment(title_english, summary_english)

            doc = {
                'title':           title,
                'title_english':   title_english,
                'summary':         summary,
                'summary_english': summary_english,
                'content':         full_content,
                'source_url':      article_url,
                'source_name':     article_source_name,
                'source_domain':   source_domain,
                'image_url':       image_url,
                'published_date':  pub_date or datetime.utcnow(),
                'scraped_at':      datetime.utcnow(),
                'language':        lang,
                'category':        category,
                'sentiment':       sentiment,
                'source_type':     'rss',
                'relevance_score': relevance_score,
                'keywords_matched': keywords_matched[:20],
                'is_translated':   is_translated,
                'detected_location': location,
            }

            if upsert_article(doc):
                inserted += 1

        except Exception as e:
            logging.error(f"Error processing entry from {url}: {e}", exc_info=True)
            continue

    print(f"[RSS] {source_name}: {inserted} new articles inserted")
    return inserted


# ── Run all feeds ─────────────────────────────────────────────────────────────

def run_all_feeds() -> int:
    total = 0
    for feed_cfg in RSS_FEEDS:
        total += process_feed(feed_cfg)
        time.sleep(1)
    print(f"\n[DONE] Total inserted this run: {total}")
    return total


if __name__ == '__main__':
    run_all_feeds()
