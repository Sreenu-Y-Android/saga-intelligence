from datetime import datetime
from DB.mongo_connect import get_news_collection

def upsert_article(article: dict) -> bool:
    """Insert article if source_url not already present. Returns True if newly inserted."""
    if not article.get('source_url'):
        return False

    col = get_news_collection()
    col.create_index([("published_date", -1)])

    article.setdefault('scraped_at', datetime.utcnow())

    result = col.update_one(
        {'source_url': article['source_url']},
        {'$setOnInsert': article},
        upsert=True,
    )
    inserted = result.upserted_id is not None
    if inserted:
        print(f"[INSERT] {article.get('source_name', '?')} — {article.get('title', '')[:80]}")
    return inserted
