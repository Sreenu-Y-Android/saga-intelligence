/**
 * politicalEntities.js
 * ─────────────────────────────────────────────────────────────────────
 * Telangana + INC-centric political entity graph.
 *
 * This module is a DERIVED VIEW over `politicalData.js`, which remains the
 * single source of truth for who exists in the political universe. Adding a
 * minister, MLA or opposition leader to `politicalData.js` automatically
 * lands here — no edits needed in this file.
 *
 * What this layer adds on top of the roster:
 *   • `alignment`  — 'ally' | 'opposition' | 'neutral' (from roster `side`)
 *   • `priority`   — who wins when several entities appear in one post
 *   • `aliases`    — transliterations (Telugu / Hindi / Urdu), nicknames,
 *                    handles and symbol-names that the roster does not carry
 *   • ALIAS_INDEX  — flat alias → entityKey lookup, longest-alias-first so
 *                    "revanth reddy" beats a bare "reddy"
 *
 * Consumed by `politicalContextService`, which turns a post into a snapshot
 * of who it is about and how it relates to the client (INC / CM Revanth Reddy).
 */

const {
    OUR_PARTY,
    OPPOSITION_PARTIES,
    CABINET_MINISTERS,
    CONGRESS_MLAS,
    OPPOSITION_LEADERS,
} = require('./politicalData');

/* ─── priority bands ───────────────────────────────────────────────────
 * Higher wins when a single post names several entities. The bands are
 * deliberately spaced so an entire band can be re-tuned without colliding
 * with its neighbours.
 */
const PRIORITY = {
    CHIEF_MINISTER: 100,
    DEPUTY_CM: 95,
    OPPOSITION_CHIEF: 92,
    OUR_PARTY: 85,
    OPPOSITION_PARTY: 88,
    CABINET_MINISTER: 80,
    OPPOSITION_LEADER: 70,
    OUR_MLA: 60,
    INSTITUTION: 40,
};

/**
 * Curated aliases for entities that dominate Telangana political discourse.
 * Keyed by the roster `id`. Merged on top of the auto-derived aliases
 * (name / shortName / roster aliases / handles) rather than replacing them.
 *
 * Telugu is the first language of the feed, so Telugu spellings matter more
 * than English ones here — most organic posts never use the roman spelling.
 */
