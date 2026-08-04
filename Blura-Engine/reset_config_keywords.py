"""
One-time script: deletes all source='config' keywords from rsskeywords collection
so they re-seed fresh from the updated CONFIG_KEYWORDS in newsController.js
on the next Keywords modal open.
"""
from DB.mongo_connect import get_db

col = get_db()['rsskeywords']
result = col.delete_many({ 'source': 'config' })
print(f"[DONE] Deleted {result.deleted_count} config keywords from rsskeywords collection.")
print("Now open the Keywords modal in the UI — fresh keywords will be seeded from newsController.js.")
