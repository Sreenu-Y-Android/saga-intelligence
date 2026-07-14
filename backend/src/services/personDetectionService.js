const { ALL_LEADERS, OUR_PARTY, OPPOSITION_PARTIES, normalizeHandle } = require('../config/politicalData');

/**
 * Person Detection Service
 *
 * Deterministic resolution of political leaders mentioned in a post.
 * Scans BOTH our side and opposition (every entry in ALL_LEADERS carries
 * `side` and `party`), so downstream consumers can filter / decide stance.
 *
 * Detection tiers (in order, first match wins per leader):
 *   1. Handle match     — author handle, taggedAccount, @mentions, OR a
 *                         hashtag whose body equals the leader's handle
 *   2. Full name        — spacing-aware regex (handles spaces / underscores
 *                         / "no separator" in CamelCase hashtags)
 *   3a. Aliases         — curated acronyms (KCR, KTR) with strict word boundary
 *   3b. Short name      — only if length > 5 (avoids noise from common words)
 *   4. Role + name      — "CM Revanth", "Minister Sridhar Babu",
 *                         "#CMRevanth", "#MinisterSridharBabu"
 */

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Party-level entries (distinct from individual leaders). A post can attack
 * or praise a whole party — "TRS destroyed Telangana", "Congress govt is
 * useless" — with no leader named. Without this, such posts resolve zero
 * PRE-RESOLVED ENTITIES and the LLM has to guess the client-perspective
 * mapping from world knowledge alone. Aliases (e.g. "TRS" for BRS, the
 * party's pre-2022 name) MUST resolve to the same side as the party itself.
 */
const PARTY_ENTRIES = [
  {
    party_id: OUR_PARTY.id,
    name: OUR_PARTY.name,
    full_name: OUR_PARTY.full_name,
    aliases: OUR_PARTY.aliases || [OUR_PARTY.name],
    side: 'ours',
    party: OUR_PARTY.name
  },
  ...OPPOSITION_PARTIES.map((p) => ({
    party_id: p.id,
    name: p.name,
    full_name: p.full_name,
    aliases: p.aliases || [p.name],
    side: 'opposition',
    party: p.name
  }))
];

/**
 * Spacing-aware regex for a multi-token name.
 * Allows space, underscore, or zero separator between tokens —
 * so "Revanth Reddy", "Revanth_Reddy", and "RevanthReddy" all match.
 */
const buildNameRegex = (name) => {
  const parts = String(name).split(/\s+/).filter(Boolean);
  const pattern = parts.map(escapeRegex).join('[\\s_]*');
  return new RegExp(`(^|[^a-z0-9_])(${pattern})(?=$|[^a-z0-9_])`, 'i');
};

const ROLE_ALIASES = {
  'Chief Minister': ['CM', 'Chief Minister'],
  'Deputy Chief Minister': ['Deputy CM', 'DyCM', 'Deputy Chief Minister'],
  'Cabinet Minister': ['Minister', 'Cabinet Minister']
};

/**
 * Role + name pattern. Allows zero or more whitespace/underscore between
 * the role and the name, so it catches:
 *   "CM Revanth"           (full short name)
 *   "Minister Sridhar Babu" (full short name)
 *   "#CMRevanth"           (compound hashtag, no separator)
 *   "#MinisterSridharBabu" (compound hashtag, no separator)
 *   "CM Revanth"           (first token only)
 */
const buildRoleRegex = (role, shortName) => {
  const aliases = ROLE_ALIASES[role] || [role];
  const rolePart = aliases.map(escapeRegex).join('|');
  const tokens = String(shortName).split(/\s+/).filter(Boolean);
  const firstToken = tokens[0] || shortName;
  // Build a pattern that joins shortName tokens with optional [\s_] —
  // matches "Sridhar Babu", "Sridhar_Babu", and "SridharBabu".
  const fullPattern = tokens.map(escapeRegex).join('[\\s_]*');
  const namePart = firstToken === shortName
    ? escapeRegex(shortName)
    : `(?:${fullPattern}|${escapeRegex(firstToken)})`;
  return new RegExp(
    `(^|[^a-z0-9_])(${rolePart})[\\s_]*${namePart}(?=$|[^a-z0-9_])`,
    'i'
  );
};

/**
 * Extract hashtag bodies from text (the part after `#`).
 * Returns lowercase tokens, normalized as if they were handles.
 *
 * "#KTRBRS speech today #revanth_anumula"  →  ['ktrbrs', 'revanth_anumula']
 */
const extractHashtagBodies = (text) => {
  const out = [];
  const rx = /#([A-Za-z0-9_]+)/g;
  let m;
  while ((m = rx.exec(text || '')) !== null) {
    out.push(normalizeHandle(m[1]));
  }
  return out;
};

/**
 * @param {string} text
 * @param {object} metadata
 *   - mentions:       string[]  @handles in the post
 *   - hashtags:       string[]  hashtags in the post (with or without '#')
 *   - taggedAccount:  string    the account this post tagged/replied to
 *   - authorHandle:   string    the author's own handle
 * @returns {Promise<Array<{
 *   person_id, name, role, district, constituency,
 *   side, party, handle, handle_normalized, match_type
 * }>>}
 */
const detectPersons = async (text, metadata = {}) => {
  const results = [];
  const lowerText = String(text || '');

  const mentionSet = new Set(
    (metadata.mentions || []).map(normalizeHandle).filter(Boolean)
  );
  const taggedAccount = normalizeHandle(metadata.taggedAccount || '');
  const authorHandle = normalizeHandle(metadata.authorHandle || '');

  // Hashtag tokens — both from explicit metadata and parsed from text.
  // A leader's handle appearing as #handle is treated identically to @handle.
  const hashtagSet = new Set([
    ...((metadata.hashtags || []).map(normalizeHandle).filter(Boolean)),
    ...extractHashtagBodies(lowerText)
  ]);

  for (const leader of ALL_LEADERS) {
    let matchType = '';

    // Tier 1 — handle match (mentions, taggedAccount, authorHandle, hashtag-as-handle)
    const handles = leader.handles_normalized || [];
    const handleHit = handles.some(
      (h) =>
        mentionSet.has(h) ||
        hashtagSet.has(h) ||
        h === taggedAccount ||
        h === authorHandle
    );
    if (handleHit) {
      matchType = 'mention';
    }

    // Tier 2 — full name in text (handles spaces, underscores, CamelCase hashtags)
    if (!matchType && lowerText && buildNameRegex(leader.name).test(lowerText)) {
      matchType = 'text_match';
    }

    // Tier 3a — explicit aliases (e.g. KCR, KTR)
    if (!matchType && lowerText && Array.isArray(leader.aliases)) {
      for (const alias of leader.aliases) {
        if (alias && buildNameRegex(alias).test(lowerText)) {
          matchType = 'text_match';
          break;
        }
      }
    }

    // Tier 3b — short name in text (length > 5 only)
    if (
      !matchType &&
      lowerText &&
      leader.shortName &&
      leader.shortName.length > 5 &&
      buildNameRegex(leader.shortName).test(lowerText)
    ) {
      matchType = 'text_match';
    }

    // Tier 4 — role + short name combo
    if (
      !matchType &&
      lowerText &&
      leader.role &&
      leader.shortName &&
      buildRoleRegex(leader.role, leader.shortName).test(lowerText)
    ) {
      matchType = 'text_match';
    }

    if (matchType) {
      results.push({
        person_id: leader.id,
        name: leader.name,
        role: leader.role,
        district: leader.district,
        constituency: leader.constituency,
        side: leader.side,
        party: leader.party,
        handle: leader.primary_handle || '',
        handle_normalized: leader.primary_handle_normalized || '',
        match_type: matchType
      });
    }
  }

  // Party-level pass — catches generic party mentions ("TRS govt", "Congress
  // leaders") with no individual leader named. Runs independently of the
  // leader loop above; both can match on the same post without conflict.
  for (const partyEntry of PARTY_ENTRIES) {
    const aliasHit = lowerText && partyEntry.aliases.some(
      (alias) => alias && buildNameRegex(alias).test(lowerText)
    );
    if (!aliasHit) continue;

    results.push({
      person_id: `party:${partyEntry.party_id}`,
      name: partyEntry.full_name,
      role: 'Political Party',
      district: '',
      constituency: '',
      side: partyEntry.side,
      party: partyEntry.party,
      handle: '',
      handle_normalized: '',
      match_type: 'party_text_match'
    });
  }

  return results;
};

module.exports = {
  detectPersons
};
