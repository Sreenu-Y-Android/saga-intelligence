/**
 * End-to-End Grievance Analysis Tester (single case)
 * ─────────────────────────────────────────────────────────────────────
 * Runs the FULL production analysis pipeline on ONE piece of content
 * and prints every stage's output so you can decide if the system is
 * behaving correctly.
 *
 * Pipeline exercised:
 *   • Stage 3 — politicalContextService    (deterministic entity gate)
 *   • Pass A  — llmService.categorizeText  (moderation + grievance + risk)
 *   • Pass B  — mappingService             (legal sections + policies)
 *   • Stage 4 — politicalSentimentService  (target-aware LLM)
 *   • Stage 5 — bsk_sentiment resolution   (deterministic)
 *
 * THIS DOES NOT WRITE TO MONGODB.
 *
 *   Edit the TEST_CASE block below, then:
 *     node test-grievance-e2e.js
 */

require('dotenv').config();
const { buildPoliticalContext } = require('./src/services/politicalContextService');
const { analyzeContent } = require('./src/services/analysisService');

/* ════════════════════════════════════════════════════════════════════
 *  EDIT THIS — the single test case
 * ════════════════════════════════════════════════════════════════════ */
const TEST_CASE = {
    text: `"I won't come to your meeting until Bandi Sanjay is removed" means justice was served for that minor girl, right? – BRS Party General Secretary RS Praveen Kumar. 3/3`,

    taggedKeyword: 'Bandi Sanjay',
    platform: 'x',
    authorHandle: 'bjpsupporter',
};
/* ════════════════════════════════════════════════════════════════════ */

const C = {
    reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
};

const colorStance = (s) => {
    if (s === 'pro_bsk' || s === 'pro_bsk_indirect') return C.green;
    if (s === 'anti_bsk' || s === 'anti_bsk_indirect') return C.red;
    if (s === 'neutral') return C.yellow;
    return C.dim;
};
const colorSentiment = (s) => {
    if (s === 'positive') return C.green;
    if (s === 'negative') return C.red;
    return C.yellow;
};
const hr = (ch = '═', n = 78) => console.log(C.dim + ch.repeat(n) + C.reset);

