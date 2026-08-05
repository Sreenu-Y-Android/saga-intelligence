/**
 * scopeMiddleware
 * ─────────────────────────────────────────────────────────────────────
 * Row-level access control on top of the existing JWT auth + page-level
 * RBAC. Determines, per request, which constituencies / Lok Sabha seats
 * the logged-in user is allowed to see, and exposes the result on
 * `req.scope` so downstream controllers can attach Mongo filters.
 *
 * Roles:
 *   • superadmin / super_admin  → full visibility (canSeeAll = true)
 *   • mla                       → exactly one assigned_constituency
 *   • mp                        → one assigned_lok_sabha (all child ACs)
 *   • special_leader               → one assigned_constituency (set per
 *                                  deployment; super admin may grant more
 *                                  via extra_constituencies)
 *   • anything else (level-1, analyst, viewer, …) → backwards-compatible
 *                                  full visibility, to avoid breaking the
 *                                  ops console while RBAC rolls out.
 */

const { normalizeRole } = require('../utils/authIdentity');
const { getMlaByConstituency } = require('../services/mlaReferenceService');
const LS_TO_AC = require('../data/ls_to_ac.json');
const ConstituencyMaster = require('../models/ConstituencyMaster');

const normalizeKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim();

const SCOPED_ROLES = new Set(['mla', 'mp', 'special_leader', 'constituency_manager']);

// Roles that see every constituency but are NOT super admins (read-only state view).
const STATEWIDE_READ_ROLES = new Set(['party_leadership']);

// Resolve a Lok Sabha key to its child AC names. Accepts the LS slug
// (`tirupati`) or a display name (`Tirupati (SC)`).
const childAcsForLs = (ls) => {
  if (!ls) return [];
  const direct = LS_TO_AC[ls];
  if (direct) return direct;
  const key = normalizeKey(ls);
  const hit = Object.keys(LS_TO_AC).find((k) => normalizeKey(k) === key);
  return hit ? LS_TO_AC[hit] : [];
};

const buildScope = (user) => {
  const role = normalizeRole(user?.role);
  if (role === 'superadmin') {
    return {
      isSuperAdmin: true,
      canSeeAll: true,
      role,
      constituencies: [],
      constituencyKeys: new Set(),
      lokSabha: null,
    };
  }

  if (STATEWIDE_READ_ROLES.has(role)) {
    // Party leadership: sees everything, but isn't an admin.
    return {
      isSuperAdmin: false,
      canSeeAll: true,
      role,
      constituencies: [],
      constituencyKeys: new Set(),
      lokSabha: null,
    };
  }

  if (!SCOPED_ROLES.has(role)) {
    // Legacy/back-office roles keep full visibility for now.
    return {
      isSuperAdmin: false,
      canSeeAll: true,
      role,
      constituencies: [],
      constituencyKeys: new Set(),
      lokSabha: null,
    };
  }

  const constituencies = [];
  if (user.assigned_constituency) constituencies.push(user.assigned_constituency);
  (user.extra_constituencies || []).forEach((c) => {
    if (c) constituencies.push(c);
  });

  // MP role: expand the LS seat into all of its child ACs so the MP sees
  // grievances / alerts / sentiment across the whole parliamentary seat.
  if (role === 'mp' && user.assigned_lok_sabha) {
    const childAcs = childAcsForLs(user.assigned_lok_sabha);
    childAcs.forEach((ac) => {
      if (!constituencies.some((c) => normalizeKey(c) === normalizeKey(ac))) {
        constituencies.push(ac);
      }
    });
  }

  const constituencyKeys = new Set(constituencies.map(normalizeKey).filter(Boolean));

  return {
    isSuperAdmin: false,
    canSeeAll: false,
    role,
    constituencies,
    constituencyKeys,
    lokSabha: user.assigned_lok_sabha || null,
  };
};

const loadScope = (req, _res, next) => {
  if (!req.user) {
    req.scope = { isSuperAdmin: false, canSeeAll: false, role: null, constituencies: [], constituencyKeys: new Set(), lokSabha: null };
    return next();
  }
  req.scope = buildScope(req.user);
  next();
};

/**
 * Hard guard: 403 if the request targets a constituency the caller isn't
 * scoped to. `getConstituency` may be a string or a (req)=>string resolver.
 */
const requireConstituencyAccess = (getConstituency) => (req, res, next) => {
  if (!req.scope) req.scope = buildScope(req.user);
  if (req.scope.canSeeAll) return next();

  const raw = typeof getConstituency === 'function' ? getConstituency(req) : getConstituency;
  if (!raw) return res.status(400).json({ code: 'CONSTITUENCY_REQUIRED', message: 'Constituency parameter missing' });

  const key = normalizeKey(raw);
  if (req.scope.constituencyKeys.has(key)) return next();

  // If the user is an MP, accept any AC inside their LS seat. Resolving the
  // LS-AC mapping at runtime keeps this dependency-free.
  if (req.scope.role === 'mp' && req.scope.lokSabha) {
    const mla = getMlaByConstituency(raw);
    if (mla && normalizeKey(mla.lok_sabha) === normalizeKey(req.scope.lokSabha)) return next();
  }

  return res.status(403).json({
    code: 'CONSTITUENCY_FORBIDDEN',
    message: 'You are not authorized to view this constituency',
  });
};

