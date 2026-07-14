const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * Frequent Engagers Analysis
 * Snapshots which X/Twitter accounts repeatedly retweet a given handle's
 * tweets, so operators can identify their most active amplifiers/detractors.
 * One record per handle; re-running an analysis updates the latest record
 * for that handle (merging engager history rather than starting over).
 */
const engagerSchema = new mongoose.Schema({
  handle: { type: String, required: true },
  name: { type: String, default: '' },
  avatar: { type: String, default: '' },
  verified: { type: Boolean, default: false },
  user_id: { type: String, default: '' },
  tweets_retweeted: { type: Number, default: 0 },
  tweet_ids: { type: [String], default: [] },
  frequency: {
    type: String,
    enum: ['super-active', 'regular', 'occasional', 'one-time'],
    default: 'one-time'
  }
}, { _id: false });

const tweetSnapshotSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, default: '' },
  url: { type: String, default: '' },
  created_at: { type: Date },
  retweet_count: { type: Number, default: 0 },
  retweeters_found: { type: Number, default: 0 }
}, { _id: false });

const engagerAnalysisSchema = new mongoose.Schema({
  id: {
    type: String,
    default: uuidv4,
    unique: true
  },
  handle: { type: String, required: true },
  handle_lower: { type: String, required: true },
  display_name: { type: String, default: '' },
  avatar: { type: String, default: '' },
  source_id: { type: String, default: null },
  analyzed_at: { type: Date, default: Date.now },
  period_days: { type: Number, default: 30 },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'processing'
  },
  error: { type: String, default: null },
  tweets_analyzed: { type: Number, default: 0 },
  total_retweet_events: { type: Number, default: 0 },
  unique_retweeters: { type: Number, default: 0 },
  summary: {
    'super-active': { type: Number, default: 0 },
    regular: { type: Number, default: 0 },
    occasional: { type: Number, default: 0 },
    'one-time': { type: Number, default: 0 }
  },
  engagers: { type: [engagerSchema], default: [] },
  tweets: { type: [tweetSnapshotSchema], default: [] }
}, { timestamps: true });

engagerAnalysisSchema.index({ handle_lower: 1, analyzed_at: -1 });
engagerAnalysisSchema.index({ status: 1, analyzed_at: -1 });

module.exports = mongoose.model('EngagerAnalysis', engagerAnalysisSchema);
