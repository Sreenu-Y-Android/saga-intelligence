#!/usr/bin/env node
/**
 * build-district-geojson.js
 * ─────────────────────────────────────────────────────────────────────
 * Derives `public/telangana_districts.geojson` (district outlines) by
 * dissolving `public/telangana_ac.geojson` (119 assembly constituencies)
 * on the DIST_NAME property.
 *
 * Why derive rather than ship a separate district file: the AC layer and the
 * district layer MUST share borders exactly, or the Geographic Intelligence
 * choropleth shows hairline gaps when you drill from state → district → AC.
 * Dissolving guarantees they agree because they come from the same geometry.
 *
 * Run after any change to telangana_ac.geojson:
 *     yarn build:districts
 *
 * Note on district count: this yields 31 districts, not the official 33.
 * The upstream shapefile predates the carve-out of Hanamkonda (from Warangal)
 * and Mulugu (from Jayashankar Bhupalapally), so those two are folded into
 * their parents. `districtAliases` in the geo layer maps the modern names
 * onto these polygons so nothing is silently dropped.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SOURCE = path.join(PUBLIC_DIR, 'telangana_ac.geojson');
const OUTPUT = path.join(PUBLIC_DIR, 'telangana_districts.geojson');

/** Telangana's real extent — a sanity check that we dissolved the right state. */
const EXPECTED_BOUNDS = { minLon: 76.5, maxLon: 82.5, minLat: 15.0, maxLat: 20.5 };

if (!fs.existsSync(SOURCE)) {
  console.error(`Source not found: ${SOURCE}`);
  process.exit(1);
}

console.log('Dissolving assembly constituencies into districts…');

execFileSync(
  'npx',
  [
    '--yes', 'mapshaper@0.7.27',
    SOURCE,
    '-dissolve', 'DIST_NAME', 'copy-fields=ST_CODE,ST_NAME',
    '-o', OUTPUT, 'format=geojson',
  ],
  { stdio: 'inherit' }
);

/* ─── verify what we just wrote ────────────────────────────────────── */

const geo = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));

const missingName = geo.features.filter((f) => !f.properties?.DIST_NAME);
if (missingName.length) {
  console.error(`${missingName.length} feature(s) lost DIST_NAME during dissolve — aborting.`);
  process.exit(1);
}

let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
for (const feature of geo.features) {
  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
}

const outOfBounds =
  minLon < EXPECTED_BOUNDS.minLon || maxLon > EXPECTED_BOUNDS.maxLon ||
  minLat < EXPECTED_BOUNDS.minLat || maxLat > EXPECTED_BOUNDS.maxLat;

if (outOfBounds) {
  console.error(
    `Dissolved geometry falls outside Telangana: ` +
    `lon [${minLon.toFixed(2)}, ${maxLon.toFixed(2)}] lat [${minLat.toFixed(2)}, ${maxLat.toFixed(2)}]`
  );
  process.exit(1);
}

const sizeKb = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
console.log(`Wrote ${geo.features.length} districts to public/telangana_districts.geojson (${sizeKb} KB)`);
console.log(`Bounds: lon [${minLon.toFixed(2)}, ${maxLon.toFixed(2)}] lat [${minLat.toFixed(2)}, ${maxLat.toFixed(2)}]`);