const CURATED_ALIASES = {
    // ── Ours ──────────────────────────────────────────────────────────
    'revanth-reddy': [
        'revanth', 'revanth reddy', 'anumula revanth reddy', 'cm revanth',
        'revanth anna', 'revanth garu', '#revanthreddy', '#cmrevanthreddy',
        'రేవంత్', 'రేవంత్ రెడ్డి', 'అనుముల రేవంత్ రెడ్డి', 'సీఎం రేవంత్', 'రేవంత్ అన్న',
        'रेवंत रेड्डी', 'रेवंत',
    ],
    'bhatti-vikramarka': [
        'bhatti', 'bhatti vikramarka', 'mallu bhatti vikramarka', 'deputy cm bhatti',
        'భట్టి', 'భట్టి విక్రమార్క', 'మల్లు భట్టి విక్రమార్క', 'డిప్యూటీ సీఎం భట్టి',
        'भट्टी विक्रमार्का',
    ],
    'uttam-kumar': [
        'uttam kumar reddy', 'uttam reddy', 'ఉత్తమ్ కుమార్ రెడ్డి', 'ఉత్తమ్',
    ],
    'sridhar-babu': [
        'sridhar babu', 'duddilla sridhar babu', 'శ్రీధర్ బాబు', 'దుద్దిళ్ల శ్రీధర్ బాబు',
    ],
    'seethakka': [
        'seethakka', 'danasari anasuya', 'సీతక్క', 'దనసరి అనసూయ',
    ],
    'ponnam-prabhakar': ['ponnam', 'ponnam prabhakar', 'పొన్నం', 'పొన్నం ప్రభాకర్'],
    'venkat-reddy': ['komatireddy venkat reddy', 'కోమటిరెడ్డి వెంకట్ రెడ్డి'],
    'konda-surekha': ['konda surekha', 'కొండా సురేఖ'],

    // ── Opposition ────────────────────────────────────────────────────
    kcr: [
        'kcr', 'k chandrashekar rao', 'chandrashekar rao', 'chandrasekhar rao',
        'kalvakuntla chandrashekar rao', 'former cm kcr',
        'కేసీఆర్', 'కె. చంద్రశేఖర్ రావు', 'చంద్రశేఖర్ రావు', 'కల్వకుంట్ల చంద్రశేఖర్ రావు',
        'चंद्रशेखर राव', 'केसीआर',
    ],
    ktr: [
        'ktr', 'k t rama rao', 'kt rama rao', 'taraka rama rao',
        'kalvakuntla taraka rama rao',
        'కేటీఆర్', 'కె.టి. రామారావు', 'తారక రామారావు', 'కల్వకుంట్ల తారక రామారావు',
        'केटीआर',
    ],
    'harish-rao': [
        'harish rao', 'thanneeru harish rao', 't harish rao',
        'హరీష్ రావు', 'తన్నీరు హరీష్ రావు',
        'हरीश राव',
    ],
    'kishan-reddy': ['kishan reddy', 'g kishan reddy', 'కిషన్ రెడ్డి', 'జి. కిషన్ రెడ్డి'],
    'bandi-sanjay': ['bandi sanjay', 'bandi sanjay kumar', 'బండి సంజయ్', 'బండి సంజయ్ కుమార్'],
    'eatala-rajender': ['eatala', 'eatala rajender', 'ఈటల', 'ఈటల రాజేందర్'],
    'asaduddin-owaisi': [
        'owaisi', 'asaduddin owaisi', 'asad owaisi',
        'ఒవైసీ', 'అసదుద్దీన్ ఒవైసీ',
        'اسد الدین اویسی', 'اویسی',
    ],
    'akbaruddin-owaisi': [
        'akbaruddin', 'akbaruddin owaisi', 'అక్బరుద్దీన్', 'అక్బరుద్దీన్ ఒవైసీ',
        'اکبر الدین اویسی',
    ],
    modi: [
        'narendra modi', 'modi', 'modi ji', 'pm modi',
        'నరేంద్ర మోదీ', 'మోదీ', 'ప్రధాని మోదీ',
        'नरेंद्र मोदी', 'मोदी',
    ],
    'amit-shah': ['amit shah', 'అమిత్ షా', 'अमित शाह'],
};

/** Party-level aliases, keyed by party id. */
const PARTY_ALIASES = {
    inc: [
        'congress', 'indian national congress', 'inc', 'congress party',
        'hand symbol party', 'hath party', '#congress', '#inc', '@incindia',
        '@incTelangana', 'telangana congress', 'tpcc',
        'కాంగ్రెస్', 'కాంగ్రెస్ పార్టీ', 'ఇండియన్ నేషనల్ కాంగ్రెస్', 'హస్తం పార్టీ',
        'तेलंगाना कांग्रेस', 'कांग्रेस',
    ],
    brs: [
        'brs', 'trs', 'bharat rashtra samithi', 'telangana rashtra samithi',
        'car symbol party', 'car party', '#brs', '#trs', '@brsparty',
        'బీఆర్ఎస్', 'టీఆర్ఎస్', 'భారత రాష్ట్ర సమితి', 'తెలంగాణ రాష్ట్ర సమితి', 'కారు పార్టీ',
        'भारत राष्ट्र समिति', 'कार पार्टी',
    ],
    bjp: [
        'bjp', 'bharatiya janata party', 'lotus symbol party', '#bjp',
        '@bjp4india', '@bjp4telangana', 'telangana bjp',
        'బీజేపీ', 'భారతీయ జనతా పార్టీ', 'కమలం పార్టీ',
        'भारतीय जनता पार्टी', 'भाजपा',
    ],
    aimim: [
        'aimim', 'mim', 'majlis', 'all india majlis-e-ittehadul muslimeen',
        '#aimim', '@aimim_national',
        'ఎంఐఎం', 'మజ్లిస్', 'ఏఐఎంఐఎం',
        'مجلس', 'اتحاد المسلمین',
    ],
};

