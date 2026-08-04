import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { geoMercator, geoPath, geoCentroid } from 'd3-geo';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Loader2, TrendingUp, TrendingDown, Minus, BarChart3, Tag } from 'lucide-react';
import { cn } from '../lib/utils';

const MAHBUBNAGAR_PC = 'MAHBUBNAGAR';

const TOPIC_STYLES = {
  'Political Criticism': 'bg-purple-50 text-purple-700 ring-purple-200',
  'Hate Speech': 'bg-red-50 text-red-700 ring-red-200',
  'Hate Speech Threat': 'bg-red-50 text-red-700 ring-red-200',
  'Public Complaint': 'bg-blue-50 text-blue-700 ring-blue-200',
  'Corruption Complaint': 'bg-orange-50 text-orange-700 ring-orange-200',
  'General Complaint': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'Traffic Complaint': 'bg-amber-50 text-amber-700 ring-amber-200',
  'Public Nuisance': 'bg-rose-50 text-rose-700 ring-rose-200',
  'Road & Infrastructure': 'bg-yellow-50 text-yellow-700 ring-yellow-200',
  'Law & Order': 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  'Normal': 'bg-gray-50 text-gray-600 ring-gray-200',
};

const canonicalizeTopic = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  if (normalized === 'normal' || normalized === 'govt praise' || normalized === 'government praise' || normalized === 'general praise' || normalized === 'general complaint') return 'General Complaint';
  if (normalized === 'public complaint') return 'Public Complaint';
  if (normalized === 'political criticism') return 'Political Criticism';
  if (normalized === 'corruption complaint') return 'Corruption Complaint';
  if (normalized === 'traffic complaint') return 'Traffic Complaint';
  if (normalized === 'public nuisance') return 'Public Nuisance';
  if (normalized === 'road and infrastructure' || normalized === 'road & infrastructure') return 'Road & Infrastructure';
  if (normalized === 'law and order' || normalized === 'law & order') return 'Law & Order';
  if (normalized === 'hate speech') return 'Hate Speech';

  return normalized
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getTopicStyle = (topic) => TOPIC_STYLES[canonicalizeTopic(topic)] || 'bg-teal-50 text-teal-700 ring-teal-200';

const AC_NAMES = ['Kodangal', 'Narayanpet', 'Mahbubnagar', 'Jadcherla', 'Devarkadra', 'Makthal', 'Shadnagar'];

const SENTIMENT_TIERS = {
  high:    { fill: '#15803d', hover: '#166534', stroke: '#14532d' },
  medium:  { fill: '#22c55e', hover: '#16a34a', stroke: '#15803d' },
  low:     { fill: '#86efac', hover: '#4ade80', stroke: '#22c55e' },
  none:    { fill: '#e2e8f0', hover: '#cbd5e1', stroke: '#94a3b8' },
};

const getSentimentColors = (stats) => {
  if (!stats || stats.count === 0) return SENTIMENT_TIERS.none;
  const ratio = (stats.positive || 0) / stats.count;
  if (ratio >= 0.6) return SENTIMENT_TIERS.high;
  if (ratio >= 0.3) return SENTIMENT_TIERS.medium;
  return SENTIMENT_TIERS.low;
};

const formatTopicLabel = (value) => {
  const canonical = canonicalizeTopic(value);
  return canonical || 'Normal';
};

const mergeTopicEntries = (entries = []) => {
  const topicMap = {};
  entries.forEach((item) => {
    const [rawTopic, rawCount] = Array.isArray(item)
      ? item
      : [item?.name || item?.topic, item?.count || 0];
    const topic = canonicalizeTopic(rawTopic);
    const count = Number(rawCount) || 0;
    if (!topic || count <= 0) return;
    topicMap[topic] = (topicMap[topic] || 0) + count;
  });
  return Object.entries(topicMap).sort((a, b) => b[1] - a[1]);
};

const CITY_TO_AC = {
  'kodangal': 'Kodangal', 'narayanpet': 'Narayanpet', 'mahbubnagar': 'Mahbubnagar',
  'mahabubnagar': 'Mahbubnagar', 'jadcherla': 'Jadcherla', 'devarkadra': 'Devarkadra',
  'makthal': 'Makthal', 'shadnagar': 'Shadnagar',
  'kosgi': 'Kodangal', 'bomraspet': 'Kodangal', 'doultabad': 'Kodangal',
  'maddur': 'Kodangal', 'kalwakurthy': 'Shadnagar',
};