/**
 * Returns a Mongo filter fragment to AND into queries on collections that
 * carry `detected_location.constituency`. Empty for super-admins / legacy.
 *
 * Pass `{ field }` to use a different path (e.g. 'constituency' on Alert).
 */
const constituencyFilter = (scope, opts = {}) => {
  const {
    field = 'detected_location.constituency',
    // Extra fields that should also match the user's allowed seats. When a
    // grievance fans out to multiple constituencies via routing_targets,
    // pass `extraFields: ['routing_targets.constituencies']` so each matched
    // MLA still sees the post even if it's not the primary detected_location.
    extraFields = [],
  } = opts;

  if (!scope || scope.canSeeAll) return {};
  const allowed = [...(scope.constituencies || [])];
  if (allowed.length === 0) {
    // User has no constituency assigned — deny everything.
    return { _id: { $exists: false } };
  }
  const regex = allowed
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const rx = { $regex: `^(${regex})$`, $options: 'i' };

  if (extraFields.length === 0) return { [field]: rx };
  return { $or: [{ [field]: rx }, ...extraFields.map((f) => ({ [f]: rx }))] };
};

/**
 * Mongo filter fragment for collections that follow the owned-vs-party-wide
 * pattern (e.g. Source, Keyword): a scoped user sees party-wide entries OR
 * entries tagged to one of their seats. Empty for super-admins / legacy.
 */
const sourceScopeFilter = (scope) => {
  if (!scope || scope.canSeeAll) return {};
  const seats = scope.constituencies || [];
  if (seats.length === 0) return { _id: { $exists: false } };
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = `^(${seats.map(esc).join('|')})$`;
  return {
    $or: [
      { is_party_wide: true },
      { constituency: { $regex: rx, $options: 'i' } },
    ],
  };
};

/**
 * Merge a filter fragment into a Mongo query object safely. If both sides
 * carry `$or`, they are AND-combined under `$and` so neither is silently
 * dropped (the way a plain `Object.assign` would). Use this whenever you
 * mix `constituencyFilter` / `sourceScopeFilter` into a query that may
 * already contain user-driven `$or` clauses (handle search, category OR,
 * location OR etc.).
 */
const mergeFilter = (target, fragment) => {
  if (!fragment || Object.keys(fragment).length === 0) return target;
  for (const [k, v] of Object.entries(fragment)) {
    if (k === '$or' && target.$or) {
      target.$and = [...(target.$and || []), { $or: target.$or }, { $or: v }];
      delete target.$or;
    } else if (k === '$and' && target.$and) {
      target.$and = [...target.$and, ...v];
    } else {
      target[k] = v;
    }
  }
  return target;
};

/**
 * Geographic scope (used by the Geographic Intelligence module).
 *
 * District-level access is DERIVED from the caller's existing constituency
 * scope via ConstituencyMaster (ac_key → district_key) rather than adding a
 * new `User.assigned_district` field — every scoped role already carries an
 * `assigned_constituency` / `assigned_lok_sabha`, and ConstituencyMaster is
 * the authoritative AC→district mapping, so this needs zero schema change.
 *
 * Shape:
 *   {
 *     canSeeAll:   boolean,               // state-wide visibility
 *     level:       'state' | 'district',  // what the UI should land on
 *     districtKeys: Set<string>,          // normKey()'d district keys allowed
 *     districts:   [{ key, name }],       // display list for scoped users
 *     role:        string,
 *   }
 */
const buildGeoScope = async (user) => {
  const scope = buildScope(user);

  if (scope.canSeeAll) {
    return {
      canSeeAll: true,
      level: 'state',
      districtKeys: new Set(),
      districts: [],
      role: scope.role,
    };
  }

  if (!scope.constituencies.length) {
    // Scoped role with no constituency assigned yet — deny everything,
    // consistent with constituencyFilter()'s "no seats → match nothing".
    return {
      canSeeAll: false,
      level: 'district',
      districtKeys: new Set(),
      districts: [],
      role: scope.role,
    };
  }

  const acKeys = scope.constituencies.map(ConstituencyMaster.normKey);
  const masters = await ConstituencyMaster
    .find({ ac_key: { $in: acKeys } })
    .select('district district_key')
    .lean();

  const districtMap = new Map();
  masters.forEach((m) => {
    if (m.district_key && m.district) districtMap.set(m.district_key, m.district);
  });

  return {
    canSeeAll: false,
    level: 'district',
    districtKeys: new Set(districtMap.keys()),
    districts: Array.from(districtMap.entries()).map(([key, name]) => ({ key, name })),
    role: scope.role,
  };
};

const loadGeoScope = async (req, res, next) => {
  try {
    req.geoScope = await buildGeoScope(req.user);
    next();
  } catch (error) {
    console.error('[geoScope] failed to build scope:', error.message);
    res.status(500).json({ message: 'Failed to resolve geographic scope' });
  }
};

module.exports = {
  loadScope,
  buildScope,
  requireConstituencyAccess,
  constituencyFilter,
  mergeFilter,
  sourceScopeFilter,
  normalizeScopeKey: normalizeKey,
  buildGeoScope,
  loadGeoScope,
};