(async () => {
    const { text, taggedKeyword, platform, authorHandle } = TEST_CASE;

    if (!text || !text.trim()) {
        console.error(`${C.red}TEST_CASE.text is empty — edit the file first.${C.reset}`);
        process.exit(1);
    }

    console.log(`\n${C.bold}${C.cyan}GRIEVANCE END-TO-END ANALYSIS${C.reset}`);
    console.log(`${C.dim}LLM_PROVIDER=rapidapi  HOST=${process.env.RAPIDAPI_CHATGPT_HOST || 'chatgpt-42.p.rapidapi.com'}${C.reset}\n`);

    hr();
    console.log(`${C.bold}INPUT${C.reset}`);
    hr('─');
    console.log(`${C.dim}text          :${C.reset}\n${text}\n`);
    console.log(`${C.dim}taggedKeyword :${C.reset} ${taggedKeyword || '∅'}`);
    console.log(`${C.dim}platform      :${C.reset} ${platform || 'x'}`);
    console.log(`${C.dim}authorHandle  :${C.reset} ${authorHandle || '∅'}`);
    hr();

    /* ── Stage 3 (preview only — analyzeContent runs it internally too) */
    const ctx = buildPoliticalContext(text, { taggedKeyword, authorHandle, platform });
    console.log(`\n${C.bold}STAGE 3 — Political Context Gate${C.reset}  ${C.dim}(deterministic, no LLM)${C.reset}`);
    hr('─');
    console.log(`mode               : ${C.magenta}${ctx.mode}${C.reset}`);
    console.log(`primary_target     : ${ctx.primary_target_canonical || 'none'}  (${ctx.primary_target_alignment || 'n/a'})`);
    console.log(`bsk_relevance      : ${ctx.bsk_relevance.toFixed(2)}`);
    console.log(`has_bsk_mention    : ${ctx.has_bsk_mention}`);
    console.log(`has_ally_mention   : ${ctx.has_ally_mention}`);
    console.log(`has_opposition     : ${ctx.has_opposition_mention}`);
    console.log(`has_civic_signal   : ${ctx.has_civic_signal}`);
    console.log(`mentioned_entities :`);
    for (const m of ctx.mentioned_entities) {
        console.log(`   • ${m.canonical}  [${m.alignment}${m.party ? ', party=' + m.party : ''}]  ${C.dim}matched "${m.alias_matched}"${C.reset}`);
    }
    if (ctx.mentioned_entities.length === 0) console.log('   ∅');
    console.log(`languages          : ${Object.entries(ctx.language_hints).filter(([, v]) => v).map(([k]) => k.replace('has_', '')).join(', ') || 'unknown'}`);
    console.log(`summary            : ${ctx.summary}`);

    /* ── Run full pipeline (Pass A + Pass B + Stage 4 + Stage 5) */
    console.log(`\n${C.dim}Calling analyzeContent (Pass A → Pass B → Stage 4 → Stage 5)…${C.reset}\n`);
    const t0 = Date.now();
    const a = await analyzeContent(text, { platform, taggedKeyword, authorHandle, skipForensics: true });
    const ms = Date.now() - t0;

    if (!a) {
        console.error(`${C.red}analyzeContent returned null${C.reset}`);
        process.exit(1);
    }

    /* ── Pass A — moderation + grievance topic + risk */
    console.log(`${C.bold}PASS A — Moderation + Grievance Topic + Risk${C.reset}`);
    hr('─');
    console.log(`category           : ${a.category}`);
    console.log(`grievance_type     : ${a.grievance_type}`);
    console.log(`grievance_reasoning: ${a.grievance_topic_reasoning || '—'}`);
    console.log(`risk_level         : ${a.risk_level}`);
    console.log(`risk_score         : ${a.risk_score}`);
    console.log(`explanation        : ${a.explanation || '—'}`);

    /* ── Pass B — legal & platform mapping */
    console.log(`\n${C.bold}PASS B — Legal Sections & Platform Policies${C.reset}`);
    hr('─');
    console.log(`triggered_keywords : ${(a.triggered_keywords || []).join(', ') || '∅'}`);
    console.log(`legal_sections     : ${(a.legal_sections || []).map((l) => `${l.act} ${l.section}`).join(', ') || '∅'}`);
    console.log(`violated_policies  : ${(a.violated_policies || []).map((p) => p.policy_name).join(', ') || '∅'}`);

    /* ── Stage 4 + 5 — Target-Aware Sentiment */
    const stanceCol = colorStance(a.stance);
    const sentCol   = colorSentiment(a.bsk_sentiment);
    console.log(`\n${C.bold}STAGES 4 & 5 — Target-Aware Political Sentiment${C.reset}`);
    hr('─');
    console.log(`${C.bold}stance${C.reset}              : ${stanceCol}${a.stance}${C.reset}`);
    console.log(`${C.bold}bsk_sentiment${C.reset}       : ${sentCol}${a.bsk_sentiment}${C.reset}    ${C.dim}(legacy sentiment=${a.sentiment})${C.reset}`);
    console.log(`generic_sentiment   : ${a.generic_sentiment}`);
    console.log(`target_entity       : ${a.target_entity}  ${a.target_entity_canonical ? `(${a.target_entity_canonical})` : ''}`);
    console.log(`relevance_score     : ${(a.relevance_score || 0).toFixed(2)}`);
    console.log(`beneficiary         : ${a.beneficiary}`);
    console.log(`attack_target       : ${a.attack_target || '∅'}`);
    console.log(`narrative_direction : ${a.narrative_direction || '∅'}`);
    console.log(`political_alignment : ${a.political_alignment}`);
    console.log(`toxicity_level      : ${a.toxicity_level}`);
    console.log(`hate_speech         : ${a.hate_speech ? 'YES' : 'no'}`);
    console.log(`sarcasm_detected    : ${a.sarcasm_detected ? 'YES' : 'no'}`);
    console.log(`propaganda_prob     : ${(a.propaganda_probability || 0).toFixed(2)}`);
    console.log(`misinformation_prob : ${(a.misinformation_probability || 0).toFixed(2)}`);
    console.log(`emotional_intensity : ${(a.emotional_intensity || 0).toFixed(2)}`);
    console.log(`language_detected   : ${a.language_detected || '—'}`);
    console.log(`provider            : ${C.bold}${a.political_provider}${C.reset}`);
    console.log(`reasoning           : ${a.political_reasoning || '—'}`);
    if (a.english_translation) {
        console.log(`\n${C.bold}LLM English translation (Step 1):${C.reset}`);
        console.log(`${C.cyan}${a.english_translation}${C.reset}`);
    }
    if (a.political_analysis) {
        console.log(`\n${C.bold}LLM analytical scratchpad (Steps 2-5):${C.reset}`);
        console.log(`${C.dim}${a.political_analysis}${C.reset}`);
    }

    /* ── Final summary banner */
    hr();
    console.log(`${C.bold}FINAL VERDICT${C.reset}`);
    hr('─');
    console.log(`Stance         : ${stanceCol}${C.bold}${a.stance}${C.reset}`);
    console.log(`BSK Sentiment  : ${sentCol}${C.bold}${a.bsk_sentiment}${C.reset}`);
    console.log(`Risk           : ${a.risk_level} (${a.risk_score})`);
    console.log(`Target         : ${a.target_entity_canonical || a.target_entity}`);
    console.log(`Provider used  : ${a.political_provider}`);
    console.log(`Elapsed        : ${ms} ms`);
    hr();
    console.log('');
})().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
