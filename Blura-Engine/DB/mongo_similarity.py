from sentence_transformers import SentenceTransformer, util
from datetime import datetime, timedelta
from DB.mongo_connect import get_news_collection

_model = None

def _get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer('all-mpnet-base-v2')
    return _model

def check_duplicate(title: str, hours: int = 24, threshold: float = 0.78) -> bool:
    """Return True if a semantically similar title exists in the last `hours` hours."""
    if not title or len(title.strip()) < 10:
        return False

    col = get_news_collection()
    since = datetime.utcnow() - timedelta(hours=hours)

    recent = list(col.find(
        {'scraped_at': {'$gte': since}},
        {'title_english': 1, 'title': 1, '_id': 0},
    ).limit(300))

    if not recent:
        return False

    model = _get_model()
    enc_new = model.encode(title, convert_to_tensor=True)

    for doc in recent:
        existing = doc.get('title_english') or doc.get('title') or ''
        if not existing:
            continue
        enc_existing = model.encode(existing, convert_to_tensor=True)
        sim = util.pytorch_cos_sim(enc_new, enc_existing).item()
        if sim >= threshold:
            print(f"[DUP] score={sim:.2f} — '{title[:60]}' ~ '{existing[:60]}'")
            return True

    return False
