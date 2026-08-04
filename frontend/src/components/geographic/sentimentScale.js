/**
 * Shared 5-bucket sentiment_index (-100..100) → color scale, used by both
 * the State Overview heatmap and the Historical Playback heatmap so the
 * same district always reads the same color regardless of which tab it's
 * viewed from.
 */
export const MOOD_LEGEND = [
  { color: '#16a34a', label: 'Very Positive (60 to 100)' },
  { color: '#84cc16', label: 'Positive (20 to 59)' },
  { color: '#eab308', label: 'Neutral (-19 to 19)' },
  { color: '#f97316', label: 'Negative (-59 to -20)' },
  { color: '#dc2626', label: 'Very Negative (-100 to -60)' },
  { color: '#e2e8f0', label: 'No Data' },
];

export const bucketColorForIndex = (entry) => {
  if (!entry) return '#e2e8f0';
  const idx = entry.sentiment_index;
  if (idx >= 60) return '#16a34a';
  if (idx >= 20) return '#84cc16';
  if (idx >= -19) return '#eab308';
  if (idx >= -59) return '#f97316';
  return '#dc2626';
};

export const DISTRICT_GEOJSON_SOURCES = ['/telangana_districts.geojson'];

import { normalizeDistrict, formatDistrictLabel } from './districtNames';

export { normalizeDistrict, formatDistrictLabel };

/**
 * Display label for a district or constituency coming off the geojson,
 * the API, or a grievance's detected_location.
 *
 * Districts route through the shared normalizer so that every spelling
 * variant in the system — "Jayashankar Bhupalpally" from the roster,
 * "JAYASHANKAR BHUPALAPALLY" from the geojson, "hanamkonda" from a detected
 * location — renders as one consistent label instead of three.
 */
export const formatGeoName = (rawName) => {
  if (!rawName) return '';
  const s = String(rawName).trim();

  const asDistrict = formatDistrictLabel(s);
  if (asDistrict && normalizeDistrict(s)) return asDistrict;

  // Not a district — a constituency or locality. Strip the (SC)/(ST)
  // reservation marker but keep urban/rural and directional qualifiers,
  // so "Nizamabad (Urban)" stays distinguishable from "Nizamabad (Rural)".
  return s
    .replace(/\(\s*(SC|ST|GEN|GENERAL)\s*\)/gi, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};
