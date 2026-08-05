/**
 * Telangana Political Watch — central media catalogue for the INC leadership
 * in Telangana (A. Revanth Reddy & Mallu Bhatti Vikramarka).
 *
 * Portraits are served from /public so the app has no third-party image
 * dependency at runtime. Remote Wikipedia URLs (via the stable
 * Special:FilePath redirect) are used only for landmark/party imagery where no
 * local asset exists; if any of those fail, the image helper falls back to
 * LOCAL_FALLBACK so the UI never breaks.
 *
 * To swap any image, edit the `src` field — no other code needs to change.
 */

const wiki = (filename) =>
  `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;

/* ─── Portrait & action shots of the INC Telangana leadership ─────── */
export const PARTY_PORTRAITS = [
  {
    id: 'portrait-primary',
    src: '/CM.webp',
    alt: 'A. Revanth Reddy — Chief Minister of Telangana',
    caption: 'Chief Minister · Telangana',
  },
  {
    id: 'portrait-secondary',
    src: '/CM1.webp',
    alt: 'Mallu Bhatti Vikramarka — Deputy Chief Minister of Telangana',
    caption: 'Deputy Chief Minister · Telangana',
  },
];

/** The "hero" image used across the app (login, header, dashboard avatar). */
export const PARTY_HERO = PARTY_PORTRAITS[0];

/* ─── Telangana landmark imagery ──────────────────────────────────── */
export const STATE_GALLERY = [
  {
    id: 'tg-charminar',
    src: wiki('Charminar-Pride of Hyderabad.jpg'),
    alt: 'Charminar, Hyderabad',
    caption: 'Charminar · Hyderabad',
  },
  {
    id: 'tg-golconda',
    src: wiki('Golconda Fort 01.jpg'),
    alt: 'Golconda Fort, Hyderabad',
    caption: 'Golconda Fort · Hyderabad',
  },
  {
    id: 'tg-ramappa',
    src: wiki('Ramappa Temple 01.jpg'),
    alt: 'Ramappa Temple, Mulugu',
    caption: 'Ramappa Temple · Mulugu',
  },
  {
    id: 'tg-secretariat',
    src: wiki('Telangana Secretariat.jpg'),
    alt: 'Dr. B. R. Ambedkar Telangana State Secretariat, Hyderabad',
    caption: 'State Secretariat · Hyderabad',
  },
];

/* ─── INC party visual marks ──────────────────────────────────────── */
export const PARTY_MARK = {
  flag: wiki('Flag of the Indian National Congress.svg'),
  logo: wiki('Indian National Congress hand logo.svg'),
};

/* ─── Local fallback served from /public ──────────────────────────── */
export const LOCAL_FALLBACK = '/BCSS_logo.png';

/* ─── Key INC constituencies in Telangana ─────────────────────────── */
export const KEY_CONSTITUENCIES = [
  { name: 'Kodangal', district: 'Vikarabad' },      // CM Revanth Reddy
  { name: 'Madhira', district: 'Khammam' },         // Dy CM Bhatti Vikramarka
  { name: 'Manthani', district: 'Peddapalli' },     // Sridhar Babu
  { name: 'Huzurnagar', district: 'Suryapet' },     // Uttam Kumar Reddy
  { name: 'Nalgonda', district: 'Nalgonda' },       // Komatireddy Venkat Reddy
  { name: 'Mulug', district: 'Mulugu' },            // Seethakka
  { name: 'Khairatabad', district: 'Hyderabad' },
];

/* ─── Talking-points the INC state government champions
 *     (used by the AI summary / dashboard) ─────────────────────────── */
export const FOCUS_TOPICS = [
  'Six Guarantees implementation',
  'Rythu Bharosa & farm loan waiver',
  'Gruha Jyothi free electricity',
  'Indiramma housing',
  'Arogyasri health cover',
  'Telangana state politics',
  'Employment & job notifications',
  'Backward classes welfare',
  'Drinking water & irrigation',
  'Hyderabad urban infrastructure',
];

/* ─── Legacy aliases ───────────────────────────────────────────────
 * The AP-era build imported these names. Kept so ported components
 * resolve without edits; prefer the party-neutral names above. */
export const TDP_PORTRAITS = PARTY_PORTRAITS;
export const TDP_HERO = PARTY_HERO;
export const AP_GALLERY = STATE_GALLERY;
export const TDP_MARK = PARTY_MARK;
export const TDP_KEY_CONSTITUENCIES = KEY_CONSTITUENCIES;
export const TDP_FOCUS_TOPICS = FOCUS_TOPICS;
