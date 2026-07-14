import MLA_KEYWORD_OVERRIDES from '../data/mlaKeywords';

/**
 * Relevance weight per keyword type.
 * handle (5) — posted_by or @mention match → almost certainly about this person
 * primary (3) — full / short name literal match
 * alias (2) — role title / name variant
 * custom (2) — operator-added keyword
 * party (1) — party name alone (weak — many posts mention party without naming the person)
 * constituency (1) — location mention (noisy)
 */
const TYPE_WEIGHT = {
  handle:       5,
  primary:      3,
  alias:        2,
  topic:        2,
  custom:       2,
  party:        1,
  constituency: 1,
};

/**
 * Returns structured keyword categories for a politician entity.
 * Shape: { primary, constituency, aliases, handles, party, all }
 */
export const getEntityKeywords = (entity) => {
  if (!entity) {
    return { primary: [], constituency: [], aliases: [], handles: [], party: [], topics: [], all: [] };
  }

  const overrides = MLA_KEYWORD_OVERRIDES[entity.id] || {};

  const primary      = [...new Set([entity.name, entity.shortName].filter(Boolean))];
  const constituency = [entity.constituency].filter(Boolean);
  const aliases      = overrides.aliases  || [];
  const handles      = overrides.handles  || [];
  const party        = overrides.party    || [];
  const topics       = overrides.topics   || [];

  return {
    primary,
    constituency,
    aliases,
    handles,
    party,
    topics,
    all: [...primary, ...constituency, ...aliases, ...handles, ...party, ...topics],
  };
};

/**
 * Flat keyword list used by the UI (pills) and fetch dispatcher.
 * Each item: { id, term, type, label, isSystem }
 * Handle items also carry `withAt` (the @-prefixed form).
 */
export const buildKeywordList = (entity) => {
  if (!entity) return [];
  const kws = getEntityKeywords(entity);
  const list = [];
  let idx = 0;

  kws.primary.forEach(term => {
    list.push({ id: `primary_${idx++}`, term, type: 'primary', label: term, isSystem: true });
  });

  kws.constituency.forEach(term => {
    list.push({ id: `constituency_${idx++}`, term, type: 'constituency', label: `📍 ${term}`, isSystem: true });
  });

  kws.aliases.forEach(term => {
    list.push({ id: `alias_${idx++}`, term, type: 'alias', label: term, isSystem: true });
  });

  kws.handles.forEach(handle => {
    list.push({
      id:     `handle_${idx++}`,
      term:   handle,
      withAt: `@${handle}`,
      type:   'handle',
      label:  `@${handle}`,
      isSystem: true,
    });
  });

  kws.party.forEach(term => {
    list.push({ id: `party_${idx++}`, term, type: 'party', label: term, isSystem: true });
  });

  kws.topics.forEach(term => {
    list.push({ id: `topic_${idx++}`, term, type: 'topic', label: term, isSystem: true });
  });

  return list;
};

/**
 * Scores how strongly a text matches the keyword list.
 * Handle types check both bare and @-prefixed forms.
 */
export const scoreRelevance = (text, keywordList) => {
  if (!text || !keywordList?.length) return 0;
  const lower = text.toLowerCase();

  return keywordList.reduce((score, kw) => {
    if (!kw?.term) return score;
    const weight = TYPE_WEIGHT[kw.type] ?? 1;

    if (kw.type === 'handle') {
      const hit = lower.includes(kw.term.toLowerCase()) || lower.includes(`@${kw.term.toLowerCase()}`);
      return hit ? score + weight : score;
    }

    return lower.includes(kw.term.toLowerCase()) ? score + weight : score;
  }, 0);
};

/**
 * Strict post-fetch quality gate.
 * A grievance passes only when the politician is DIRECTLY mentioned
 * by name, alias, or handle. Constituency-only and party-only matches are rejected.
 */
export const isGrievanceRelevant = (grievance, entity) => {
  if (!grievance || !entity) return false;
  const kws = getEntityKeywords(entity);

  const text = [
    grievance.content?.full_text,
    grievance.content?.text,
    grievance.posted_by?.handle,
    grievance.posted_by?.display_name,
    grievance.tagged_account,
  ].filter(Boolean).join(' ').toLowerCase();

  const hasPrimary = kws.primary.some(k => text.includes(k.toLowerCase()));
  const hasAlias   = kws.aliases.some(k  => text.includes(k.toLowerCase()));
  const hasTopic   = kws.topics.some(k   => text.includes(k.toLowerCase()));
  const hasHandle  = kws.handles.some(h  =>
    text.includes(h.toLowerCase()) || text.includes(`@${h.toLowerCase()}`)
  );

  return hasPrimary || hasAlias || hasTopic || hasHandle;
};

/**
 * Returns ordered fetch-ready search terms.
 * Priority: handles (@mention) > primary names > aliases.
 */
export const getOrderedSearchTerms = (entity, maxTerms = 6) => {
  if (!entity) return [];
  const kws = getEntityKeywords(entity);
  const terms = [
    ...kws.handles.map(h => ({ term: `@${h}`, type: 'handle', raw: h })),
    ...kws.primary.map(t => ({ term: t, type: 'primary', raw: t })),
    ...kws.aliases.map(t => ({ term: t, type: 'alias', raw: t })),
    ...kws.topics.map(t => ({ term: t, type: 'topic', raw: t })),
  ];
  return terms.slice(0, maxTerms);
};
