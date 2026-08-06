#!/usr/bin/env node
/**
 * Downloads accurate Andhra Pradesh district polygons from the open-source
 * geohacker/india project and writes a slimmed geojson to
 * frontend/public/andhra_pradesh_districts.geojson.
 *
 * Each feature is augmented with the schema AndhraPradeshMap.js expects
 * (ST_NAME, DIST_NAME, AC_NAME, PC_NAME) so the renderer works without
 * any code changes.
 *
 * The geohacker district file predates the 2014 bifurcation, so its
 * "Andhra Pradesh" features include the 10 districts that later became
 * Telangana. We exclude those so only the residual 13 AP districts remain.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson';
const OUT = path.join(__dirname, '..', 'public', 'andhra_pradesh_districts.geojson');

/* The 10 legacy districts that became Telangana in 2014 — excluded here. */
const TELANGANA_LEGACY = new Set(
  [
    'Adilabad', 'Hyderabad', 'Karimnagar', 'Khammam', 'Mahbubnagar',
    'Medak', 'Nalgonda', 'Nizamabad', 'Rangareddy', 'Ranga Reddy',
    'Rangareddi', 'Ranga Reddi', 'Warangal',
  ].map((n) => n.toLowerCase())
);

/* District-name canonicalisation to stable upper-case keys. */
const NORMALISE = {
  'CUDDAPAH': 'YSR KADAPA',
  'KADAPA': 'YSR KADAPA',
  'YSR': 'YSR KADAPA',
  'ANANTAPUR': 'ANANTHAPURAMU',
  'ANANTHAPUR': 'ANANTHAPURAMU',
  'NELLORE': 'SPSR NELLORE',
  'SPS NELLORE': 'SPSR NELLORE',
  'VISAKHAPATNAM': 'VISAKHAPATNAM',
  'VIZIANAGARAM': 'VIZIANAGARAM',
  'EAST GODAVARI': 'EAST GODAVARI',
  'WEST GODAVARI': 'WEST GODAVARI',
};

function download(url) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      https
        .get(u, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return get(res.headers.location);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          }
          const chunks = [];
          let received = 0;
          res.on('data', (c) => {
            chunks.push(c);
            received += c.length;
            if (received % (4 * 1024 * 1024) < c.length) {
              process.stdout.write(`  downloaded ${(received / 1024 / 1024).toFixed(1)} MB…\r`);
            }
          });
          res.on('end', () => {
            process.stdout.write('\n');
            resolve(Buffer.concat(chunks).toString('utf8'));
          });
          res.on('error', reject);
        })
        .on('error', reject);
    };
    get(url);
  });
}

(async () => {
  console.log(`Downloading ${URL}…`);
  const raw = await download(URL);
  console.log(`Got ${(raw.length / 1024 / 1024).toFixed(1)} MB; parsing…`);
  const data = JSON.parse(raw);

  const isAndhra = (props) => {
    const st = String(props.NAME_1 || props.ST_NM || props.STATE || '').toLowerCase();
    const dist = String(props.NAME_2 || props.DISTRICT || '').toLowerCase();
    if (st !== 'andhra pradesh') return false;
    // Exclude the 10 districts that became Telangana.
    return !TELANGANA_LEGACY.has(dist);
  };

  const ap = data.features.filter((f) => isAndhra(f.properties));
  console.log(`Found ${ap.length} Andhra Pradesh features.`);
  if (ap.length === 0) {
    console.error(
      'No Andhra Pradesh features matched. Property keys on first feature:',
      Object.keys(data.features[0].properties)
    );
    process.exit(1);
  }

  const cleaned = ap.map((f, i) => {
    const dn0 = String(
      f.properties.NAME_2 || f.properties.DISTRICT || f.properties.DIST_NM || f.properties.district || ''
    )
      .toUpperCase()
      .trim();
    const distName = NORMALISE[dn0] || dn0;

    return {
      type: 'Feature',
      properties: {
        OBJECTID: i + 1,
        ST_CODE: '28',
        ST_NAME: 'ANDHRA PRADESH',
        DT_CODE: String(i + 1).padStart(2, '0'),
        DIST_NAME: distName,
        AC_NO: 100 + i,
        AC_NAME: distName.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
        PC_NO: 10 + i,
        PC_NAME: distName,
        PC_ID: 2800 + i,
        STATUS: null,
        Shape_Leng: 1,
        Shape_Area: 1,
      },
      geometry: f.geometry,
    };
  });

  const out = { type: 'FeatureCollection', features: cleaned };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(
    `✔ Wrote ${cleaned.length} districts → ${path.relative(process.cwd(), OUT)} (${(
      fs.statSync(OUT).size / 1024
    ).toFixed(0)} KB)`
  );

  console.log('\nDistricts in file:');
  const names = [...new Set(cleaned.map((f) => f.properties.DIST_NAME))].sort();
  names.forEach((n) => console.log(`  · ${n}`));
})().catch((e) => {
  console.error('Download failed:', e.message);
  process.exit(1);
});