const CITY_TO_DISTRICT = {
  'hyderabad': 'HYDERABAD', 'secunderabad': 'HYDERABAD', 'warangal': 'WARANGAL',
  'karimnagar': 'KARIMNAGAR', 'nizamabad': 'NIZAMABAD', 'khammam': 'KHAMMAM',
  'nalgonda': 'NALGONDA', 'adilabad': 'ADILABAD', 'mahabubnagar': 'MAHABUBNAGAR',
  'mahbubnagar': 'MAHABUBNAGAR', 'rangareddy': 'RANGAREDDY', 'medak': 'MEDAK',
  'sangareddy': 'SANGAREDDY', 'siddipet': 'SIDDIPET', 'vikarabad': 'VIKARABAD',
  'kodangal': 'VIKARABAD', 'narayanpet': 'NARAYANPET', 'jadcherla': 'MAHABUBNAGAR',
  'devarkadra': 'MAHABUBNAGAR', 'makthal': 'NARAYANPET', 'shadnagar': 'RANGAREDDY',
  'suryapet': 'SURYAPET', 'kamareddy': 'KAMAREDDY', 'jagtial': 'JAGTIAL',
  'peddapalli': 'PEDDAPALLI', 'mancherial': 'MANCHERIAL', 'nirmal': 'NIRMAL',
  'wanaparthy': 'WANAPARTHY', 'nagarkurnool': 'NAGARKURNOOL', 'jangaon': 'JANGAON',
  'mahabubabad': 'MAHABUBABAD', 'medchal': 'MEDCHAL-MALKAJGIRI',
  'sircilla': 'RAJANNA SIRCILLA', 'telangana': null,
};

