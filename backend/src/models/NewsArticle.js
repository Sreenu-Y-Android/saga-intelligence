const mongoose = require('mongoose');

const detectedLocationSchema = new mongoose.Schema({
  location_found: { type: Boolean, default: false },
  district:       { type: String, default: '' },
  city:           { type: String, default: '' },
  state:          { type: String, default: '' },
  lat:            { type: Number, default: null },
  lng:            { type: Number, default: null },
}, { _id: false });

const newsArticleSchema = new mongoose.Schema({
  title:           { type: String, required: true },
  title_english:   { type: String, default: '' },
  summary:         { type: String, default: '' },
  summary_english: { type: String, default: '' },
  content:         { type: String, default: '' },
  source_url:      { type: String, required: true, unique: true },
  source_name:     { type: String, default: '' },
  source_domain:   { type: String, default: '' },
  image_url:       { type: String, default: null },
  published_date:  { type: Date, default: Date.now },
  scraped_at:      { type: Date, default: Date.now },
  language:        { type: String, enum: ['en', 'pa', 'hi', 'unknown'], default: 'en' },
  category: {
    type: String,
    enum: ['crime', 'politics', 'development', 'agriculture', 'health', 'education', 'law_order', 'accident', 'sports', 'culture', 'general'],
    default: 'general',
  },
  // Same three-bucket scheme as grievances/mentions: positive | negative | moderate.
  sentiment:        { type: String, enum: ['positive', 'negative', 'moderate'], default: 'moderate' },
  // Who the sentiment above is actually about — the LLM already computes these
  // when scoring `sentiment`; kept instead of discarded so a "Negative" badge
  // can show *who* it's negative for instead of reading as generic bad news.
  sentiment_target:           { type: String, default: '' }, // e.g. "INC", "BRS", leader name, or "none"
  sentiment_target_alignment: { type: String, default: '' }, // ally | opposition | neutral | none
  sentiment_reasoning:        { type: String, default: '' }, // 1-2 sentence model justification
  source_type:      { type: String, enum: ['rss', 'keyword_search', 'domain'], default: 'rss' },
  relevance_score:  { type: Number, default: 0 },
  keywords_matched: [String],
  is_translated:    { type: Boolean, default: false },
  detected_location: { type: detectedLocationSchema, default: () => ({}) },
}, {
  timestamps: false,
  collection: 'newsarticles',
});

newsArticleSchema.index({ scraped_at: -1 });
newsArticleSchema.index({ category: 1 });
newsArticleSchema.index({ language: 1 });
newsArticleSchema.index({ source_type: 1 });
newsArticleSchema.index({ 'detected_location.district': 1 });
// Geographic Intelligence: district/city news counts within a date window
newsArticleSchema.index({ 'detected_location.district': 1, published_date: -1 });
newsArticleSchema.index({ 'detected_location.city': 1, published_date: -1 });
// Per-district sentiment rollups (outlet stance breakdown on the constituency page)
newsArticleSchema.index({ 'detected_location.district': 1, sentiment: 1 });

module.exports = mongoose.model('NewsArticle', newsArticleSchema);
