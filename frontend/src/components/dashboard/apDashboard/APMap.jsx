import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { Loader2, Search, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Card } from '../../ui/card';
import { getMlaByConstituency, getMlasByDistrict } from '../../../data/tgMLAs';
import { getMpByLsId, getMpByLsName } from '../../../data/tgMPs';

// Tried in order; the first that loads wins. Both layers share borders because
// telangana_districts.geojson is dissolved from telangana_ac.geojson —
// see frontend/scripts/build-district-geojson.js.
const DISTRICT_SOURCES = ['/telangana_districts.geojson'];

const AC_SOURCES = ['/telangana_ac.geojson'];

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const titleCase = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const getDistrictName = (props = {}) => {
  const direct =
    props.DIST_NAME ||
    props.district_name ||
    props.district ||
    props.DISTRICT ||
    props.dtname ||
    props.NAME_2 ||
    props.NAME_1 ||
    props.NAME ||
    props.name ||
    '';
  return String(direct || '').trim();
};

const getStateName = (props = {}) => {
  const direct = props.ST_NAME || props.st_nm || props.st_name || props.STATE || props.state || '';
  return String(direct || '').trim();
};

const getAcName = (props = {}) => {
  const direct = props.AC_NAME || props.ac_name || props.NAME || props.name || props.Name || '';
  return String(direct || '').trim();
};

// Matches MLA_PARTY_META in data/telanganaMlaDirectory.js so a party reads the
// same colour on the map, the directory and the compare view. INC uses a
// single solid amber (not blue — BJP already owns the brighter orange) rather
// than a tricolor swatch: a saffron/white/green fill reads fine as a small
// dot but turns into visual noise once it's tiling dozens of irregular,
// differently-sized constituency shapes across the map.
const PARTY_FILLS = {
  INC: '#CA8A04',
  BRS: '#ec4899',
  BJP: '#f97316',
  AIMIM: '#059669',
  CPI: '#dc2626',
};

const getPartyFill = (party) => PARTY_FILLS[String(party || '').toUpperCase()] || '#cbd5e1';

