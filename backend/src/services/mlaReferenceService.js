/**
 * mlaReferenceService
 * ─────────────────────────────────────────────────────────────────────
 * Read-only reference layer over the Telangana MLA dataset (119 assembly
 * constituencies, 2023 assembly election + subsequent defections).
 *
 * This is the backend source of truth for MLA ↔ constituency mapping. The
 * dataset itself is GENERATED — run `node scripts/build_tg_mlas.js` after
 * editing `frontend/src/data/telanganaMlaDirectory.js` or
 * `backend/src/config/politicalData.js`. Do not hand-edit tg_mlas.json.
 *
 * Powers the Constituency War Room intelligence endpoints (party-strategist
 * view) and the MLA profile pages.
 *
 * Also exposes a lightweight, multilingual civic-issue classifier so we can
 * bucket grievance text into actionable categories (roads, water, power, …)
 * without an LLM call.
 */

const TG_MLAS = require('../data/tg_mlas.json');
const {
  normalizeConstituencyKey,
  formatConstituencyLabel,
} = require('../config/constituencyNormalizer');
const { normalizeDistrict } = require('../config/districtNormalizer');

const MLA_BY_KEY = TG_MLAS.reduce((acc, m) => {
  acc[m.key || normalizeConstituencyKey(m.constituency)] = m;
  return acc;
}, {});

const MLA_BY_DISTRICT = TG_MLAS.reduce((acc, m) => {
  if (!m.districtKey) return acc;
  (acc[m.districtKey] = acc[m.districtKey] || []).push(m);
  return acc;
}, {});

const getMlaByConstituency = (name) => MLA_BY_KEY[normalizeConstituencyKey(name)] || null;

const getMlasByDistrict = (name) => {
  const key = normalizeDistrict(name);
  return key ? MLA_BY_DISTRICT[key] || [] : [];
};

const getAllMlas = () => TG_MLAS;

/** Seat counts by party — the assembly's current composition. */
const getPartyStrength = () =>
  TG_MLAS.reduce((acc, m) => {
    acc[m.party] = (acc[m.party] || 0) + 1;
    return acc;
  }, {});

/* ─── parse "Rs 14,27,05,249 ~ 14 Crore+" → numeric rupees ──────────
 * The ADR affidavit fields are not populated for Telangana yet; this is
 * retained so the constituency-intel endpoints keep working unchanged if
 * an affidavit dataset is loaded later.
 */
const parseRupees = (raw) => {
  if (!raw) return 0;
  const m = String(raw).match(/Rs\s*([0-9,]+)/i);
  if (!m) return 0;
  return Number(m[1].replace(/,/g, '')) || 0;
};

/* ─── multilingual civic-issue lexicon ────────────────────────────── */
/* Each category maps to substring tokens in English + Telugu + Hindi + Urdu.
 * Urdu is included because a large share of Hyderabad old-city grievances
 * arrive in Urdu script and would otherwise classify as uncategorised. */
