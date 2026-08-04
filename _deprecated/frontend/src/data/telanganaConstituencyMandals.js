/**
 * Mandal names for each Telangana Assembly Constituency.
 * Keys are lowercase constituency names (matching normalizeAcName output).
 * Values are arrays of mandal names within that constituency.
 */
const CONSTITUENCY_MANDALS = {
  // ── Vikarabad District ──────────────────────────────────────────────────
  kodangal: ['Kodangal', 'Bomraspet', 'Maddur', 'Doultabad', 'Nawabpet', 'Dharur', 'Kosgi'],
  vikarabad: ['Vikarabad', 'Mominpet', 'Basheerabad', 'Yalal', 'Kulkacherla'],
  tandur: ['Tandur', 'Marpalle', 'Doma', 'Nawabpet', 'Yalal'],
  chevella: ['Chevella', 'Shabad', 'Doma', 'Basheerabad'],

  // ── Mahabubnagar District ───────────────────────────────────────────────
  mahbubnagar: ['Mahabubnagar Urban', 'Mahabubnagar Rural', 'Hanwada', 'Bhoothpur'],
  jadcherla: ['Jadcherla', 'Bhanur', 'Kothur', 'Pangal', 'Midjil'],
  devarkadra: ['Devarkadra', 'Balanagar', 'Keshampet'],
  shadnagar: ['Shadnagar', 'Kothur', 'Farooqnagar'],
  kollapur: ['Kollapur', 'Bijinapally', 'Telkapally', 'Tadoor'],
  nagarkurnool: ['Nagarkurnool', 'Lingal', 'Veldanda', 'Amrabad'],
  achampet: ['Achampet', 'Lingal', 'Amrabad', 'Veldanda'],
  kalwakurthy: ['Kalwakurthy', 'Utkoor', 'Bijinapalle', 'Pangal'],
  wanaparthy: ['Wanaparthy', 'Pebbair', 'Kothakota', 'Atmakur'],
  makthal: ['Makthal', 'Narva', 'Kosgi', 'Marikal'],
  narayanpet: ['Narayanpet', 'Makthal', 'Kosgi', 'Narva'],

  // ── Nalgonda District ───────────────────────────────────────────────────
  nalgonda: ['Nalgonda', 'Marriguda', 'Chityal', 'Chandur', 'Thipparthi'],
  nakrekal: ['Nakrekal', 'Thipparthi', 'Chityal'],
  devarakonda: ['Devarakonda', 'Haliya', 'Chandampet'],
  miryalaguda: ['Miryalaguda', 'Nidamanur', 'Vemulapally'],
  munugode: ['Munugode', 'Chivvemula', 'Peddavoora'],
  nagarjunasagar: ['Nagarjunasagar', 'Dindi'],
  kodad: ['Kodad', 'Munagala', 'Mattampally'],

  // ── Suryapet District ───────────────────────────────────────────────────
  huzurnagar: ['Huzurnagar', 'Chintapalli', 'Nereducharla'],
  suryapet: ['Suryapet', 'Munagala', 'Thungathurthi'],

  // ── Khammam District ────────────────────────────────────────────────────
  khammam: ['Khammam Urban', 'Khammam Rural', 'Kallur'],
  madhira: ['Madhira', 'Chintakani', 'Wyra'],
  palair: ['Palair', 'Yerrupalem', 'Bonakal'],
  kothagudem: ['Kothagudem', 'Palwancha'],
  aswaraopeta: ['Aswaraopeta', 'Dammapeta'],

  // ── Karimnagar District ─────────────────────────────────────────────────
  karimnagar: ['Karimnagar Urban', 'Karimnagar Rural'],
  choppadandi: ['Choppadandi', 'Veenavanka'],
  manakondur: ['Manakondur', 'Sircilla'],
  huzurabad: ['Huzurabad', 'Jammikunta'],

  // ── Peddapalli District ─────────────────────────────────────────────────
  manthani: ['Manthani', 'Ramagundam'],
  husnabad: ['Husnabad', 'Jammikunta'],
  peddapalli: ['Peddapalli', 'Ramagundam'],

  // ── Jagtial District ────────────────────────────────────────────────────
  dharmapuri: ['Dharmapuri', 'Metpalle'],
  jagtial: ['Jagtial', 'Mallial'],

  // ── Rajanna Sircilla District ───────────────────────────────────────────
  sircilla: ['Sircilla', 'Vemulawada'],
  vemulawada: ['Vemulawada', 'Boinpally'],

  // ── Warangal District ───────────────────────────────────────────────────
  'warangal east': ['Warangal', 'Hanamkonda', 'Kazipet'],
  'warangal west': ['Warangal', 'Geesugonda'],

  // ── Medak District ──────────────────────────────────────────────────────
  medak: ['Medak', 'Papannapet'],
  andole: ['Andole', 'Zaheerabad'],

  // ── Sangareddy District ─────────────────────────────────────────────────
  narayankhed: ['Narayankhed', 'Kohir'],
  sangareddy: ['Sangareddy', 'Sadasivpet'],

  // ── Nizamabad District ──────────────────────────────────────────────────
  bodhan: ['Bodhan', 'Varni'],
  nizamabad: ['Nizamabad Urban', 'Nizamabad Rural'],
  armur: ['Armur', 'Bheemgal'],
  banswada: ['Banswada', 'Yellareddy'],

  // ── Kamareddy District ─────────────────────────────────────────────────
  jukkal: ['Jukkal', 'Pitlam'],
  kamareddy: ['Kamareddy', 'Machareddy'],

  // ── Nirmal District ─────────────────────────────────────────────────────
  khanapur: ['Khanapur', 'Bhainsa'],
  nirmal: ['Nirmal', 'Mudhole'],

  // ── Adilabad District ───────────────────────────────────────────────────
  adilabad: ['Adilabad Urban', 'Boath'],
  mancherial: ['Mancherial', 'Luxettipet'],

  // ── Mancherial District ─────────────────────────────────────────────────
  bellampalle: ['Bellampalle', 'Mandamarri'],
  chennur: ['Chennur', 'Kotapalli'],

  // ── Mahabubabad District ────────────────────────────────────────────────
  mahabubabad: ['Mahabubabad', 'Kesamudram'],
  dornakal: ['Dornakal', 'Thorrur'],

  // ── Mulugu District ─────────────────────────────────────────────────────
  mulug: ['Mulug', 'Venkatapur'],
  bhupalpalle: ['Bhupalpalle', 'Kataram'],

  // ── Yadadri Bhuvanagiri District ────────────────────────────────────────
  bhongir: ['Bhongir', 'Choutuppal'],
  alair: ['Alair', 'Turkapally'],

  // ── Rangareddy District ─────────────────────────────────────────────────
  ibrahimpatnam: ['Ibrahimpatnam', 'Hayathnagar'],
  medchal: ['Medchal', 'Ghatkesar'],
  maheshwaram: ['Maheshwaram', 'Kandukur'],

  // ── Hyderabad ───────────────────────────────────────────────────────────
  secunderabad: ['Secunderabad', 'Alwal'],
  uppal: ['Uppal', 'LB Nagar'],
  amberpet: ['Amberpet', 'Musheerabad'],
};

/**
 * Get the mandal list for a given constituency name.
 * Falls back to generic placeholder mandals if not found.
 */
export function getMandalsForConstituency(constituencyName) {
  if (!constituencyName) return [];
  const key = constituencyName
    .replace(/\s*\(\s*(SC|ST|MBC|OBC|GEN|SP)\s*\)\s*$/i, '')
    .trim()
    .toLowerCase();
  return CONSTITUENCY_MANDALS[key] || [];
}

export default CONSTITUENCY_MANDALS;
