/**
 * Smoke test for the new target-aware political pipeline.
 *
 * Run:  node test-political-pipeline.js
 *
 * Stage 3 (politicalContextService) is fully deterministic — assertions
 * for the 8 reference scenarios. Stage 4 (politicalSentimentService) is
 * exercised only if the RapidAPI LLM gateway is reachable.
 */
const { buildPoliticalContext } = require('./src/services/politicalContextService');
const { analyzePoliticalSentiment, resolveBskSentiment } = require('./src/services/politicalSentimentService');

const cases = [
    {
        label: 'pro-BSK (English)',
        text: 'Congress leaders are corrupt. Only Bandi Sanjay can save Telangana.',
        expectMode: 'about_bsk',
        expectBskMention: true,
    },
    {
        label: 'anti-BSK (English)',
        text: 'Bandi Sanjay is spreading hate politics in Karimnagar.',
        expectMode: 'about_bsk',
        expectBskMention: true,
    },
    {
        label: 'pro-BSK indirect (opposition attack)',
        text: 'KCR failed Telangana farmers. BRS is finished.',
        expectMode: 'about_opposition',
        expectBskMention: false,
    },
    {
        label: 'pro-BSK supporters mocking opposition (not hate speech)',
        text: 'BJP supporters exposed Revanth Reddy corruption in Hyderabad.',
        expectMode: 'about_bsk',
    },
    {
        label: 'civic grievance tagged to BSK',
        text: 'Power cuts in Karimnagar since 3 days @bandisanjay please help',
        expectMode: 'civic_grievance',
        expectBskMention: true,
    },
    {
        label: 'pro-BSK (Telugu)',
        text: 'బండి సంజయ్ గారు చాలా బాగా పని చేస్తున్నారు. కాంగ్రెస్ చేతగాని.',
        expectMode: 'about_bsk',
        expectBskMention: true,
    },
    {
        label: 'anti-BSK (Hindi)',
        text: 'बंडी संजय कुमार जनता को धोखा दे रहे हैं।',
        expectMode: 'about_bsk',
        expectBskMention: true,
    },
    {
        label: 'irrelevant (Telugu greeting)',
        text: 'Happy Diwali everyone! శుభాకాంక్షలు.',
        expectMode: 'irrelevant',
        expectBskMention: false,
    },
    {
        label: 'hostile slang nickname (Romanized Telugu)',
        text: 'bandi gadu is just a Modi yes-man, useless MP for Karimnagar',
        expectBskMention: true,
    },
    {
        label: 'comparative narrative',
        text: 'Both Bandi Sanjay and KTR are politicians, what is the difference?',
        expectBskMention: true,
    },
];

const ok = (b) => (b ? '✓' : '✗');

(async () => {
    console.log('═══ Stage 3 — politicalContextService (deterministic) ═══\n');
    let pass = 0;
    let fail = 0;
    for (const c of cases) {
        const ctx = buildPoliticalContext(c.text, { taggedKeyword: '', authorHandle: '' });
        const checks = [];
        if (c.expectMode)         checks.push({ name: `mode=${c.expectMode}`, ok: ctx.mode === c.expectMode, got: ctx.mode });
        if (c.expectBskMention !== undefined) checks.push({ name: `has_bsk_mention=${c.expectBskMention}`, ok: ctx.has_bsk_mention === c.expectBskMention, got: ctx.has_bsk_mention });

        const allOk = checks.every((x) => x.ok);
        if (allOk) pass++; else fail++;
        console.log(`${ok(allOk)}  ${c.label}`);
        console.log(`    text       : ${c.text.slice(0, 80)}${c.text.length > 80 ? '…' : ''}`);
        console.log(`    target     : ${ctx.primary_target_canonical || 'none'} (${ctx.primary_target_alignment || 'n/a'})`);
        console.log(`    mode       : ${ctx.mode}    relevance=${ctx.bsk_relevance.toFixed(2)}`);
        console.log(`    mentioned  : ${ctx.mentioned_entities.map((m) => m.canonical).join(', ') || '∅'}`);
        console.log(`    languages  : ${Object.entries(ctx.language_hints).filter(([, v]) => v).map(([k]) => k.replace('has_', '')).join(', ')}`);
        for (const x of checks) if (!x.ok) console.log(`      ✗ check ${x.name} → got ${x.got}`);
        console.log('');
    }
    console.log(`Stage 3 summary: ${pass} pass, ${fail} fail (out of ${cases.length})\n`);

    // Stage 4 — only run if the RapidAPI LLM gateway is reachable
    const runStage4 = process.env.RUN_STAGE4 === '1';
    if (!runStage4) {
        console.log('Stage 4 (LLM) skipped. Set RUN_STAGE4=1 to exercise it.');
        process.exit(fail === 0 ? 0 : 1);
    }

    console.log('═══ Stage 4 — politicalSentimentService (LLM, live) ═══\n');
    for (const c of cases) {
        const ctx = buildPoliticalContext(c.text, { taggedKeyword: '', authorHandle: '' });
        const v = await analyzePoliticalSentiment(c.text, ctx);
        console.log(`• ${c.label}`);
        console.log(`    stance=${v.stance}  bsk_sentiment=${v.bsk_sentiment}  beneficiary=${v.beneficiary}  provider=${v.provider}`);
        console.log(`    narrative: ${v.narrative_direction}`);
        console.log(`    reasoning: ${v.reasoning}\n`);
    }
    process.exit(fail === 0 ? 0 : 1);
})();