const ISSUE_LEXICON = {
  roads: [
    'road', 'pothole', 'highway', 'flyover', 'bridge', 'cc road',
    'రోడ్డు', 'రహదారి', 'గుంత', 'వంతెన',
    'सड़क', 'गड्ढा', 'पुल',
    'سڑک', 'پل',
  ],
  water: [
    'water', 'drinking water', 'tap', 'borewell', 'pipeline', 'tanker', 'mission bhagiratha',
    'నీళ్లు', 'నీరు', 'తాగునీరు', 'మంచినీరు', 'బోరు', 'మిషన్ భగీరథ',
    'पानी', 'नल', 'पेयजल',
    'پانی', 'نلکا',
  ],
  electricity: [
    'power', 'electricity', 'current', 'transformer', 'power cut', 'voltage',
    'కరెంట్', 'విద్యుత్', 'ట్రాన్స్‌ఫార్మర్',
    'बिजली', 'करंट', 'ट्रांसफार्मर',
    'بجلی',
  ],
  drainage: [
    'drainage', 'sewage', 'sewer', 'gutter', 'manhole', 'flooding', 'nala',
    'డ్రైనేజీ', 'మురుగు', 'కాలువ', 'నాలా',
    'नाली', 'सीवर', 'जल निकासी',
    'نالی',
  ],
  sanitation: [
    'garbage', 'sanitation', 'toilet', 'cleaning', 'waste', 'dump',
    'చెత్త', 'పారిశుధ్యం', 'మరుగుదొడ్డి',
    'कचरा', 'सफाई', 'शौचालय',
    'کچرا', 'صفائی',
  ],
  health: [
    'hospital', 'phc', 'ambulance', 'doctor', 'medicine', 'clinic', 'health', 'arogyasri',
    'ఆస్పత్రి', 'వైద్యం', 'డాక్టర్', 'మందులు', 'ఆరోగ్యశ్రీ',
    'अस्पताल', 'डॉक्टर', 'दवा', 'स्वास्थ्य',
    'اسپتال', 'ڈاکٹر',
  ],
  education: [
    'school', 'college', 'teacher', 'education', 'student', 'scholarship', 'fees',
    'gurukul', 'residential school',
    'పాఠశాల', 'కళాశాల', 'ఉపాధ్యాయుడు', 'విద్య', 'ఫీజు', 'గురుకులం',
    'स्कूल', 'कॉलेज', 'शिक्षा', 'फीस',
    'اسکول', 'کالج',
  ],
  employment: [
    'job', 'jobs', 'employment', 'unemployment', 'salary', 'wages', 'mgnrega',
    'notification', 'tspsc', 'tgpsc', 'group 1', 'group 2',
    'ఉద్యోగం', 'నిరుద్యోగం', 'జీతం', 'కూలి', 'నోటిఫికేషన్',
    'नौकरी', 'रोजगार', 'बेरोजगारी', 'वेतन',
    'نوکری', 'روزگار',
  ],
  agriculture: [
    'farmer', 'crop', 'fertilizer', 'irrigation', 'rythu', 'paddy', 'msp',
    'rythu bharosa', 'rythu bandhu', 'loan waiver', 'kaleshwaram',
    'రైతు', 'పంట', 'ఎరువు', 'సాగు', 'వ్యవసాయం', 'రుణమాఫీ', 'రైతుభరోసా',
    'किसान', 'फसल', 'खाद', 'सिंचाई',
    'کسان', 'فصل',
  ],
  welfare: [
    'pension', 'ration', 'subsidy', 'scheme', 'beneficiary', 'card',
    'gruha jyothi', 'indiramma', 'cheyutha', 'kalyana lakshmi', 'shaadi mubarak',
    'పెన్షన్', 'రేషన్', 'పథకం', 'సబ్సిడీ', 'గృహజ్యోతి', 'ఇందిరమ్మ', 'కళ్యాణలక్ష్మి',
    'पेंशन', 'राशन', 'योजना', 'सब्सिडी',
    'پنشن', 'راشن', 'شادی مبارک',
  ],
  law_and_order: [
    'police', 'crime', 'theft', 'assault', 'safety', 'illegal', 'goonda', 'liquor',
    'పోలీసు', 'నేరం', 'దొంగతనం', 'రక్షణ', 'మద్యం',
    'पुलिस', 'अपराध', 'चोरी', 'सुरक्षा',
    'پولیس', 'جرم',
  ],
};

const ISSUE_CATEGORIES = Object.keys(ISSUE_LEXICON);

/**
 * Classify a piece of grievance text into civic-issue categories.
 * Returns an array of matched category keys (may be empty).
 */
const classifyIssues = (text) => {
  const lower = String(text || '').toLowerCase();
  if (!lower) return [];
  const hits = [];
  for (const [category, tokens] of Object.entries(ISSUE_LEXICON)) {
    if (tokens.some((t) => lower.includes(t.toLowerCase()))) hits.push(category);
  }
  return hits;
};

module.exports = {
  TG_MLAS,
  // Legacy alias — AP-era callers referenced the dataset as AP_MLAS.
  AP_MLAS: TG_MLAS,
  ISSUE_CATEGORIES,
  ISSUE_LEXICON,
  normalizeConstituencyKey,
  formatConstituencyLabel,
  getMlaByConstituency,
  getMlasByDistrict,
  getAllMlas,
  getPartyStrength,
  parseRupees,
  classifyIssues,
};