/* ─── Sentiment Pie (pure SVG donut) ─── */
const SentimentPie = ({ positive = 0, negative = 0, neutral = 0, size = 180 }) => {
  const total = positive + negative + neutral;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <div className="text-sm text-slate-400">No data</div>
      </div>
    );
  }

  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  const slices = [
    { value: negative, color: '#ef4444', label: 'Negative' },
    { value: neutral, color: '#94a3b8', label: 'Neutral' },
    { value: positive, color: '#22c55e', label: 'Positive' },
  ].filter(s => s.value > 0);

  let startAngle = -Math.PI / 2;
  const paths = slices.map((slice) => {
    const angle = (slice.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    startAngle = endAngle;
    return { ...slice, d };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth={2} />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="white" />
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#1e293b" fontSize="18" fontWeight="700">{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#64748b" fontSize="10" fontWeight="500">Total</text>
    </svg>
  );
};

const PunjabMap = ({ embedded = false }) => {
  const navigate = useNavigate();
  const [geojson, setGeojson] = useState(null);
  const [mapStats, setMapStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [hoveredDistrict, setHoveredDistrict] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [sentimentData, setSentimentData] = useState(null);
  const [categoryData, setCategoryData] = useState(null);
  const [grievanceStats, setGrievanceStats] = useState(null);
  const [sangrurSummary, setSangrurSummary] = useState(null);
  const [hoverTweets, setHoverTweets] = useState([]);
  const [hoverTweetsLoading, setHoverTweetsLoading] = useState(false);
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const hoverHideTimerRef = useRef(null);

  const clearHoverHideTimer = useCallback(() => {
    if (hoverHideTimerRef.current) {
      clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }
  }, []);

  const scheduleHoverHide = useCallback(() => {
    clearHoverHideTimer();
    hoverHideTimerRef.current = setTimeout(() => {
      setHoveredDistrict(null);
    }, 220);
  }, [clearHoverHideTimer]);

  const handleDistrictClick = useCallback((distName) => {
    if (!distName) return;
    if (embedded) {
      const DistrictName = distName.replace(/\s*\(SC\)\s*$/, '').trim();
      navigate(`/grievances?location=${encodeURIComponent(DistrictName)}`);
    } else {
      // Title-case the all-caps DIST_NAME from GeoJSON (e.g. "SANGRUR" → "Sangrur")
      const titleCased = distName.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      navigate(`/grievances?location=${encodeURIComponent(titleCased)}`);
    }
  }, [navigate, embedded]);

  useEffect(() => {
    fetch('/telangana_ac.geojson')
      .then(r => r.json())
      .then(data => {
        const telangana = data.features.filter(f =>
          f.properties.ST_NAME === 'TELANGANA'
        );
        setGeojson({ ...data, features: telangana });
      });
  }, []);

  useEffect(() => {
    if (embedded) return;
    Promise.all([
      api.get('/grievances/sentiment-analytics').catch(() => ({ data: null })),
      api.get('/grievances/category-analytics').catch(() => ({ data: null })),
      api.get('/grievances/dashboard-stats').catch(() => ({ data: null })),
      api.get('/grievances/location-summary', { params: { location_city: 'mahabubnagar' } }).catch(() => ({ data: null })),
    ]).then(([sentRes, catRes, statsRes, summaryRes]) => {
      setSentimentData(sentRes.data);
      setCategoryData(catRes.data);
      setGrievanceStats(statsRes.data);
      setSangrurSummary(summaryRes.data);
    });
  }, [embedded]);

  const fetchMapStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/grievances/map', { params: { days: 30, scope: embedded ? 'mahabubnagar' : 'all' } });
      const locs = res.data?.locations;
      if (locs && Object.keys(locs).length > 0) {
        setMapStats(locs);
        setLoading(false);
        return;
      }
      setMapStats({});
    } catch (err) { console.warn('[Map] /grievances/map failed:', err.message); setMapStats({}); }
    finally { setLoading(false); }
  }, [embedded]);

  useEffect(() => { fetchMapStats(); }, [fetchMapStats]);

  useEffect(() => () => {
    if (hoverHideTimerRef.current) clearTimeout(hoverHideTimerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadHoverTweets = async () => {
      if (!embedded || !hoveredDistrict) {
        setHoverTweets([]);
        setHoverTweetsLoading(false);
        return;
      }
      const acQuery = hoveredDistrict.replace(/\s*\(SC\)\s*$/i, '').trim();
      setHoverTweetsLoading(true);
      try {
        const res = await api.get('/grievances', {
          params: {
            limit: 5,
            location_constituency: acQuery
          }
        });
        if (cancelled) return;
        const items = Array.isArray(res.data?.grievances) ? res.data.grievances : [];
        setHoverTweets(items);
      } catch (error) {
        if (!cancelled) setHoverTweets([]);
      } finally {
        if (!cancelled) setHoverTweetsLoading(false);
      }
    };

    loadHoverTweets();
    return () => { cancelled = true; };
  }, [embedded, hoveredDistrict]);

  const byDistrict = useMemo(() => {
    const m = {};
    const mahbubnagarAggregate = sangrurSummary
      ? {
        total: sangrurSummary.total || 0,
        positive: sangrurSummary.positive || 0,
        negative: sangrurSummary.negative || 0,
        neutral: sangrurSummary.neutral || 0,
        categories: Array.isArray(sangrurSummary.categories) ? sangrurSummary.categories : []
      }
      : (mapStats?.mahabubnagar || null);

    if (mahbubnagarAggregate) {
      m['MAHABUBNAGAR'] = {
        count: mahbubnagarAggregate.total ?? mahbubnagarAggregate.count ?? 0,
        positive: mahbubnagarAggregate.positive || 0,
        negative: mahbubnagarAggregate.negative || 0,
        neutral: mahbubnagarAggregate.neutral || 0,
        categories: Array.isArray(mahbubnagarAggregate.categories) ? [...mahbubnagarAggregate.categories] : []
      };
    }

    Object.entries(mapStats).forEach(([keyword, stats]) => {
      const dist = CITY_TO_DISTRICT[keyword];
      if (!dist) return;
      if (mahbubnagarAggregate && dist === 'MAHABUBNAGAR') return;
      if (!m[dist]) m[dist] = { count: 0, positive: 0, negative: 0, neutral: 0, categories: [] };
      const totalCount = (stats.negative || 0) + (stats.positive || 0) + (stats.neutral || 0);
      m[dist].count += totalCount;
      m[dist].positive += stats.positive;
      m[dist].negative += stats.negative;
      m[dist].neutral += stats.neutral;
      m[dist].categories = m[dist].categories.concat(stats.categories || []);
    });
    Object.values(m).forEach((d) => {
      d.categories = mergeTopicEntries(d.categories);
    });
    return m;
  }, [mapStats, sangrurSummary]);

  const byAC = useMemo(() => {
    if (!embedded) return {};
    const m = {};
    Object.entries(mapStats).forEach(([keyword, stats]) => {
      const ac = CITY_TO_AC[keyword];
      if (!ac) return;
      if (!m[ac]) m[ac] = { count: 0, positive: 0, negative: 0, neutral: 0, categories: [] };
      const totalCount = (stats.negative || 0) + (stats.positive || 0) + (stats.neutral || 0);
      m[ac].count += totalCount;
      m[ac].positive += stats.positive;
      m[ac].negative += stats.negative;
      m[ac].neutral += stats.neutral;
      m[ac].categories = m[ac].categories.concat(stats.categories || []);
    });
    Object.values(m).forEach((d) => {
      d.categories = mergeTopicEntries(d.categories);
    });
    return m;
  }, [mapStats, embedded]);

  const pcFeatures = useMemo(() => {
    if (!geojson || !embedded) return null;
    const feats = geojson.features.filter(f => f.properties.PC_NAME === MAHBUBNAGAR_PC);
    return { ...geojson, features: feats };
  }, [geojson, embedded]);

  const { projection, pathGenerator, dims } = useMemo(() => {
    if (!geojson) return { projection: null, pathGenerator: null, dims: { w: 800, h: 950 } };
    const source = (embedded && pcFeatures) ? pcFeatures : geojson;
    const w = embedded ? 600 : 700;
    const h = embedded ? 600 : 850;
    const proj = geoMercator().fitSize([w, h], source);
    return { projection: proj, pathGenerator: geoPath().projection(proj), dims: { w, h } };
  }, [geojson, embedded, pcFeatures]);

  const districtCentroids = useMemo(() => {
    if (!geojson || !projection) return {};
    const groups = {};
    geojson.features.forEach(f => {
      const d = f.properties.DIST_NAME;
      if (!groups[d]) groups[d] = [];
      groups[d].push(f);
    });
    const out = {};
    Object.entries(groups).forEach(([name, feats]) => {
      let sx = 0, sy = 0;
      feats.forEach(f => { const c = geoCentroid(f); sx += c[0]; sy += c[1]; });
      const px = projection([sx / feats.length, sy / feats.length]);
      if (px) out[name] = px;
    });
    return out;
  }, [geojson, projection]);

  const acCentroids = useMemo(() => {
    if (!pcFeatures || !projection) return {};
    const out = {};
    pcFeatures.features.forEach(f => {
      const name = f.properties.AC_NAME;
      const c = geoCentroid(f);
      const px = projection(c);
      if (px) out[name] = px;
    });
    return out;
  }, [pcFeatures, projection]);

  const districtFeatures = useMemo(() => {
    if (!geojson) return {};
    const m = {};
    geojson.features.forEach(f => {
      const d = f.properties.DIST_NAME;
      if (!m[d]) m[d] = { name: d, hasMahbubnagar: false };
      if (f.properties.PC_NAME === MAHBUBNAGAR_PC) m[d].hasMahbubnagar = true;
    });
    return m;
  }, [geojson]);

  const handleMouseMove = (e, distName) => {
    clearHoverHideTimer();
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) setTooltipPos({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 10 });
    setHoveredDistrict(distName);
  };

  const getTooltipTop = useCallback((estimatedHeight) => {
    const containerHeight = containerRef.current?.offsetHeight || dims.h || 700;
    const gap = 10;
    const fromTop = tooltipPos.y;
    const showAbove = fromTop > (containerHeight * 0.58);
    const rawTop = showAbove ? (fromTop - estimatedHeight - gap) : (fromTop + gap);
    const maxTop = Math.max(6, containerHeight - estimatedHeight - 6);
    return Math.min(Math.max(rawTop, 6), maxTop);
  }, [tooltipPos.y, dims.h]);

  const totalSentiment = useMemo(() => {
    if (sangrurSummary) {
      return {
        positive: sangrurSummary.positive || 0,
        negative: sangrurSummary.negative || 0,
        neutral: sangrurSummary.neutral || 0
      };
    }
    const mah = mapStats?.mahabubnagar || byDistrict['MAHABUBNAGAR'];
    if (mah) return { positive: mah.positive || 0, negative: mah.negative || 0, neutral: mah.neutral || 0 };
    return { positive: 0, negative: 0, neutral: 0 };
  }, [sangrurSummary, mapStats, byDistrict]);

  const totalGrievances = useMemo(() => {
    if (sangrurSummary) return sangrurSummary.total || 0;
    const mah = mapStats?.mahabubnagar || byDistrict['MAHABUBNAGAR'];
    if (!mah) return 0;
    return mah.total ?? mah.count ?? 0;
  }, [sangrurSummary, mapStats, byDistrict]);

  const topCategories = useMemo(() => {
    if (sangrurSummary && Array.isArray(sangrurSummary.categories)) {
      return mergeTopicEntries(sangrurSummary.categories).slice(0, 6);
    }
    const mah = mapStats?.mahabubnagar || byDistrict['MAHABUBNAGAR'];
    if (!mah || !Array.isArray(mah.categories)) return [];
    return mergeTopicEntries(mah.categories).slice(0, 6);
  }, [sangrurSummary, mapStats, byDistrict]);

  if (!geojson) return <div className={cn('flex items-center justify-center', embedded ? 'h-full' : 'h-screen')}><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;

  /* ── Embedded: Sangrur-only AC-level map ── */
  if (embedded && pcFeatures) {
    const hovAcName = hoveredDistrict;
    const hovStats = hovAcName ? (byAC[hovAcName] || { count: 0, positive: 0, negative: 0, neutral: 0, categories: [] }) : null;
    const hovTopCats = hovStats?.categories || [];
    const hovTotal = (hovStats?.negative || 0) + (hovStats?.positive || 0) + (hovStats?.neutral || 0);
    const totalSangrurGrievances = Object.values(byAC).reduce((s, st) => s + (st.count || 0), 0);

    return (
      <div className="relative w-full h-full" ref={containerRef}>
        {loading && <div className="absolute top-2 right-2 z-10"><Loader2 className="h-4 w-4 animate-spin text-green-500" /></div>}
        <div className="relative bg-white h-full overflow-hidden">
          <svg ref={svgRef} viewBox={`0 0 ${dims.w} ${dims.h}`} className="w-full h-full">
            {pcFeatures.features.map((f, i) => {
              const acName = f.properties.AC_NAME;
              const colors = getSentimentColors(byAC[acName]);
              const isHov = hovAcName === acName;
              return (
                <path key={i} d={pathGenerator(f.geometry)}
                  fill={isHov ? colors.hover : colors.fill}
                  stroke={isHov ? '#0f172a' : colors.stroke}
                  strokeWidth={isHov ? 2.5 : 1}
                  opacity={hovAcName && !isHov ? 0.6 : 1}
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={(e) => handleMouseMove(e, acName)}
                  onMouseMove={(e) => handleMouseMove(e, acName)}
                  onMouseLeave={scheduleHoverHide}
                  onClick={() => handleDistrictClick(acName)} />
              );
            })}
            {Object.entries(acCentroids).map(([acName, px]) => {
              const count = (byAC[acName]?.count) || 0;
              const isHov = hovAcName === acName;
              return (
                <g key={acName} className="pointer-events-none select-none">
                  <text x={px[0]} y={px[1] - (count > 0 ? 10 : 3)} textAnchor="middle"
                    style={{ fontSize: isHov ? '14px' : '11px', fontWeight: 700, fill: '#ffffff',
                      stroke: getSentimentColors(byAC[acName]).stroke, strokeWidth: 0.5, paintOrder: 'stroke',
                      textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{acName.replace(/ \(SC\)$/, '')}</text>
                  {count > 0 && (<>
                    <rect x={px[0] - 12} y={px[1] + 1} width={24} height={15} rx={4} fill="#0f172a" opacity={0.75} />
                    <text x={px[0]} y={px[1] + 12} textAnchor="middle" style={{ fontSize: '10px', fontWeight: 700, fill: '#fff' }}>{count}</text>
                  </>)}
                </g>
              );
            })}
            {pcFeatures.features.map((f, i) => (
              <path key={`ob-${i}`} d={pathGenerator(f.geometry)} fill="none" stroke="#14532d" strokeWidth={2} className="pointer-events-none" />
            ))}
          </svg>
          <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm border border-green-200 rounded-lg px-2.5 py-1.5 text-[10px] text-gray-600 shadow-sm">
            <span className="font-bold text-green-700">{pcFeatures.features.length} ACs</span>
          </div>
          {hovAcName && (
            <div
              className="absolute z-30"
              onMouseEnter={clearHoverHideTimer}
              onMouseLeave={scheduleHoverHide}
              style={{
              left: Math.min(tooltipPos.x + 12, (containerRef.current?.offsetWidth || 500) - 260),
              top: getTooltipTop(230), maxWidth: 280,
            }}>
              <div className="bg-white border border-gray-200 text-xs rounded-xl shadow-xl overflow-hidden">
                <div className="bg-green-600 text-white px-3 py-1.5 flex items-center justify-between">
                  <span className="font-bold text-[12px]">{hovAcName}</span>
                  <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded">AC · Kodangal</span>
                </div>
                <div className="p-2.5">
                  {!hovStats || hovStats.negative === 0 ? (
                    <div className="text-gray-400 italic text-[11px]">No grievances detected</div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-[10px] mb-1.5">
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{hovStats.negative} grievance{hovStats.negative !== 1 ? 's' : ''}
                        </span>
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />{hovStats.positive || 0}
                        </span>
                        <span className="inline-flex items-center gap-1 text-gray-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />{hovStats.neutral || 0}
                        </span>
                      </div>

                      {hovTotal > 0 && (
                        <div className="flex h-1.5 rounded-full overflow-hidden mb-2.5">
                          {hovStats.negative > 0 && <div className="bg-red-500" style={{ width: `${(hovStats.negative / hovTotal) * 100}%` }} />}
                          {hovStats.neutral > 0 && <div className="bg-gray-300" style={{ width: `${(hovStats.neutral / hovTotal) * 100}%` }} />}
                          {hovStats.positive > 0 && <div className="bg-green-500" style={{ width: `${(hovStats.positive / hovTotal) * 100}%` }} />}
                        </div>
                      )}

                      {hovTopCats.length > 0 ? (
                        <div>
                          <div className="text-[9px] font-semibold text-red-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Grievance Topics
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {hovTopCats.slice(0, 5).map(([cat, cnt]) => (
                              <span key={cat} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 ${getTopicStyle(cat)}`}>
                                <Tag className="h-2.5 w-2.5" />
                                {formatTopicLabel(cat)} <span className="font-bold">({cnt})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-gray-500 italic mt-1">No grievance topics found</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  //  STANDALONE: Constituency Overview Dashboard
  // ═══════════════════════════════════════════════
  const hovStats = hoveredDistrict ? (byDistrict[hoveredDistrict] || { count: 0, positive: 0, negative: 0, neutral: 0, categories: [] }) : null;
  const topCats = hovStats?.categories || [];
  const hovTotal = (hovStats?.negative || 0) + (hovStats?.positive || 0) + (hovStats?.neutral || 0);

  return (
    <div className="p-4 lg:p-6 min-h-screen bg-slate-50" ref={containerRef}>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kodangal Constituency Overview Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          {loading && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
          <Button onClick={() => navigate('/dashboard')} className="gap-2 bg-slate-800 hover:bg-slate-700 text-white">
            <BarChart3 className="h-4 w-4" />
            View More Details
          </Button>
        </div>
      </div>

      {/* Main 2-column: Left analytics | Right map */}
      <div className="flex gap-5 items-start">
        {/* LEFT PANEL */}
        <div className="w-[340px] flex-shrink-0 space-y-4">
          
          {/* CM Photo */}
          <Card className="overflow-hidden border-0 shadow-lg">
            <div className="relative">
              <img
                src="/CM.webp"
                alt="CM Revanth Reddy"
                className="w-full object-cover object-top"
                style={{ height: '320px' }}
              />
              {/* gradient overlay at bottom */}
              <div className="absolute inset-0 bg-gradient-to-t from-green-900/90 via-green-900/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h3 className="text-xl font-extrabold text-white leading-tight drop-shadow">Revanth Reddy</h3>
                <p className="text-green-200 text-sm font-medium mt-0.5">Chief Minister, Telangana</p>
                <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-[11px] font-semibold border border-white/30">MLA · Kodangal Constituency</span>
              </div>
            </div>
          </Card>

          {/* Sentiment Pie */}
          <Card className="p-4 border-0 shadow-md">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-700">Sentiment Analysis</h4>
              <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">Mahabubnagar</span>
            </div>
            <div className="flex justify-center">
              <SentimentPie
                positive={totalSentiment.positive || 0}
                negative={totalSentiment.negative || 0}
                neutral={totalSentiment.neutral || 0}
                size={180}
              />
            </div>
            <div className="flex justify-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-xs">
                <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                <span className="text-green-700 font-semibold">{totalSentiment.positive || 0}</span>
                <span className="text-slate-400">Positive</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                <span className="text-red-700 font-semibold">{totalSentiment.negative || 0}</span>
                <span className="text-slate-400">Negative</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Minus className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-slate-600 font-semibold">{totalSentiment.neutral || 0}</span>
                <span className="text-slate-400">Neutral</span>
              </div>
            </div>
          </Card>

          {/* Grievance Summary + Top Categories — side by side */}
          <div className="flex gap-3">
            {/* Quick Stats */}
            <Card className="p-3 border-0 shadow-md flex-1">
              <h4 className="text-xs font-semibold text-slate-700 mb-2">Grievance Summary</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-blue-50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-blue-700">{totalGrievances}</div>
                  <div className="text-[9px] text-blue-500 font-medium">Total</div>
                </div>
                <div className="bg-green-50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-green-700">{totalSentiment.positive || 0}</div>
                  <div className="text-[9px] text-green-500 font-medium">Positive</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-amber-700">{totalSentiment.neutral || 0}</div>
                  <div className="text-[9px] text-amber-500 font-medium">Moderate</div>
                </div>
                <div className="bg-red-50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-red-700">{totalSentiment.negative || 0}</div>
                  <div className="text-[9px] text-red-500 font-medium">Negative</div>
                </div>
              </div>
            </Card>

            {/* Top Categories */}
            {topCategories.length > 0 && (
              <Card className="p-3 border-0 shadow-md flex-1">
                <h4 className="text-xs font-semibold text-slate-700 mb-2">Top Topics</h4>
                <div className="flex flex-wrap gap-1.5">
                  {topCategories.map(([cat, cnt]) => {
                    const style = getTopicStyle(cat);
                    return (
                      <span key={cat} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 ${style}`}>
                        <Tag className="h-2.5 w-2.5" />
                        {formatTopicLabel(cat)} <span className="font-bold">({cnt})</span>
                      </span>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>

        </div>

        {/* RIGHT PANEL: Map */}
        <div className="flex-1 min-w-0">
          <div className="relative bg-white rounded-2xl border shadow-sm overflow-hidden h-full">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${dims.w} ${dims.h}`}
              className="w-full h-full"
              style={{ maxHeight: '82vh' }}
            >
              {/* Constituency polygons */}
              {geojson.features.map((f, i) => {
                const { DIST_NAME, PC_NAME } = f.properties;
                const isMahbubnagar = PC_NAME === MAHBUBNAGAR_PC;
                const isHov = hoveredDistrict === DIST_NAME;
                const distStats = byDistrict[DIST_NAME];
                const hasData = distStats && distStats.negative > 0;
                // Only Mahabubnagar PC gets green; all other districts stay gray/white
                let colors;
                if (isMahbubnagar) {
                  colors = hasData ? getSentimentColors(distStats) : { fill: '#bbf7d0', hover: '#86efac', stroke: '#22c55e' };
                } else {
                  colors = { fill: '#f8fafc', hover: '#f1f5f9', stroke: '#cbd5e1' };
                }
                return (
                  <path key={i} d={pathGenerator(f.geometry)}
                    fill={isHov ? colors.hover : colors.fill}
                    stroke={isHov ? '#0f172a' : isMahbubnagar ? '#15803d' : colors.stroke}
                    strokeWidth={isHov ? 2.5 : isMahbubnagar ? 1.4 : 0.5}
                    opacity={hoveredDistrict && !isHov ? 0.6 : 1}
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={(e) => handleMouseMove(e, DIST_NAME)}
                    onMouseMove={(e) => handleMouseMove(e, DIST_NAME)}
                    onMouseLeave={scheduleHoverHide}
                  onClick={() => handleDistrictClick(DIST_NAME)} />
                );
              })}

              {/* Mahabubnagar PC bold outline */}
              {geojson.features
                .filter(f => f.properties.PC_NAME === MAHBUBNAGAR_PC)
                .map((f, i) => (
                  <path key={`so-${i}`} d={pathGenerator(f.geometry)} fill="none"
                    stroke="#15803d" strokeWidth={2.5} className="pointer-events-none" />
                ))
              }

              {/* District Labels */}
              {Object.entries(districtCentroids).map(([name, px]) => {
                const info = districtFeatures[name];
                const isMahbubnagarDist = info?.hasMahbubnagar;
                // Only show count badge for Mahabubnagar
                const count = isMahbubnagarDist ? (totalGrievances || 0) : 0;
                const badgeW = count >= 100 ? 36 : count >= 10 ? 28 : 22;
                return (
                  <g key={name} className="pointer-events-none select-none">
                    <text
                      x={px[0]} y={px[1] - (count > 0 ? 12 : 2)}
                      textAnchor="middle"
                      style={{
                        fontSize: isMahbubnagarDist ? '13px' : '9px',
                        fontWeight: isMahbubnagarDist ? 800 : 500,
                        fill: isMahbubnagarDist ? '#14532d' : '#94a3b8',
                        stroke: isMahbubnagarDist ? '#bbf7d0' : 'white',
                        strokeWidth: 3, paintOrder: 'stroke',
                      }}
                    >{name}{isMahbubnagarDist ? ' ★' : ''}</text>
                    {count > 0 && (
                      <>
                        <rect x={px[0] - badgeW / 2} y={px[1] - 1} width={badgeW} height={18} rx={5}
                          fill="#15803d" opacity={0.9} />
                      <text x={px[0]} y={px[1] + 12} textAnchor="middle"
                          style={{ fontSize: '11px', fontWeight: 800, fill: '#fff' }}>{count}</text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Summary strip */}
            <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm border border-green-200 rounded-lg px-3 py-2 text-[11px] text-gray-600 shadow-sm">
              <span className="font-bold text-green-700">Kodangal Constituency · CM Revanth Reddy</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="inline-block w-2 h-2 rounded-sm bg-green-500" />
                <span className="text-[10px] text-slate-500">Hover over any district to see grievance details</span>
              </div>
            </div>

            {/* Hover tooltip */}
            {hoveredDistrict && (
              <div
                className="absolute bg-white border border-gray-200 shadow-xl rounded-xl z-50 overflow-hidden"
                onMouseEnter={clearHoverHideTimer}
                onMouseLeave={scheduleHoverHide}
                style={{
                  left: Math.min(tooltipPos.x, (containerRef.current?.offsetWidth || 800) - 370),
                  top: getTooltipTop(260),
                  minWidth: 280, maxWidth: 360
                }}
              >
                {/* Header */}
                <div className={cn(
                  'px-3.5 py-2 flex items-center justify-between',
                  districtFeatures[hoveredDistrict]?.hasMahbubnagar ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-800'
                )}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{hoveredDistrict}</span>
                    {hovTotal > 0 && (
                      <span className={cn('text-[10px] font-medium', districtFeatures[hoveredDistrict]?.hasMahbubnagar ? 'text-white/80' : 'text-gray-500')}>
                        {hovTotal} grievance{hovTotal !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {districtFeatures[hoveredDistrict]?.hasMahbubnagar && (
                    <Badge className="bg-white/20 text-white text-[10px] border-0">CM's Constituency</Badge>
                  )}
                </div>

                <div className="p-3">
                  {!hovStats || hovStats.negative === 0 ? (
                    <div className="text-xs text-gray-400 italic py-1">No grievances detected in this area</div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-[10px] mb-1.5">
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{hovStats.negative} grievance{hovStats.negative !== 1 ? 's' : ''}
                        </span>
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />{hovStats.positive || 0}
                        </span>
                        <span className="inline-flex items-center gap-1 text-gray-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />{hovStats.neutral || 0}
                        </span>
                      </div>

                      {hovTotal > 0 && (
                        <div className="flex h-1.5 rounded-full overflow-hidden mb-2.5">
                          {hovStats.negative > 0 && <div className="bg-red-500" style={{ width: `${(hovStats.negative / hovTotal) * 100}%` }} />}
                          {hovStats.neutral > 0 && <div className="bg-gray-300" style={{ width: `${(hovStats.neutral / hovTotal) * 100}%` }} />}
                          {hovStats.positive > 0 && <div className="bg-green-500" style={{ width: `${(hovStats.positive / hovTotal) * 100}%` }} />}
                        </div>
                      )}

                      {topCats.length > 0 ? (
                        <div>
                          <div className="text-[9px] font-semibold text-red-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Grievance Topics
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {topCats.slice(0, 5).map(([cat, cnt]) => (
                              <span key={cat} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 ${getTopicStyle(cat)}`}>
                                <Tag className="h-2.5 w-2.5" />
                                {formatTopicLabel(cat)} <span className="font-bold">({cnt})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-gray-500 italic mt-1">No grievance topics found</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Bottom legend */}
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500 justify-center">
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded border border-gray-300" style={{ background: '#f8fafc' }} /> Other Districts</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded" style={{ background: SENTIMENT_TIERS.low.fill }} /> Low Positive</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded" style={{ background: SENTIMENT_TIERS.medium.fill }} /> Medium Positive</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded" style={{ background: SENTIMENT_TIERS.high.fill }} /> High Positive</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Positive</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Negative</span>
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default PunjabMap;
