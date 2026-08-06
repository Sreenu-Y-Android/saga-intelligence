require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const { categorizeText } = require('./llmService');
const mappingService = require('./mappingService');
const { buildPoliticalContext, detectLanguageHints } = require('./politicalContextService');
const { analyzePoliticalSentiment } = require('./politicalSentimentService');
const cacheService = require('./cacheService');
const translationService = require('./translationService');
const LegalSection = require('../models/LegalSection');
const PlatformPolicy = require('../models/PlatformPolicy');

// Identical (or near-identical, whitespace-collapsed) text — reposts, RTs,
// the same article picked up by multiple keyword sweeps — reuses the prior
// LLM verdict instead of re-spending Pass A + Stage 4 tokens on it.
const TEXT_ANALYSIS_CACHE_TTL_SECONDS = Number(process.env.ANALYSIS_TEXT_CACHE_TTL_SECONDS || 7 * 24 * 60 * 60);
const textAnalysisCacheKey = (text) => {
  const normalized = String(text || '').trim().replace(/\s+/g, ' ');
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return `analysis:text:v1:${hash}`;
};

/**
 * Advanced Dual-Pass AI Analysis (V5.1)
 * Pass A: RapidAPI ChatGPT-42 LLM for Intent & Categorization
 * Pass B: Local Fine-Tuned Model for Legal & Policy Mapping
 * Replaces legacy Toxicity and Distilbert models.
 * Pass D: Standalone Deepfake Forensics (S3-First, Async)
 */

/**
 * //
 * Global lock to ensure forensic analyses are processed strictly one-by-one.
 */
let forensicLock = Promise.resolve();

const triggerForensicAnalysis = async (content, analysisId) => {
  const log = (msg) => console.log(`[ForensicLock] ${msg}`);
  const mlServiceUrl = process.env.DEEPFAKE_ML_URL || 'http://localhost:8001';

  // Entry into sequential queue
  return forensicLock = forensicLock.then(async () => {
    try {
      log(`Acquired lock for Analysis: ${analysisId}`);
      let mediaItems = content.media || [];

      // Fallback: If no media items but platform is YouTube/Facebook, use content_url
      if (mediaItems.length === 0 && (content.platform === 'youtube' || content.platform === 'facebook')) {
        const url = content.content_url || content.url;
        if (url) {
          mediaItems = [{ url, type: 'video' }];
        }
      }

      if (mediaItems.length === 0) return null;

      // Prioritize S3 URLs if archived, fallback to platform URL
      const payload = {
        media_items: mediaItems.map(m => ({
          url: m.s3_url || m.video_url || m.url,
          type: m.type === 'video' ? 'video' : 'image'
        }))
      };

      log(`Triggering batch forensics for ${payload.media_items.length} items (Analysis: ${analysisId})`);

      const response = await axios.post(`${mlServiceUrl}/detect/batch`, payload, { timeout: 300000 });
      log(`Forensics Complete for ${analysisId}`);
      return response.data.results || null;

    } catch (err) {
      log(`Forensics Failed for ${analysisId}: ${err.message}`);
      return null;
    } finally {
      log(`Released lock for Analysis: ${analysisId}`);
    }
  });
};