// A district has many constituencies, which can go to different parties — there's no
// single "winning party" the way there is for one seat. `getMlaByConstituency` only
// ever matched a district by accident (when the district's name happened to equal one
// of its own constituencies' names), leaving every other district blank. This instead
// colors a district by whichever party holds the most seats within it.
const getDominantPartyForDistrict = (districtName) => {
  const members = getMlasByDistrict(String(districtName || '').toUpperCase().trim());
  if (!members.length) return null;
  const counts = {};
  members.forEach((m) => { counts[m.party] = (counts[m.party] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
};

/**
 * APMap Component
 * Hero visualization with zoom, pan, search, view modes, and legends.
 */
const APMap = ({ mapData, loading: statsLoading, onConstituencyClick, filters }) => {
  const [districtGeo, setDistrictGeo] = useState(null);
  const [acGeo, setAcGeo] = useState(null);
  const [viewLevel, setViewLevel] = useState('ac'); // 'district' | 'ac'
  const [viewMode, setViewMode] = useState('sentiment'); // 'sentiment' | 'volume' | 'engagement' | 'party'
  const [searchQuery, setSearchQuery] = useState('');
  const [hovered, setHovered] = useState(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0 });
  const [loadingGeo, setLoadingGeo] = useState(true);

  // Zoom/Pan State
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState([0, 0]);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState([0, 0]);

  // Fetch GeoJSON sources
  useEffect(() => {
    const loadSources = async (sources) => {
      for (const source of sources) {
        try {
          const res = await fetch(source);
          if (!res.ok) continue;
          const text = await res.text();
          if (!text || !text.trim()) continue;
          const parsed = JSON.parse(text);
          if (!parsed?.features?.length) continue;

          const normalizedFeatures = parsed.features.map((feature) => {
            const props = feature.properties || {};
            return {
              ...feature,
              properties: {
                ...props,
                DIST_NAME: getDistrictName(props),
                AC_NAME: getAcName(props),
                ST_NAME: getStateName(props),
              },
            };
          });

          const stateOnly = normalizedFeatures.filter(
            (f) => normalize(f.properties?.ST_NAME) === 'telangana'
          );
          const features = stateOnly.length > 0 ? stateOnly : normalizedFeatures;
          return { ...parsed, features };
        } catch (_err) {
          // Continue to next source
        }
      }
      return null;
    };

    (async () => {
      setLoadingGeo(true);
      const [districts, acs] = await Promise.all([
        loadSources(DISTRICT_SOURCES),
        loadSources(AC_SOURCES),
      ]);
      setDistrictGeo(districts);
      setAcGeo(acs);
      setLoadingGeo(false);
    })();
  }, []);

  const geojson = viewLevel === 'district' ? districtGeo : acGeo;

  // D3 Projection
  const projection = useMemo(() => {
    if (!geojson) return null;
    const p = geoMercator();
    p.fitSize([750, 520], geojson);
    return p;
  }, [geojson]);

  const path = useMemo(() => {
    if (!projection) return null;
    return geoPath().projection(projection);
  }, [projection]);
  // Color matching formulas based on view modes
  const getFillColor = useCallback((name, stats) => {
    if (viewMode === 'party') {
      if (viewLevel === 'district') {
        return getPartyFill(getDominantPartyForDistrict(name));
      }
      const mla = getMlaByConstituency(name);
      return getPartyFill(mla?.party);
    }

    if (!stats || stats.total === 0) return '#cbd5e1';
    if (viewMode === 'sentiment') {
      const negRatio = (stats.negative || 0) / Math.max(stats.total, 1);
      if (negRatio >= 0.5) return '#ef4444'; // Red (High negative)
      if (negRatio >= 0.25) return '#f97316'; // Orange (Medium negative)
      return '#10b981'; // Green (Low negative/Positive)
    }

    if (viewMode === 'volume') {
      const volume = stats.total || 0;
      if (volume >= 100) return '#ca8a04'; // Deep Gold
      if (volume >= 30)  return '#eab308'; // Gold
      if (volume >= 10)  return '#facc15'; // Yellow
      return '#fef08a'; // Light Yellow
    }

    if (viewMode === 'engagement') {
      const eng = stats.engagement || 0;
      if (eng >= 1000) return '#1d4ed8'; // Deep Blue
      if (eng >= 200)  return '#3b82f6'; // Blue
      if (eng >= 50)   return '#60a5fa'; // Light Blue
      return '#bfdbfe'; // Very Light Blue
    }

    return '#e2e8f0';
  }, [viewMode, viewLevel]);

  // Map mouse handlers
  const handleMouseMove = (e, name) => {
    setHovered(name);
    setTooltip({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setHovered(null);
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom(z => Math.min(z + 0.5, 6));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.5, 1));
  const handleReset = () => {
    setZoom(1);
    setOffset([0, 0]);
  };

  // Pan handlers
  const handleMouseDown = (e) => {
    setIsPanning(true);
    setPanStart([e.clientX - offset[0], e.clientY - offset[1]]);
  };

  const handleMouseMovePan = (e) => {
    if (!isPanning) return;
    setOffset([e.clientX - panStart[0], e.clientY - panStart[1]]);
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Search filter
  const filteredFeatures = useMemo(() => {
    if (!geojson) return [];
    if (!searchQuery) return geojson.features;
    const query = normalize(searchQuery);
    return geojson.features.filter(f => {
      const name = normalize(viewLevel === 'ac' ? getAcName(f.properties) : getDistrictName(f.properties));
      return name.includes(query);
    });
  }, [geojson, searchQuery, viewLevel]);

  if (loadingGeo || statsLoading || !geojson || !path) {
    return (
      <div className="h-full min-h-[500px] w-full flex flex-col items-center justify-center bg-slate-50 rounded-xl border border-slate-200">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-600" />
        <span className="text-xs text-slate-500 mt-2 font-semibold">Loading Constituency GeoJSON Layers...</span>
      </div>
    );
  }

  return (
    <Card className="relative h-full flex flex-col border border-slate-200 overflow-hidden bg-slate-55 select-none min-h-[580px]">
      {/* Top Map Controls */}
      <div className="p-3 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 max-w-[220px] w-full">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search constituency..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs bg-transparent border-none outline-none w-full text-slate-700"
          />
        </div>

        {/* View Mode Select */}
        <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
          {['sentiment', 'volume', 'engagement', 'party'].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 font-medium transition-colors border-r last:border-r-0 ${
                viewMode === mode
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
              }`}
            >
              <span className="capitalize">{mode}</span>
            </button>
          ))}
        </div>

        {/* View Level */}
        <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
          <button
            onClick={() => setViewLevel('ac')}
            className={`px-3 py-1.5 font-medium transition-colors ${
              viewLevel === 'ac' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Assembly
          </button>
          <button
            onClick={() => setViewLevel('district')}
            className={`px-3 py-1.5 font-medium transition-colors border-l ${
              viewLevel === 'district' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            District
          </button>
        </div>
      </div>

      {/* Hero Interactive Map Canvas */}
      <div
        className="flex-1 relative overflow-hidden bg-[#fafafa] cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMovePan}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          viewBox="0 0 750 520"
          className="w-full h-full transform-gpu"
          style={{
            transform: `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.15s ease-out'
          }}
        >
          {geojson.features.map((feature, idx) => {
            const name = viewLevel === 'ac' ? getAcName(feature.properties) : getDistrictName(feature.properties);
            const lowerName = name.toLowerCase();

            // Fetch live metrics
            const stats = viewLevel === 'ac'
              ? mapData?.constituencies?.[lowerName]
              : mapData?.districts?.[lowerName];

            const isHovered = hovered === name;
            const fill = getFillColor(name, stats);

            return (
              <path
                key={`${name}-${idx}`}
                d={path(feature)}
                fill={isHovered ? '#1e293b' : fill}
                stroke="#ffffff"
                strokeWidth={viewLevel === 'district' ? 1.0 : 0.4}
                className="transition-colors duration-100 ease-out cursor-pointer"
                onMouseMove={(e) => handleMouseMove(e, name)}
                onMouseLeave={handleMouseLeave}
                onClick={() => onConstituencyClick(name)}
              />
            );
          })}
        </svg>

        {/* Legend Panel */}
        <div className="absolute top-2 left-3 bg-white/95 border border-slate-200/80 rounded-lg shadow-md p-2 z-10 max-w-[155px] text-[9px]">
          <div className="font-bold text-slate-700 mb-1 uppercase tracking-wide">
            {viewMode === 'sentiment' ? 'Sentiment View' :
             viewMode === 'volume' ? 'Mention Volume' :
             viewMode === 'engagement' ? 'Total Engagement' : 'winning party'}
          </div>

          <div className="space-y-0.5">
            {viewMode !== 'party' && (
              <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1 mb-1 text-slate-500">
                <span className="w-2.5 h-2.5 rounded bg-[#cbd5e1]" />
                <span>No Data</span>
              </div>
            )}
            {viewMode === 'sentiment' && (
              <>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#10b981]" />Low Risk (&lt;25% Neg)</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#f97316]" />Medium Risk (25-50% Neg)</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#ef4444]" />High Risk (&gt;50% Neg)</div>
              </>
            )}
            {viewMode === 'volume' && (
              <>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#ca8a04]" />High (100+ Mentions)</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#eab308]" />Moderate (30-100)</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#facc15]" />Low (10-30)</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#fef08a]" />Minimal (&lt;10)</div>
              </>
            )}
            {viewMode === 'engagement' && (
              <>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#1d4ed8]" />Extreme (1K+)</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#3b82f6]" />High (200-1K)</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#60a5fa]" />Moderate (50-200)</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#bfdbfe]" />Low (&lt;50)</div>
              </>
            )}
            {viewMode === 'party' && (
              <>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#CA8A04]" />INC</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#ec4899]" />BRS</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#f97316]" />BJP</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#059669]" />AIMIM</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#dc2626]" />CPI</div>
              </>
            )}
          </div>
        </div>

        {/* Map Float HUD controls */}
        <div className="absolute right-3 bottom-3 flex flex-col gap-1 z-10">
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 shadow-md text-slate-600"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 shadow-md text-slate-600"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 shadow-md text-slate-600"
            title="Reset View"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Floating Hover Tooltip */}
      {hovered && (
        <div
          className="fixed z-50 pointer-events-none bg-white/95 border border-slate-200 shadow-xl rounded-xl px-3.5 py-2.5 text-xs select-none backdrop-blur-sm"
          style={{ left: tooltip.x + 15, top: tooltip.y + 15 }}
        >
          <div className="font-bold text-slate-800 capitalize mb-1">{titleCase(hovered)}</div>
          
          {(() => {
            const stats = viewLevel === 'ac'
              ? mapData?.constituencies?.[hovered.toLowerCase()]
              : mapData?.districts?.[hovered.toLowerCase()];

            const mla = viewLevel === 'ac' ? getMlaByConstituency(hovered) : null;

            return (
              <div className="space-y-1 text-slate-600">
                {mla && (
                  <div className="text-[10px] text-slate-400 font-semibold mb-1">
                    MLA: {mla.mla} ({mla.party})
                  </div>
                )}
                <div>Mentions: <span className="font-semibold text-slate-800">{stats?.total || 0}</span></div>
                <div className="flex gap-2">
                  <span className="text-emerald-600">Pos: {stats?.positive || 0}</span>
                  <span className="text-red-500">Neg: {stats?.negative || 0}</span>
                </div>
                {stats?.topTopic && (
                  <div className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded mt-1.5 font-medium">
                    Top Issue: {stats.topTopic}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </Card>
  );
};

export default APMap;