/* ─── neutral civic institutions ───────────────────────────────────── */

const NEUTRAL_ENTITIES = {
    telangana_police: {
        canonical: 'Telangana Police',
        type: 'institution',
        alignment: 'neutral',
        priority: PRIORITY.INSTITUTION,
        aliases: [
            'telangana police', 'ts police', 'hyderabad police', 'cyberabad police',
            'rachakonda police', '@telanganacops', '@hydcitypolice',
            'తెలంగాణ పోలీస్', 'హైదరాబాద్ పోలీస్', 'పోలీస్',
            'तेलंगाना पुलिस',
        ],
    },
    election_commission: {
        canonical: 'Election Commission',
        type: 'institution',
        alignment: 'neutral',
        priority: PRIORITY.INSTITUTION - 10,
        aliases: [
            'election commission', 'eci', 'ceo telangana', 'state election commission',
            'ఎన్నికల సంఘం', 'ఎన్నికల కమిషన్',
            'निर्वाचन आयोग',
        ],
    },
};

/* ─── derivation ───────────────────────────────────────────────────── */

const clean = (v) => String(v || '').trim();

/**
 * Aliases every roster entry contributes for free: its full name, short name,
 * any roster-declared aliases, and each handle in both @-prefixed and bare form.
 */
const deriveRosterAliases = (leader) => {
    const out = [
        clean(leader.name),
        clean(leader.shortName),
        ...(leader.aliases || []).map(clean),
    ];

    for (const handle of leader.handles || []) {
        const bare = clean(handle).replace(/^@/, '');
        if (!bare) continue;
        out.push(`@${bare}`, bare.toLowerCase());
    }

    return out.filter(Boolean);
};

const buildLeaderEntity = (leader, { alignment, priority }) => ({
    canonical: leader.name,
    type: 'person',
    party: (leader.party || '').toLowerCase() || null,
    role: leader.role || null,
    constituency: leader.constituency || null,
    district: leader.district || null,
    alignment,
    priority,
    aliases: [
        ...new Set([
            ...deriveRosterAliases(leader),
            ...(CURATED_ALIASES[leader.id] || []),
        ]),
    ],
});

/**
 * A cabinet minister's rank is not uniform — the CM and Deputy CM sit in
 * their own bands because the whole relevance model pivots on them.
 */
const ministerPriority = (leader) => {
    const role = (leader.role || '').toLowerCase();
    if (role.includes('chief minister') && !role.includes('deputy')) return PRIORITY.CHIEF_MINISTER;
    if (role.includes('deputy chief minister')) return PRIORITY.DEPUTY_CM;
    return PRIORITY.CABINET_MINISTER;
};

const opponentPriority = (leader) => {
    const role = (leader.role || '').toLowerCase();
    if (role.includes('former cm') || role.includes('chief') || role.includes('president')) {
        return PRIORITY.OPPOSITION_CHIEF;
    }
    if (role.includes('working president')) return PRIORITY.OPPOSITION_CHIEF - 2;
    return PRIORITY.OPPOSITION_LEADER;
};

const POLITICAL_ENTITIES = {};

// Our leadership + cabinet
for (const minister of CABINET_MINISTERS) {
    POLITICAL_ENTITIES[minister.id] = buildLeaderEntity(minister, {
        alignment: 'ally',
        priority: ministerPriority(minister),
    });
}

// Our MLAs
for (const mla of CONGRESS_MLAS) {
    POLITICAL_ENTITIES[mla.id] = buildLeaderEntity(mla, {
        alignment: 'ally',
        priority: PRIORITY.OUR_MLA,
    });
}

// Opposition leaders
for (const leader of OPPOSITION_LEADERS) {
    POLITICAL_ENTITIES[leader.id] = buildLeaderEntity(leader, {
        alignment: 'opposition',
        priority: opponentPriority(leader),
    });
}

