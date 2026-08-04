const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const createGrievanceMediaItemDefinition = () => ({
  type: { type: String, enum: ['photo', 'video', 'animated_gif'] },
  url: { type: String },
  video_url: { type: String },
  preview_url: { type: String },
  original_url: { type: String, default: null },
  original_video_url: { type: String, default: null },
  original_preview_url: { type: String, default: null },
  s3_url: { type: String, default: null },
  s3_key: { type: String, default: null },
  s3_preview: { type: String, default: null },
  s3_preview_key: { type: String, default: null }
});

/**
 * Grievance Model
 * Stores grievance posts from monitored X/Facebook government sources
 */
const grievanceSchema = new mongoose.Schema({
  id: {
    type: String,
    default: uuidv4,
    unique: true
  },
  complaint_code: {
    type: String
  },
  // Canonical external post ID.
  // For X: raw tweet id.
  // For Facebook: prefixed ids (e.g., facebook:post:<id>, facebook:comment:<id>).
  tweet_id: {
    type: String,
    required: true,
    unique: true
  },
  // The government account that was tagged
  tagged_account: {
    type: String,
    required: true
  },
  tagged_account_normalized: {
    type: String,
    default: ''
  },
  // Reference to GrievanceSource
  grievance_source_id: {
    type: String,
    ref: 'GrievanceSource'
  },
  // Source platform
  platform: {
    type: String,
    enum: ['x', 'facebook', 'whatsapp', 'instagram', 'youtube'],
    default: 'x'
  },
  complainant_phone: {
    type: String
  },
  source_ref: {
    type: String
  },
  whatsapp_message_sid: {
    type: String
  },
  // Author information
  posted_by: {
    handle: { type: String, required: true },
    display_name: { type: String },
    profile_image_url: { type: String },
    is_verified: { type: Boolean, default: false },
    follower_count: { type: Number, default: 0 }
  },
  // Post content
  content: {
    text: { type: String, required: true },
    full_text: { type: String },
    media: [createGrievanceMediaItemDefinition()]
  },
  // Context about the original post when this grievance is a reply/quote.
  // This enables showing both the tagged reply and the original post in the UI.
  context: {
    in_reply_to: {
      tweet_id: { type: String },
      tweet_url: { type: String },
      posted_by: {
        handle: { type: String },
        display_name: { type: String },
        profile_image_url: { type: String },
        is_verified: { type: Boolean, default: false }
      },
      content: {
        text: { type: String },
        full_text: { type: String },
        media: [createGrievanceMediaItemDefinition()]
      },
      post_date: { type: Date }
    },
    reposted_from: {
      tweet_id: { type: String },
      tweet_url: { type: String },
      posted_by: {
        handle: { type: String },
        display_name: { type: String },
        profile_image_url: { type: String },
        is_verified: { type: Boolean, default: false }
      },
      content: {
        text: { type: String },
        full_text: { type: String },
        media: [createGrievanceMediaItemDefinition()]
      },
      post_date: { type: Date }
    },
    quoted: {
      tweet_id: { type: String },
      tweet_url: { type: String },
      posted_by: {
        handle: { type: String },
        display_name: { type: String },
        profile_image_url: { type: String },
        is_verified: { type: Boolean, default: false }
      },
      content: {
        text: { type: String },
        full_text: { type: String },
        media: [createGrievanceMediaItemDefinition()]
      },
      post_date: { type: Date }
    }
  },
  // Tweet URL
  tweet_url: {
    type: String,
    required: true
  },
  // Engagement metrics
  engagement: {
    likes: { type: Number, default: 0 },
    retweets: { type: Number, default: 0 },
    replies: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    quotes: { type: Number, default: 0 }
  },
  // Timestamps
  post_date: {
    type: Date,
    required: true
  },
  detected_date: {
    type: Date,
    default: Date.now
  },
  workflow_status: {
    type: String,
    enum: ['received', 'reviewed', 'action_taken', 'closed', 'converted_to_fir'],
    default: 'received'
  },
  workflow_history: [{
    from: { type: String },
    to: { type: String, enum: ['received', 'reviewed', 'action_taken', 'closed', 'converted_to_fir'] },
    at: { type: Date, default: Date.now },
    by: { type: String },
    note: { type: String }
  }],
  workflow_timestamps: {
    received_at: { type: Date },
    reviewed_at: { type: Date },
    action_taken_at: { type: Date },
    closed_at: { type: Date },
    fir_converted_at: { type: Date }
  },
  escalation_count: {
    type: Number,
    default: 0
  },
  escalation_history: [{
    reason: { type: String },
    note: { type: String },
    by: { type: String },
    at: { type: Date, default: Date.now }
  }],
  fir_converted_at: {
    type: Date
  },
  fir_converted_by: {
    type: String
  },
  fir_number: {
    type: String
  },
  // Classification status
  classification: {
    type: String,
    enum: ['unclassified', 'acknowledged', 'complaint'],
    default: 'unclassified'
  },
  // For acknowledged items - reason for acknowledgment
  acknowledgment: {
    reason: { type: String },
    acknowledged_by: { type: String },
    acknowledged_at: { type: Date },
    notes: { type: String }
  },
  // For complaints - action details
  complaint: {
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'reviewed', 'case_booked'],
      default: 'pending'
    },
    // Unique report number: X-GRV-DD-MM-YY-SERIAL
    report_number: { type: String },
    // PDF report path/URL
    report_url: { type: String },
    // Action details
    action_taken: { type: String },
    action_taken_by: { type: String },
    action_taken_at: { type: Date },
    // Sharing history
    shared_with: [{
      contact_number: { type: String },
      shared_at: { type: Date },
      shared_by: { type: String },
      method: { type: String, enum: ['whatsapp', 'download'] }
    }],
    // Internal notes
    notes: { type: String },
    // Category of complaint
    category: { type: String }
  },
  // Criticism workflow tracking
  criticism: {
    report_id: { type: String },
    unique_code: { type: String },
    category: { type: String },
    remarks: { type: String },
    message: { type: String },
    media_s3_urls: [{ type: String }],
    action_taken_at: { type: Date },
    shared_at: { type: Date },
    shared_via: { type: String },
    informed_to: {
      name: { type: String },
      phone: { type: String },
      department: { type: String }
    }
  },
  // Grievance (G) workflow tracking
  grievance_workflow: {
    report_id: { type: String },
    unique_code: { type: String },
    status: { type: String, enum: ['PENDING', 'ESCALATED', 'CLOSED'], default: 'PENDING' },
    category: { type: String },
    shared_at: { type: Date },
    informed_to: {
      type: {
        name: { type: String, default: '' },
        phone: { type: String, default: '' },
        department: { type: String, default: '' }
      },
      default: () => ({})
    }
  },
  // Query (Q) workflow tracking
  query_workflow: {
    report_id: { type: String },
    unique_code: { type: String },
    status: { type: String, enum: ['PENDING', 'CLOSED'], default: 'PENDING' },
    category: { type: String },
    shared_at: { type: Date },
    informed_to: {
      type: {
        name: { type: String, default: '' },
        phone: { type: String, default: '' },
        department: { type: String, default: '' }
      },
      default: () => ({})
    }
  },
  // Suggestion (S) workflow tracking
  suggestion: {
    report_id: { type: String },
    unique_code: { type: String },
    category: { type: String },
    remarks: { type: String },
    message: { type: String },
    media_s3_urls: [{ type: String }],
    action_taken_at: { type: Date },
    shared_at: { type: Date },
    shared_via: { type: String },
    informed_to: {
      name: { type: String },
      phone: { type: String },
      department: { type: String }
    }
  },
  // AI Analysis (full pipeline results)
  analysis: {
    // 'neutral' is the legacy label for 'moderate'. Both are accepted because
    // ~7.3k existing documents were written with 'neutral', and narrowing the
    // enum would make every one of them fail validation on the next save.
    // New writes should use 'moderate'; scripts/migrate_sentiment_labels.js
    // converts the historic rows.
    sentiment: { type: String, enum: ['positive', 'negative', 'moderate', 'neutral'] },
    target_party: { type: String },
    stance: { type: String },
    risk_level: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
    risk_score: { type: Number, default: 0 },
    // Severity is a semantic alias of risk_level for UI / map colouring.
    // Kept distinct so future tuning can decouple "risk to the leadership"
    // from "severity to the citizen".
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
    // Government department best suited to act on this grievance.
    concerned_department: { type: String, default: null },
    category: { type: String },
    grievance_type: { type: String },
    grievance_topic_reasoning: { type: String },
    intent: { type: String },
    explanation: { type: String },
    triggered_keywords: [{ type: String }],
    violated_policies: [{ type: mongoose.Schema.Types.Mixed }],
    legal_sections: [{ type: mongoose.Schema.Types.Mixed }],
    reasons: [{ type: String }],
    highlights: [{ type: String }],
    llm_analysis: { type: mongoose.Schema.Types.Mixed },
    forensic_results: { type: mongoose.Schema.Types.Mixed },
    video_transcript: { type: String },
    analyzed_at: { type: Date },
    // ── Target-aware political intelligence (client-relative) ──────
    // Produced by politicalContextService → politicalSentimentService.
    // `target_sentiment` is sentiment RELATIVE TO the CM/INC leadership;
    // `generic_sentiment` is the raw emotional tone of the text.
    target_sentiment: { type: String, enum: ['positive', 'negative', 'moderate'] },
    generic_sentiment: { type: String, enum: ['positive', 'negative', 'moderate'] },
    target_entity: { type: String },
    target_entity_canonical: { type: String },
    target_relevance: { type: Number, default: 0 },
    relevance_score: { type: Number, default: 0 },
    political_stance: {
      type: String,
      enum: ['pro_target', 'anti_target', 'pro_target_indirect', 'anti_target_indirect', 'neutral', 'unrelated']
    },
    beneficiary: { type: String, enum: ['ours', 'opposition', 'none'] },
    attack_target: { type: String },
    narrative_direction: { type: String },
    political_alignment: { type: String },
    political_mode: { type: String },
    mentioned_entities: [{ type: mongoose.Schema.Types.Mixed }],
    toxicity_level: { type: String, enum: ['none', 'low', 'medium', 'high'] },
    hate_speech: { type: Boolean, default: false },
    propaganda_probability: { type: Number, default: 0 },
    sarcasm_detected: { type: Boolean, default: false },
    emotional_intensity: { type: Number, default: 0 },
    misinformation_probability: { type: Number, default: 0 },
    language_detected: { type: String },
    political_reasoning: { type: String },
    political_provider: { type: String }
  },
  // Detected location from tweet text/user profile/hashtags
  detected_location: {
    location_found: { type: Boolean, default: false },
    city: { type: String },
    district: { type: String },
    constituency: { type: String },
    lok_sabha: { type: String },
    keyword_matched: { type: String },
    matched_token: { type: String },
    match_source: { type: String },
    lat: { type: Number },
    lng: { type: Number },
    // Was a String in the legacy shape ('high'/'low'); the classifier now
    // emits a 0..1 number. Mixed accepts both so old documents still load.
    confidence: { type: mongoose.Schema.Types.Mixed },
    source: { type: String },
    reasoning: { type: String },
    // Confidence-gated auto-assign vs manual review.
    auto_assigned: { type: Boolean, default: false },
    manual_review_required: { type: Boolean, default: false }
  },
  // Resolved routing fan-out (set by constituencyMasterService.resolveRouting)
  routing_targets: { type: mongoose.Schema.Types.Mixed, default: null },
  // Persons (MPs, MLAs, CM, opposition leaders) identified in the content or via tagging.
  // Used by:
  //   - Grievance handle filter: a post matches a leader if they're identified here,
  //     even when the post wasn't directly tagged to them (handle_normalized).
  //   - Sentiment perspective: side = 'ours' | 'opposition' lets the LLM/UI decide
  //     whether the post is for or against the client.
  linked_persons: [{
    person_id: { type: String },
    name: { type: String },
    role: { type: String },
    district: { type: String },
    constituency: { type: String },
    side: { type: String, enum: ['ours', 'opposition'] },
    party: { type: String },
    handle: { type: String },                  // primary handle (e.g. @revanth_anumula)
    handle_normalized: { type: String },       // normalized for filtering (e.g. revanth_anumula)
    match_type: { type: String, enum: ['mention', 'text_match'] }
  }],
  // Is this grievance currently visible/active
  is_active: {
    type: Boolean,
    default: true
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware
grievanceSchema.pre('save', function (next) {
  this.updated_at = new Date();
  this.tagged_account_normalized = String(this.tagged_account || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
  next();
});

// Indexes for efficient queries
grievanceSchema.index({ platform: 1 });
grievanceSchema.index({ tagged_account: 1 });
grievanceSchema.index({ classification: 1 });
grievanceSchema.index({ 'complaint.status': 1 });
grievanceSchema.index({ complaint_code: 1 }, { unique: true, sparse: true });
grievanceSchema.index({ workflow_status: 1, post_date: -1 });
grievanceSchema.index({ platform: 1, workflow_status: 1, post_date: -1 });
grievanceSchema.index({ whatsapp_message_sid: 1 }, { unique: true, sparse: true });
grievanceSchema.index({ post_date: -1 });
grievanceSchema.index({ detected_date: -1 });
grievanceSchema.index({ 'posted_by.handle': 1 });
grievanceSchema.index({ 'complaint.report_number': 1 });
grievanceSchema.index({ is_active: 1, workflow_status: 1, post_date: -1, id: -1 });
grievanceSchema.index({ is_active: 1, platform: 1, workflow_status: 1, post_date: -1, id: -1 });
grievanceSchema.index({ is_active: 1, grievance_source_id: 1, workflow_status: 1, post_date: -1, id: -1 });
grievanceSchema.index({ is_active: 1, classification: 1, 'complaint.status': 1, post_date: -1 });
grievanceSchema.index({ is_active: 1, tagged_account_normalized: 1, post_date: -1 });
grievanceSchema.index({ 'linked_persons.handle_normalized': 1, post_date: -1 });
grievanceSchema.index({ 'linked_persons.person_id': 1, post_date: -1 });
grievanceSchema.index({ 'linked_persons.side': 1, 'analysis.sentiment': 1, post_date: -1 });
grievanceSchema.index({ 'criticism.unique_code': 1 }, { sparse: true });
grievanceSchema.index({ 'grievance_workflow.status': 1, post_date: -1 });
grievanceSchema.index({ is_active: 1, 'grievance_workflow.status': 1, post_date: -1, id: -1 });
grievanceSchema.index({ 'query_workflow.unique_code': 1 }, { sparse: true });
grievanceSchema.index({ 'query_workflow.status': 1, post_date: -1 });
grievanceSchema.index({ 'suggestion.unique_code': 1 }, { sparse: true });
grievanceSchema.index({ 'detected_location.district': 1 }, { sparse: true });
grievanceSchema.index({ 'detected_location.constituency': 1 }, { sparse: true });
grievanceSchema.index({ 'detected_location.city': 1 }, { sparse: true });
// Compound indexes matching getLocationStats' $match (is_active + location present)
grievanceSchema.index({ is_active: 1, 'detected_location.city': 1 }, { sparse: true });
grievanceSchema.index({ is_active: 1, 'detected_location.district': 1 }, { sparse: true });
grievanceSchema.index({ is_active: 1, 'detected_location.constituency': 1 }, { sparse: true });
// Sentiment $group during list fetch — speeds up the pill-count aggregation
grievanceSchema.index({ is_active: 1, 'analysis.sentiment': 1 });
// Geographic Intelligence: date-filtered + sentiment-filtered district/city rollups
grievanceSchema.index({ is_active: 1, 'detected_location.district': 1, post_date: -1 });
grievanceSchema.index({ is_active: 1, 'detected_location.city': 1, post_date: -1 });
grievanceSchema.index({ is_active: 1, 'detected_location.district': 1, 'analysis.sentiment': 1, post_date: -1 });
grievanceSchema.index({ is_active: 1, 'detected_location.city': 1, 'analysis.sentiment': 1, post_date: -1 });

// Virtual for generating report number
grievanceSchema.methods.generateReportNumber = async function () {
  const date = new Date();
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);

  // Get serial number for today
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const count = await mongoose.model('Grievance').countDocuments({
    'complaint.report_number': { $exists: true, $ne: null },
    'complaint.action_taken_at': { $gte: startOfDay, $lte: endOfDay }
  });

  const serial = String(count + 1).padStart(3, '0');
  return `X-GRV-${day}-${month}-${year}-${serial}`;
};

module.exports = mongoose.model('Grievance', grievanceSchema);
