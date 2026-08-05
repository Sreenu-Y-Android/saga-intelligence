const fs = require('fs');
const path = require('path');

const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '_mla_raw.json'), 'utf8'));

const normKey = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // drop (SC)/(ST)
    .replace(/[^a-z0-9]/g, '')
    .trim();

const PARTY_SHORT = {
  TDP: 'TDP',
  BJP: 'BJP',
  YSRCP: 'YSRCP',
  'Janasena Party': 'JSP',
};

const ALLIANCE = {
  TDP: 'NDA',
  BJP: 'NDA',
  JSP: 'NDA',
  YSRCP: 'Opposition',
};

const records = rows.map((r) => {
  const party = PARTY_SHORT[r.party] || r.party;
  return {
    constituency: r.constituency,
    key: normKey(r.constituency),
    mla: r.candidate,
    party,
    alliance: ALLIANCE[party] || 'Other',
    criminalCases: Number(r.criminal) || 0,
    education: r.education || '',
    assets: r.assets || '',
    liabilities: r.liabilities || '',
  };
});

// GeoJSON AC spelling variants → official MLA-list constituency key.
const GEO_ALIASES = {
  ungutur: 'unguturu',
  palacole: 'palakollu',
};
const byKey = records.reduce((acc, m) => {
  acc[m.key] = m;
  return acc;
}, {});
Object.entries(GEO_ALIASES).forEach(([geoKey, mlaKey]) => {
  if (byKey[mlaKey] && !byKey[geoKey]) {
    records.push({ ...byKey[mlaKey], key: geoKey });
  }
});

// Coverage check vs the AC GeoJSON.
const geo = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'public', 'andhra_pradesh_ac.geojson'), 'utf8')
);
const mlaKeys = new Set(records.map((r) => r.key));
const acNames = geo.features.map((f) => f.properties.AC_NAME || '');
const matched = acNames.filter((n) => mlaKeys.has(normKey(n)));
const unmatched = acNames.filter((n) => !mlaKeys.has(normKey(n)));

const header = `// AUTO-GENERATED from ADR/ECI 2024 Andhra Pradesh assembly results.
// Source: user-provided ADR candidate dataset (174 of 175 seats).
// Regenerate via frontend/scripts/_gen_mla.js. Do not edit by hand.
//
// Each record: constituency (official AC name), key (normalized lookup),
// mla (winning candidate), party (TDP/JSP/BJP/YSRCP), alliance (NDA/Opposition),
// criminalCases, education, assets, liabilities.
`;

const body =
  'export const AP_MLAS = ' +
  JSON.stringify(records, null, 2) +
  ';\n\n' +
  `export const normalizeConstituencyKey = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/\\([^)]*\\)/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim();

export const MLA_BY_KEY = AP_MLAS.reduce((acc, m) => {
  acc[m.key] = m;
  return acc;
}, {});

export const getMlaByConstituency = (name) => MLA_BY_KEY[normalizeConstituencyKey(name)] || null;

export default AP_MLAS;
`;

const outPath = path.join(__dirname, '..', 'src', 'data', 'apMLAs.js');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, header + '\n' + body);

const report = [
  `MLA records: ${records.length}`,
  `AC features: ${acNames.length}`,
  `matched: ${matched.length}`,
  `unmatched (${unmatched.length}): ${JSON.stringify(unmatched)}`,
];
fs.writeFileSync(path.join(__dirname, '_mla_coverage.txt'), report.join('\n'));
console.log(report.join('\n'));