// Our party
POLITICAL_ENTITIES[OUR_PARTY.id] = {
    canonical: OUR_PARTY.full_name,
    type: 'party',
    party: OUR_PARTY.id,
    role: `${OUR_PARTY.role} party in ${OUR_PARTY.state}`,
    alignment: 'ally',
    priority: PRIORITY.OUR_PARTY,
    aliases: [
        ...new Set([
            OUR_PARTY.name,
            OUR_PARTY.full_name,
            ...(OUR_PARTY.aliases || []),
            ...(PARTY_ALIASES[OUR_PARTY.id] || []),
        ].map(clean).filter(Boolean)),
    ],
};

// Opposition parties
for (const party of OPPOSITION_PARTIES) {
    POLITICAL_ENTITIES[party.id] = {
        canonical: party.full_name,
        type: 'party',
        party: party.id,
        role: null,
        alignment: 'opposition',
        priority: PRIORITY.OPPOSITION_PARTY,
        aliases: [
            ...new Set([
                party.name,
                party.full_name,
                ...(party.aliases || []),
                ...(PARTY_ALIASES[party.id] || []),
            ].map(clean).filter(Boolean)),
        ],
    };
}

// Neutral institutions
Object.assign(POLITICAL_ENTITIES, NEUTRAL_ENTITIES);

/**
 * Build a flat, lowercase-keyed reverse index from alias → entity key.
 * Sorted longest-first so multi-word matches win over shorter substrings
 * ("revanth reddy" must beat a bare "reddy", "harish rao" must beat "rao").
 */
const buildAliasIndex = () => {
    const entries = [];
    const seen = new Set();

    for (const [key, ent] of Object.entries(POLITICAL_ENTITIES)) {
        for (const alias of ent.aliases || []) {
            const normalized = String(alias).toLowerCase().trim();
            if (!normalized) continue;

            // An alias may only ever resolve to one entity. First writer wins,
            // and because entities are inserted leadership-first that is the
            // more senior figure — so a name shared between a minister and a
            // backbencher resolves to the minister rather than matching both.
            if (seen.has(normalized)) continue;
            seen.add(normalized);

            entries.push({ alias: normalized, entityKey: key });
        }
    }

    entries.sort((a, b) => b.alias.length - a.alias.length);
    return entries;
};

const ALIAS_INDEX = buildAliasIndex();

/* ─── target universe ──────────────────────────────────────────────── */

/**
 * The "target" is the client leadership the whole sentiment pipeline is
 * measured against: the CM and the Deputy CM. The party itself is an ally
 * rather than a target, mirroring how a post praising INC is weaker evidence
 * about the CM than a post naming him outright.
 */
const PRIMARY_TARGET_KEY = 'revanth-reddy';
const SECONDARY_TARGET_KEY = 'bhatti-vikramarka';
const TARGET_KEYS = new Set([PRIMARY_TARGET_KEY, SECONDARY_TARGET_KEY]);

const isAlly = (key) => POLITICAL_ENTITIES[key]?.alignment === 'ally';
const isOpposition = (key) => POLITICAL_ENTITIES[key]?.alignment === 'opposition';
const isNeutral = (key) => POLITICAL_ENTITIES[key]?.alignment === 'neutral';
const isPrimaryTarget = (key) => TARGET_KEYS.has(key);

/** Every alias that identifies the target leadership — used to score relevance
 *  when the fetcher's tagged keyword is the only signal available. */
const TARGET_ALIASES = [...TARGET_KEYS]
    .flatMap((key) => POLITICAL_ENTITIES[key]?.aliases || [])
    .map((a) => a.toLowerCase());

module.exports = {
    POLITICAL_ENTITIES,
    ALIAS_INDEX,
    PRIORITY,
    PRIMARY_TARGET_KEY,
    SECONDARY_TARGET_KEY,
    TARGET_KEYS,
    TARGET_ALIASES,
    isAlly,
    isOpposition,
    isNeutral,
    isPrimaryTarget,
    // Legacy alias — AP-era code called the target check `isBskTarget`.
    isBskTarget: isPrimaryTarget,
};
