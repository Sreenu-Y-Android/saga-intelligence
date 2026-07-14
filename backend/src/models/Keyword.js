const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const keywordSchema = new mongoose.Schema({
  id: {
    type: String,
    default: uuidv4,
    unique: true
  },
  keyword: {
    type: String,
    required: true,
    unique: true
  },
  category: {
    type: String,
    // 'monitoring' — search-only topic/candidate keywords for active content
    // fetching (fetchKeywordGrievances). Kept distinct from the threat/hate/
    // violence categories used for alert risk-scoring in monitorService.js.
    enum: ['violence', 'threat', 'hate', 'other', 'monitoring'],
    required: true
  },
  language: {
    type: String,
    enum: ['en', 'hi', 'te', 'all'],
    default: 'en'
  },
  is_active: {
    type: Boolean,
    default: true
  },
  weight: {
    type: Number,
    default: 50
  },
  // Metadata only — does not affect matching/search. Lets the Keyword
  // management UI filter monitoring terms by which way they cut for the client.
  direction: {
    type: String,
    enum: ['positive', 'negative', 'neutral'],
    default: 'neutral'
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Keyword', keywordSchema);
