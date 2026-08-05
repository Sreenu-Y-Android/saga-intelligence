#!/usr/bin/env node
/**
 * Builds an Andhra Pradesh assembly-constituency (AC) GeoJSON for
 * constituency-level shading on AndhraPradeshMap.js.
 *
 * Source: DataMeet India Assembly Constituencies (CC-BY 2.5 IN), scraped
 * from ECI polling-station data. The dataset predates the 2014 bifurcation,
 * so Telangana ACs are still tagged "Andhra Pradesh". We therefore isolate
 * the residual-AP constituencies SPATIALLY: an AC is kept only if its
 * centroid falls inside one of the 13 AP district polygons we already
 * generated (andhra_pradesh_districts.geojson). That yields the 175 ACs of
 * present-day Andhra Pradesh, and tags each AC with its parent district.
 *
 * Output: frontend/public/andhra_pradesh_ac.geojson
 *
 * Run:  node scripts/download_real_andhra_ac.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const mapshaper = require('mapshaper');
const turf = require('@turf/turf');

const RAW_BASE = 'https://raw.githubusercontent.com/datameet/maps/master/assembly-constituencies';
const SHP_PARTS = ['India_AC.shp', 'India_AC.shx', 'India_AC.dbf', 'India_AC.prj'];

const DISTRICTS_FILE = path.join(__dirname, '..', 'public', 'andhra_pradesh_districts.geojson');
const OUT = path.join(__dirname, '..', 'public', 'andhra_pradesh_ac.geojson');

function download(url, destPath) {
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
          const out = fs.createWriteStream(destPath);
          res.pipe(out);
          out.on('finish', () => out.close(() => resolve(destPath)));
          out.on('error', reject);
        })
        .on('error', reject);
    };
    get(url);
  });
}

const titleCase = (v) =>
  String(v || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-ac-'));
  console.log(`Downloading DataMeet India_AC shapefile into ${tmp}…`);
  for (const part of SHP_PARTS) {
    const dest = path.join(tmp, part);
    await download(`${RAW_BASE}/${part}`, dest);
    console.log(`  · ${part} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`);
  }

  console.log('Converting shapefile → GeoJSON (mapshaper, simplified)…');
  const shpPath = path.join(tmp, 'India_AC.shp');
  const result = await mapshaper.applyCommands(
    `-i "${shpPath}" -simplify 12% keep-shapes -clean -o format=geojson precision=0.0001 out.json`,
    {}
  );
  const allAc = JSON.parse(result['out.json'].toString('utf8'));
  console.log(`  National AC features: ${allAc.features.length}`);

  console.log('Loading AP district polygons for spatial filter…');
  const districts = JSON.parse(fs.readFileSync(DISTRICTS_FILE, 'utf8'));

  // Precompute the AP district polygons for point-in-polygon tests.
  const districtPolys = districts.features.map((f) => ({
    name: f.properties.DIST_NAME,
    feature: f,
  }));

  const findDistrict = (centroid) => {
    for (const d of districtPolys) {
      try {
        if (turf.booleanPointInPolygon(centroid, d.feature)) return d.name;
      } catch (_) {
        /* skip malformed geometry */
      }
    }
    return null;
  };

  const acNameKey = (props) =>
    props.AC_NAME || props.ac_name || props.NAME || props.name || props.Name || '';
  const acNoKey = (props) =>
    props.AC_NO || props.ac_no || props.AC_CODE || props.AC_ID || props.id || props.ID || null;

  const kept = [];
  let skipped = 0;
  for (const f of allAc.features) {
    if (!f.geometry) {
      skipped++;
      continue;
    }
    let centroid;
    try {
      centroid = turf.centroid(f);
    } catch (_) {
      skipped++;
      continue;
    }
    const district = findDistrict(centroid);
    if (!district) {
      skipped++;
      continue;
    }

    const rawName = acNameKey(f.properties);
    kept.push({
      type: 'Feature',
      properties: {
        ST_NAME: 'ANDHRA PRADESH',
        DIST_NAME: district,
        AC_NO: acNoKey(f.properties),
        AC_NAME: titleCase(rawName) || `AC ${acNoKey(f.properties) || kept.length + 1}`,
        PC_NAME: district,
      },
      geometry: f.geometry,
    });
  }

  console.log(`  Kept ${kept.length} AP constituencies (skipped ${skipped} outside AP).`);

  const out = { type: 'FeatureCollection', features: kept };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(
    `✔ Wrote ${kept.length} ACs → ${path.relative(process.cwd(), OUT)} (${(
      fs.statSync(OUT).size / 1024
    ).toFixed(0)} KB)`
  );

  // Per-district AC counts for a sanity check.
  const counts = {};
  kept.forEach((f) => {
    counts[f.properties.DIST_NAME] = (counts[f.properties.DIST_NAME] || 0) + 1;
  });
  console.log('\nAC count by district:');
  Object.keys(counts)
    .sort()
    .forEach((d) => console.log(`  · ${d}: ${counts[d]}`));

  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => {
  console.error('AC build failed:', e.message);
  process.exit(1);
});