const analyzeContent = async (text, options = {}) => {
  const log = (msg) => console.log(`[AnalysisService] ${msg}`);

  if (!text || !text.trim()) {
    return {
      risk_level: 'low',
      risk_score: 0,
      explanation: 'No text provided.',
      violated_policies: [],
      legal_sections: [],
      triggered_keywords: []
    };
  }

  try {
    // --- CACHE: identical/near-identical text already analyzed (reposts, RTs,
    // the same story ingested via multiple keyword sweeps) ---
    const cacheKey = textAnalysisCacheKey(text);
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      log(`Cache hit for text (skipping Pass A + Stage 4 LLM calls): "${text.substring(0, 50)}..."`);
      let forensicResults = null;
      if (!options.skipForensics && options.content && options.analysisId) {
        forensicResults = await triggerForensicAnalysis(options.content, options.analysisId);
      }
      return { ...cached, forensic_results: forensicResults, from_text_cache: true };
    }

    log(`Starting Dual-Pass analysis for: "${text.substring(0, 50)}..."`);

    // --- PRE-TRANSLATION: non-English (native-script) text is translated
    // ONCE here via the existing Google-Translate-backed translationService,
    // and the translated text is what both LLM stages reason over. This
    // replaces asking each LLM stage to silently translate-then-reason
    // in a single inference pass (observed to hallucinate/invert meaning on
    // regional-language text — see Stage 4 cross-check comment below).
    // Entity/language detection (buildPoliticalContext) still runs on the
    // ORIGINAL text — its deterministic alias matching already handles
    // native scripts directly and is more reliable than re-matching against
    // a machine translation of proper nouns.
    let analysisText = text;
    const langHints = detectLanguageHints(text);
    const isNonEnglish = langHints.has_telugu || langHints.has_hindi ||
      langHints.has_devanagari || langHints.has_tamil ||
      langHints.has_kannada || langHints.has_urdu;
    if (isNonEnglish) {
      try {
        const translated = await translationService.translate(text, 'en', 'auto');
        if (translated && translated.trim()) {
          analysisText = translated;
          log(`Pre-translated non-English text for analysis: "${analysisText.substring(0, 50)}..."`);
        }
      } catch (err) {
        log(`Pre-translation failed (${err.message}); analyzing original text.`);
      }
    }

    // --- PASS A: LLM INTENT ANALYSIS ---
    log("Running Pass A (Primary AI Content Understanding)...");
    let llmResult = await categorizeText(analysisText);

    if (!llmResult) {
      log("Pass A failed. Using fallback categorization (Normal).");
      llmResult = {
        category: 'Normal',
        reasoning: 'Primary AI analysis unavailable. Defaulting to Normal category.'
      };
    }

    // --- PASS B: DETERMINISTIC MAPPING ENGINE ---
    // --- PASS B: DETERMINISTIC MAPPING ENGINE ---
    log("Running Pass B (Deterministic Mapping Engine)...");

    // Check against ALL platforms for comprehensive policy analysis
    const supportedPlatforms = ['x', 'youtube', 'facebook', 'instagram'];
    let allViolatedPolicies = [];
    let aggregatedLegalSections = []; // Should be same across platforms for same country
    let aggregatedKeywords = [];

    // We run mapping for all platforms to show "Cyber Simulation" results
    supportedPlatforms.forEach(p => {
      const result = mappingService.resolveMapping(
        llmResult.category,
        text,
        p,
        options.country || 'IN'
      );
      if (result.platform_policies && result.platform_policies.length > 0) {
        allViolatedPolicies.push(...result.platform_policies);
      }
      // Capture legal/keywords from the first valid run (they don't depend on platform)
      if (aggregatedLegalSections.length === 0) aggregatedLegalSections = result.legal_sections || [];
      if (aggregatedKeywords.length === 0) aggregatedKeywords = result.triggered_keywords || [];
    });

    const mappingResult = {
      legal_sections: aggregatedLegalSections,
      platform_policies: allViolatedPolicies,
      triggered_keywords: aggregatedKeywords
    };

    // --- PASS C: RISK ASSESSMENT (LLM-Driven) ---
    // Pass C was previously a standalone ML model, now integrated into Pass A (LLM) for efficiency.
    log("Applying Risk Assessment from LLM...");
    let finalRiskLevel = llmResult.risk_level || 'low';
    let finalRiskScore = Number(llmResult.risk_score || 0);
    log(`Risk Level: ${finalRiskLevel.toUpperCase()} (Score: ${finalRiskScore})`);

    /*
    // --- PASS C: RISK SCORING ML MODEL ---
    log("Running Pass C (Risk Scoring ML Model)...");
    let finalRiskLevel = 'low';
    let finalRiskScore = 0;

    const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8006';

    try {
      const riskResponse = await axios.post(`${mlServiceUrl}/score-risk`, {
        text: text,
        category: llmResult.category,
        legal_sections: mappingResult.legal_sections.map(s => s.section)
      });

      const riskData = riskResponse.data;

      // Pass C (ML) is the "Final Word" on physical risk scoring
      finalRiskLevel = riskData.risk.toLowerCase();
      finalRiskScore = Math.round(riskData.confidence * 100);

      log(`Risk Scoring Complete: ${finalRiskLevel.toUpperCase()} (${finalRiskScore}%) [Method: ${riskData.method}]`);

    } catch (error) {
      log(`Pass C (Risk Service) failed: ${error.message}.`);

      // Fallback: If ML is down, use a heuristic based on LLM category
      const highRiskCategories = ['Violence', 'Hate_Speech', 'Sexual_Violence', 'Threat'];
      if (highRiskCategories.includes(llmResult.category)) {
        finalRiskLevel = 'high';
        finalRiskScore = 85;
        log(`ML Service Down. Fallback to HIGH risk based on LLM category: ${llmResult.category}`);
      } else {
        finalRiskLevel = 'low';
        finalRiskScore = 15;
      }
    }
    */

    // --- TARGET-AWARE POLITICAL SENTIMENT (Stages 3 & 4) ---
    // The old category-driven sentiment override is GONE. Sentiment is now
    // resolved RELATIVE TO the client leadership via the deterministic
    // politicalContextService + LLM politicalSentimentService.
    log("Running Stage 3 (Political Context Gate)...");
    const politicalCtx = buildPoliticalContext(text, {
      taggedKeyword: options.taggedKeyword || '',
      authorHandle: options.authorHandle || '',
      platform: options.platform || '',
    });
    log(`Political context: mode=${politicalCtx.mode} target=${politicalCtx.primary_target || 'none'} target_relevance=${politicalCtx.target_relevance.toFixed(2)}`);

    log("Running Stage 4 (Target-Aware Political Sentiment LLM)...");
    const political = await analyzePoliticalSentiment(analysisText, politicalCtx);
    log(`Stance=${political.stance} target_sentiment=${political.target_sentiment} beneficiary=${political.beneficiary} provider=${political.provider}`);

    // ── risk_level is the Alerts page's Negative/Moderate/Positive bucket ──
    // (see frontend/src/pages/Alerts.js pill config: high=Negative,
    // medium=Moderate, low=Positive). That bucket must reflect stance
    // RELATIVE TO the client leadership, not generic Pass-A moderation risk —
    // otherwise a pro-client post that happens to mention violence/crime
    // keywords lands in "Negative", and an anti-client post with mild language lands in
    // "Positive". So target_sentiment is the single source of truth for both
    // risk_level and risk_score here; we no longer let Pass A's risk survive
    // in either direction.
    switch (political.target_sentiment) {
        case 'negative':
            finalRiskLevel = 'high';
            finalRiskScore = 75;
            break;
        case 'positive':
            finalRiskLevel = 'low';
            finalRiskScore = 20;
            break;
        case 'moderate':
        default:
            finalRiskLevel = 'medium';
            finalRiskScore = 50;
            break;
    }
    log(`Political sentiment → risk bucket: target_sentiment=${political.target_sentiment} stance=${political.stance} → ${finalRiskLevel} (${finalRiskScore})`);

    const finalSentiment = political.target_sentiment || 'moderate';
    const currentCategory = llmResult.category;

    // --- RESULT CONSOLIDATION ---
    const finalResult = {
      risk_level: finalRiskLevel,
      risk_score: finalRiskScore,
      // Citizen-impact severity + best-fit government department from the
      // extended Pass A schema. Both are validated inside categorizeText.
      severity: llmResult.severity || finalRiskLevel,
      concerned_department: llmResult.concerned_department || 'General Administration',
      primary_intent: currentCategory,
      category: currentCategory,
      grievance_type: llmResult.grievance_type || 'Normal',
      grievance_topic_reasoning: llmResult.grievance_reasoning || '',
      intent: currentCategory,
      violated_policies: mappingResult.platform_policies || [],
      legal_sections: mappingResult.legal_sections || [],
      triggered_keywords: mappingResult.triggered_keywords || [],
      sentiment: finalSentiment,
      // ── Target-aware political fields (NEW) ──────────────────────
      target_sentiment: political.target_sentiment,
      generic_sentiment: political.generic_sentiment,
      target_entity: political.target_entity,
      target_entity_canonical: political.target_entity_canonical,
      relevance_score: political.relevance_score,
      target_relevance: politicalCtx.target_relevance,
      stance: political.stance,
      // `political_stance` is the same value as `stance`, mirrored into the
      // Grievance schema's validated enum field (see models/Grievance.js).
      political_stance: political.stance,
      beneficiary: political.beneficiary,
      attack_target: political.attack_target,
      narrative_direction: political.narrative_direction,
      political_alignment: political.political_alignment,
      political_mode: politicalCtx.mode,
      mentioned_entities: politicalCtx.mentioned_entities,
      toxicity_level: political.toxicity_level,
      hate_speech: political.hate_speech,
      propaganda_probability: political.propaganda_probability,
      sarcasm_detected: political.sarcasm_detected,
      emotional_intensity: political.emotional_intensity,
      misinformation_probability: political.misinformation_probability,
      language_detected: political.language_detected,
      political_reasoning: political.reasoning,
      political_analysis: political.analysis,
      english_translation: political.english_translation,
      political_provider: political.provider,
      // ─────────────────────────────────────────────────────────────
      explanation: llmResult.reasoning || '',
      highlights: mappingResult.triggered_keywords || [],
      // Structure for ReasonModal
      llm_analysis: {
        category: currentCategory,
        grievance_type: llmResult.grievance_type || 'Normal',
        grievance_reasoning: llmResult.grievance_reasoning || '',
        intent: currentCategory,
        sentiment: finalSentiment,
        target_sentiment: political.target_sentiment,
        stance: political.stance,
        beneficiary: political.beneficiary,
        attack_target: political.attack_target,
        narrative_direction: political.narrative_direction,
        target_entity: political.target_entity,
        mentioned_entities: politicalCtx.mentioned_entities,
        reasoning: llmResult.reasoning || '',
        political_reasoning: political.reasoning,
        score: finalRiskScore,
        platform_policies_violated: mappingResult.platform_policies || [],
        bns_sections_violated: mappingResult.legal_sections || []
      }
    };

    // 3. Final Metadata for UI
    finalResult.reasons = [
      finalResult.explanation,
      `Risk Assessment: ${finalRiskLevel.toUpperCase()} (${finalRiskScore}%)`,
      ...finalResult.violated_policies.map(p => `Policy: ${p.policy_name}`),
      ...finalResult.legal_sections.map(l => `Legal: ${l.act} ${l.section}`)
    ].filter(Boolean);

    // Cache the text-derived verdict (not forensic_results, which is
    // per-content media, not per-text) for reuse by identical future text.
    await cacheService.set(cacheKey, finalResult, TEXT_ANALYSIS_CACHE_TTL_SECONDS);

    // --- PASS D: STANDALONE FORENSICS (POST-SAVE TRIGGER) ---
    // If we have content metadata (from monitorService), trigger forensics
    let forensicResults = null;
    if (!options.skipForensics && options.content && options.analysisId) {
      forensicResults = await triggerForensicAnalysis(options.content, options.analysisId);
    }

    finalResult.forensic_results = forensicResults;


    return finalResult;

  } catch (error) {
    log(`Critical Analysis Error: ${error.message}`);
    return {
      risk_level: 'low',
      risk_score: 0,
      explanation: `Analysis failed: ${error.message}`,
      violated_policies: [],
      legal_sections: [],
      triggered_keywords: []
    };
  }
};

module.exports = {
  analyzeContent
};