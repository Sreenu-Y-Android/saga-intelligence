"""
Deletes ALL documents from the newsarticles collection.
Run this to wipe the RSS news cache before a fresh scrape.
Usage: python clear_rss_news.py
"""
from DB.mongo_connect import get_news_collection

col = get_news_collection()
result = col.delete_many({})
print(f"[DONE] Deleted {result.deleted_count} articles from newsarticles collection.")
