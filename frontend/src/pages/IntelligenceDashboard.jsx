import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  PLATFORM_LABELS, fmt, prettify, buildReportModel, exportReportPDF, exportReportExcel,
  TYPE_BADGE, fetchAllRowsForExport, dedupeReportRowsByAuthor, exportRowsPDF, exportRowsExcel,
  normalizeAlertReportRow, normalizeGrievanceReportRow
} from '../lib/reportExport';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  Camera,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Hash,
  KeyRound,
  Layers,
  Loader2,
  MessageSquare,
  Minus,
  Monitor,
  PieChart as PieChartIcon,
  RefreshCw,
  Shield,
  Tag,
  TrendingDown,
  TrendingUp,
  UserSearch,
  Users,
  Zap
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { exportAsPNG } from '../lib/chartExportUtils';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS & UTILITIES
   ═══════════════════════════════════════════════════════════════════ */
const TABS = [
  { key: 'alerts', label: 'Alerts Intelligence', icon: AlertTriangle, color: '#3b82f6', bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700' },
  { key: 'grievances', label: 'Grievances Intelligence', icon: MessageSquare, color: '#f59e0b', bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700' },
  { key: 'profiles', label: 'Profiles Intelligence', icon: UserSearch, color: '#8b5cf6', bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-700' }
];

const PLATFORM_COLORS = { x: '#000000', youtube: '#FF0000', facebook: '#1877F2', instagram: '#E4405F', whatsapp: '#25D366', unknown: '#94a3b8' };
const RISK_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
const STATUS_COLORS = {
  generated: '#3b82f6', printed: '#8b5cf6', sent: '#10b981', sent_to_intermediary: '#f59e0b',
  awaiting_reply: '#ec4899', closed: '#64748b', active: '#3b82f6', acknowledged: '#8b5cf6',
  resolved: '#10b981', false_positive: '#94a3b8', escalated: '#ef4444',
  PENDING: '#f59e0b', ESCALATED: '#ef4444', CLOSED: '#64748b',
  received: '#3b82f6', reviewed: '#8b5cf6', action_taken: '#10b981', converted_to_fir: '#ef4444'
};
const CHART_PALETTE = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1'];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.35, ease: 'easeOut' } })
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };

/* ═══════════════════════════════════════════════════════════════════
   SHARED SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="space-y-1">
        {payload.map((e) => (
          <div key={e.name} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color }} />
            <span className="text-xs text-slate-600">{e.name}:</span>
            <span className="text-xs font-bold text-slate-900">{fmt(e.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const GrowthBadge = ({ value }) => {
  const n = Number(value || 0);
  const pos = n > 0;
  const neutral = n === 0;
  const Icon = neutral ? Minus : pos ? TrendingUp : TrendingDown;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
      neutral && 'bg-slate-100 text-slate-500',
      pos && 'bg-emerald-50 text-emerald-700',
      !pos && !neutral && 'bg-rose-50 text-rose-700'
    )}>
      <Icon className="h-3 w-3" />
      {`${n > 0 ? '+' : ''}${n.toFixed(1)}%`}
    </span>
  );
};

const ExportButton = ({ chartRef, title }) => {
  const handleExport = useCallback(async () => {
    const el = chartRef?.current;
    if (!el) return;
    const safeName = (title || 'chart').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    await exportAsPNG(el, safeName);
  }, [chartRef, title]);
  return (
    <button type="button" onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50">
      <Camera className="h-3.5 w-3.5" /> Export
    </button>
  );
};

const KpiCard = ({ label, value, icon: Icon, color, subtitle, growth, onClick }) => (
  <motion.button
    type="button"
    variants={fadeUp}
    onClick={onClick}
    className={cn(
      'group relative overflow-hidden rounded-2xl border p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg',
      onClick ? 'cursor-pointer' : 'cursor-default'
    )}
    style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}
  >
    <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-20 blur-2xl" style={{ backgroundColor: color }} />
    <div className="flex items-start justify-between">
      <div className="rounded-xl border p-2" style={{ borderColor: `${color}30`, backgroundColor: `${color}15` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      {growth !== undefined && <GrowthBadge value={growth} />}
    </div>
    <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{fmt(value, true)}</p>
    <p className="mt-1 text-sm font-semibold" style={{ color }}>{label}</p>
    {subtitle && <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>}
  </motion.button>
);

const ChartCard = React.forwardRef(({ title, subtitle, icon: Icon, iconColor, children, className }, ref) => (
  <div ref={ref} className={cn('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          {Icon && <Icon className="h-4 w-4" style={{ color: iconColor || '#3b82f6' }} />}
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      {ref && <ExportButton chartRef={ref} title={title} />}
    </div>
    {children}
  </div>
));
ChartCard.displayName = 'ChartCard';

const EmptyState = ({ message }) => (
  <div className="flex h-[200px] items-center justify-center">
    <p className="text-sm text-slate-400">{message || 'No data available'}</p>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
   ROW-LEVEL REPORT TABLE — matches bandisunjay's Intelligence Dashboard
   report format: one row per post (or deduped by author in "Profiles"
   view mode). Used inside both the Alerts and Grievances tabs; the
   PDF/Excel buttons here export the real per-post list, not the
   aggregate KPI summary.
   ═══════════════════════════════════════════════════════════════════ */
const PAGE_SIZE = 25;

const RowLevelReportTable = ({ kind, dateFrom, dateTo }) => {
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'profiles'
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [profileRows, setProfileRows] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const buildParams = useCallback((overrides = {}) => {
    const params = { page, limit: PAGE_SIZE, ...overrides };
    if (kind === 'alerts') {
      params.status = params.status || 'all';
    } else {
      params.tab = params.tab || 'all';
      params.status_filter = params.status_filter || 'all';
    }
    if (dateFrom) {
      if (kind === 'alerts') params.startDate = dateFrom; else params.from = dateFrom;
    }
    if (dateTo) {
      if (kind === 'alerts') params.endDate = dateTo; else params.to = dateTo;
    }
    return params;
  }, [kind, page, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo, kind]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const endpoint = kind === 'alerts' ? '/alerts' : '/grievances';
        const listKey = kind === 'alerts' ? 'alerts' : 'grievances';
        const normalize = kind === 'alerts' ? normalizeAlertReportRow : normalizeGrievanceReportRow;
        const res = await api.get(endpoint, { params: buildParams() });
        if (cancelled) return;
        const list = Array.isArray(res.data?.[listKey]) ? res.data[listKey] : [];
        setRows(list.map(normalize));
        const p = res.data?.pagination || {};
        setPagination({
          total: Number(p.total) || 0,
          totalPages: Number(p.totalPages ?? p.pages) || 0,
          hasMore: Boolean(p.hasMore)
        });
      } catch {
        if (!cancelled) { setRows([]); setPagination({ total: 0, totalPages: 0, hasMore: false }); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [buildParams, kind]);

  useEffect(() => {
    if (viewMode !== 'profiles') return;
    let cancelled = false;
    const load = async () => {
      setProfilesLoading(true);
      try {
        const all = await fetchAllRowsForExport(kind, buildParams({ page: undefined }));
        if (!cancelled) setProfileRows(all);
      } catch {
        if (!cancelled) setProfileRows([]);
      } finally {
        if (!cancelled) setProfilesLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [viewMode, kind, buildParams]);

  const displayRows = viewMode === 'profiles' ? dedupeReportRowsByAuthor(profileRows) : rows;
  const dateRangeLabel = dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : 'All time';
  const title = kind === 'alerts' ? 'Alerts Report' : 'Grievances Report';

  const handleExport = async (format) => {
    setExporting(true);
    try {
      const allRows = viewMode === 'profiles' ? dedupeReportRowsByAuthor(profileRows) : await fetchAllRowsForExport(kind, buildParams({ page: undefined }));
      if (!allRows.length) {
        toast.error('No rows to export for the current filters');
        return;
      }
      const fileName = `${kind}_report_${viewMode}_${new Date().toISOString().slice(0, 10)}`;
      const opts = { fileName, title, dateRangeLabel, profilesMode: viewMode === 'profiles' };
      if (format === 'pdf') await exportRowsPDF(allRows, opts);
      else exportRowsExcel(allRows, opts);
      toast.success(`${title} downloaded (${format.toUpperCase()})`);
    } catch (e) {
      toast.error('Failed to generate report');
    } finally {
      setExporting(false);
    }
  };

  const isLoading = loading || (viewMode === 'profiles' && profilesLoading);

  return (
    <ChartCard title={title} subtitle={`${viewMode === 'profiles' ? displayRows.length + ' profile(s)' : pagination.total + ' post(s)'} — ${dateRangeLabel}`} icon={FileText} iconColor="#f59e0b">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {['all', 'profiles'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                viewMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {mode === 'all' ? 'Content' : 'Profiles'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            disabled={exporting || isLoading || displayRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-all hover:bg-blue-100 disabled:opacity-40"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
          </button>
          <button
            type="button"
            onClick={() => handleExport('excel')}
            disabled={exporting || isLoading || displayRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-100 disabled:opacity-40"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Excel
          </button>
        </div>
      </div>

      {isLoading ? (
        <EmptyState message="Loading..." />
      ) : displayRows.length === 0 ? (
        <EmptyState message="No records for the current filters" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Posted By</th>
                <th className="px-3 py-2 font-semibold">Handle</th>
                <th className="px-3 py-2 font-semibold">Platform</th>
                <th className="px-3 py-2 font-semibold">Risk/Sentiment</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                {viewMode === 'profiles' && <th className="px-3 py-2 font-semibold">Posts</th>}
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRows.slice(0, 100).map((r, i) => (
                <tr key={r.id || r.tweet_id || i} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{r.posted_by?.display_name || r.posted_by?.handle || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{r.posted_by?.handle || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{PLATFORM_LABELS[r.platform] || prettify(r.platform || '—')}</td>
                  <td className="px-3 py-2 text-slate-600">{prettify(r.sentiment || '—')}</td>
                  <td className="px-3 py-2 text-slate-600">{r.category || '—'}</td>
                  {viewMode === 'profiles' && <td className="px-3 py-2 text-slate-600">{r._postCount || 1}</td>}
                  <td className="px-3 py-2 text-slate-500">{r.post_date ? new Date(r.post_date).toLocaleDateString('en-GB') : '—'}</td>
                  <td className="px-3 py-2">
                    {r.post_link ? (
                      <a href={r.post_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {displayRows.length > 100 && (
            <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-center text-[11px] text-slate-400">
              Showing first 100 of {displayRows.length} — the full list is included in the PDF/Excel export
            </div>
          )}
        </div>
      )}

      {viewMode === 'all' && pagination.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-md border border-slate-200 px-2.5 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span>Page {page} of {pagination.totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => (pagination.hasMore ? p + 1 : p))}
            disabled={!pagination.hasMore}
            className="rounded-md border border-slate-200 px-2.5 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </ChartCard>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   ALERTS INTELLIGENCE TAB
   ═══════════════════════════════════════════════════════════════════ */
const AlertsIntelligence = ({ data, dateFrom, dateTo }) => {
  const refs = {
    riskTrend: useRef(null),
    riskDist: useRef(null),
    platformDist: useRef(null),
    escalations: useRef(null),
    escalationPlatform: useRef(null),
    actions: useRef(null),
    topAccounts: useRef(null),
    keywords: useRef(null),
    keywordMatches: useRef(null),
    reportStatus: useRef(null),
    accountsTrend: useRef(null),
    alertTypes: useRef(null),
    riskPlatform: useRef(null),
    alertStatus: useRef(null)
  };

  if (!data) return <EmptyState message="Loading alerts intelligence..." />;

  const riskDist = (data.riskAnalysis?.distribution || []).map(r => ({
    name: prettify(r.level), value: r.count, color: RISK_COLORS[r.level] || '#94a3b8'
  }));

  const platformDist = (data.platformDistribution || []).map(r => ({
    name: PLATFORM_LABELS[r.platform] || r.platform, value: r.count, color: PLATFORM_COLORS[r.platform] || PLATFORM_COLORS.unknown
  }));

  const alertTypesData = (data.alertTypes || []).map((r, i) => ({
    name: prettify(r.type), value: r.count, color: CHART_PALETTE[i % CHART_PALETTE.length]
  }));

  const escalationStatusData = (data.escalations?.statusDistribution || []).map((r, i) => ({
    name: prettify(r.status), value: r.count, color: STATUS_COLORS[r.status] || CHART_PALETTE[i % CHART_PALETTE.length]
  }));

  // Build platform-escalation cross tab
  const escByPlatformMap = {};
  (data.escalations?.byPlatform || []).forEach(({ platform, status, count }) => {
    if (!escByPlatformMap[platform]) escByPlatformMap[platform] = { platform: PLATFORM_LABELS[platform] || platform };
    escByPlatformMap[platform][prettify(status)] = count;
  });
  const escByPlatformData = Object.values(escByPlatformMap);
  const escStatuses = [...new Set((data.escalations?.byPlatform || []).map(r => prettify(r.status)))];

  const actionsData = (data.actions?.byPlatform || []).map(r => ({
    name: PLATFORM_LABELS[r.platform] || r.platform, value: r.count, color: PLATFORM_COLORS[r.platform] || PLATFORM_COLORS.unknown
  }));

  const topAccounts = data.topActiveAccounts || [];

  const keywordCatData = (data.keywords?.byCategory || []).map((r, i) => ({
    name: prettify(r.category), total: r.total, active: r.active, color: CHART_PALETTE[i % CHART_PALETTE.length]
  }));

  const topKeywords = (data.keywords?.topMatched || []).slice(0, 12);

  const reportStatusData = (data.reportsFormatShare?.statusDistribution || []).map((r, i) => ({
    name: prettify(r.status), value: r.count, color: STATUS_COLORS[r.status] || CHART_PALETTE[i % CHART_PALETTE.length]
  }));

  const alertTrend = data.alertsTrend || [];

  const alertStatusData = (data.alertStatusSummary || []).map((r, i) => ({
    name: prettify(r.status), value: r.count, color: STATUS_COLORS[r.status] || CHART_PALETTE[i % CHART_PALETTE.length]
  }));

  // Risk by platform cross-tab
  const riskPlatformMap = {};
  (data.riskAnalysis?.byPlatform || []).forEach(({ platform, riskLevel, count }) => {
    if (!riskPlatformMap[platform]) riskPlatformMap[platform] = { platform: PLATFORM_LABELS[platform] || platform };
    riskPlatformMap[platform][prettify(riskLevel)] = count;
  });
  const riskPlatformData = Object.values(riskPlatformMap);

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-5">
      {/* KPI Cards */}
      <motion.div variants={stagger} className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Total Accounts" value={data.accounts?.total} icon={Users} color="#3b82f6" subtitle={`${data.accounts?.active || 0} active`} />
        <KpiCard label="Added in Range" value={data.accounts?.addedInRange} icon={TrendingUp} color="#10b981" subtitle="Accounts added" />
        <KpiCard label="Total Alerts" value={data.comparison?.alerts?.current} icon={AlertTriangle} color="#ef4444" growth={data.comparison?.alerts?.changePct} />
        <KpiCard label="Reports Generated" value={data.actions?.total} icon={FileText} color="#8b5cf6" growth={data.actions?.changePct} />
        <KpiCard label="High Risk" value={riskDist.find(r => r.name === 'High')?.value || 0} icon={Shield} color="#ef4444" />
        <KpiCard label="Top Keywords" value={topKeywords.length} icon={KeyRound} color="#f59e0b" subtitle="Matched keywords" />
      </motion.div>

      {/* Row 1: Risk Trend + Risk Distribution */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <ChartCard ref={refs.riskTrend} title="Alerts Trend by Risk Level" subtitle="Daily alert volume breakdown" icon={Activity} iconColor="#3b82f6" className="xl:col-span-8">
          {alertTrend.length ? (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={alertTrend} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
                  <defs>
                    {['high', 'medium', 'low'].map(level => (
                      <linearGradient key={level} id={`risk-grad-${level}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={RISK_COLORS[level]} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={RISK_COLORS[level]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={v => String(v).slice(5)} minTickGap={18} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12, fontWeight: 600 }} />
                  <Area type="monotone" dataKey="high" name="High Risk" stroke={RISK_COLORS.high} strokeWidth={2} fill="url(#risk-grad-high)" dot={false} />
                  <Area type="monotone" dataKey="medium" name="Medium Risk" stroke={RISK_COLORS.medium} strokeWidth={2} fill="url(#risk-grad-medium)" dot={false} />
                  <Area type="monotone" dataKey="low" name="Low Risk" stroke={RISK_COLORS.low} strokeWidth={2} fill="url(#risk-grad-low)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.riskDist} title="Risk Distribution" subtitle="Alert severity breakdown" icon={PieChartIcon} iconColor="#ef4444" className="xl:col-span-4">
          {riskDist.length ? (
            <>
              <div className="relative h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={riskDist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} cornerRadius={4}>
                      {riskDist.map(e => <Cell key={e.name} fill={e.color} stroke="white" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-2xl font-black text-slate-900">{fmt(riskDist.reduce((s, r) => s + r.value, 0), true)}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Alerts</p>
                </div>
              </div>
              <div className="mt-2 space-y-1.5">
                {riskDist.map(r => (
                  <div key={r.name} className="flex items-center justify-between rounded-lg px-2 py-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="text-xs font-medium text-slate-600">{r.name}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-800">{fmt(r.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <EmptyState />}
        </ChartCard>
      </motion.div>

      {/* Row 2: Platform Distribution + Risk by Platform */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard ref={refs.platformDist} title="Platform Distribution" subtitle="Alerts by source platform" icon={Globe} iconColor="#1877F2">
          {platformDist.length ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platformDist} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Alerts" radius={[8, 8, 0, 0]} maxBarSize={52}>
                    {platformDist.map(r => <Cell key={r.name} fill={r.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.riskPlatform} title="Risk Level by Platform" subtitle="Cross-tabulated risk analysis" icon={Layers} iconColor="#8b5cf6">
          {riskPlatformData.length ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskPlatformData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="platform" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12, fontWeight: 600 }} />
                  <Bar dataKey="High" name="High" fill={RISK_COLORS.high} radius={[4, 4, 0, 0]} maxBarSize={32} stackId="risk" />
                  <Bar dataKey="Medium" name="Medium" fill={RISK_COLORS.medium} radius={[0, 0, 0, 0]} maxBarSize={32} stackId="risk" />
                  <Bar dataKey="Low" name="Low" fill={RISK_COLORS.low} radius={[0, 0, 4, 4]} maxBarSize={32} stackId="risk" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>
      </motion.div>

      {/* Row 3: Escalations Status + Escalations by Platform */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard ref={refs.escalations} title="Escalation Status" subtitle="Report workflow status distribution" icon={FileText} iconColor="#f59e0b">
          {escalationStatusData.length ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={escalationStatusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2} cornerRadius={3}>
                    {escalationStatusData.map(e => <Cell key={e.name} fill={e.color} stroke="white" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.escalationPlatform} title="Escalations by Platform" subtitle="Platform-wise report status" icon={Monitor} iconColor="#3b82f6">
          {escByPlatformData.length ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={escByPlatformData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="platform" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12, fontWeight: 600 }} />
                  {escStatuses.map((status, i) => (
                    <Bar key={status} dataKey={status} name={status} fill={CHART_PALETTE[i % CHART_PALETTE.length]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>
      </motion.div>

      {/* Row 4: Actions Pie + Report Status + Alert Types */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard ref={refs.actions} title="Actions by Platform" subtitle="Reports generated per platform" icon={Zap} iconColor="#10b981">
          {actionsData.length ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={actionsData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2} cornerRadius={3}>
                    {actionsData.map(e => <Cell key={e.name} fill={e.color} stroke="white" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.reportStatus} title="Report Format & Share" subtitle="Report lifecycle status" icon={BookOpen} iconColor="#8b5cf6">
          {reportStatusData.length ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportStatusData} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} width={110} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Reports" radius={[0, 6, 6, 0]} maxBarSize={22}>
                    {reportStatusData.map(e => <Cell key={e.name} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.alertTypes} title="Alert Type Distribution" subtitle="Classification of alert triggers" icon={Tag} iconColor="#ec4899">
          {alertTypesData.length ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={alertTypesData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2} cornerRadius={3}>
                    {alertTypesData.map(e => <Cell key={e.name} fill={e.color} stroke="white" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>
      </motion.div>

      {/* Row 5: Top Active Accounts */}
      <motion.div variants={fadeUp}>
        <ChartCard ref={refs.topAccounts} title="Top Active Accounts" subtitle="Most flagged accounts in selected period" icon={Users} iconColor="#ef4444">
          {topAccounts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">#</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Account</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Platform</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Total</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">High</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Medium</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Low</th>
                  </tr>
                </thead>
                <tbody>
                  {topAccounts.slice(0, 10).map((acc, idx) => (
                    <tr key={idx} className="border-b border-slate-50 transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs font-bold text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{acc.author}</p>
                          <p className="text-[11px] text-slate-400">@{acc.handle}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: `${PLATFORM_COLORS[acc.platform] || '#94a3b8'}15`, color: PLATFORM_COLORS[acc.platform] || '#94a3b8' }}>
                          {PLATFORM_LABELS[acc.platform] || acc.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-black text-slate-900">{acc.alertCount}</td>
                      <td className="px-4 py-3 text-right"><span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">{acc.highRisk}</span></td>
                      <td className="px-4 py-3 text-right"><span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">{acc.mediumRisk}</span></td>
                      <td className="px-4 py-3 text-right"><span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">{acc.lowRisk}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState message="No account data available" />}
        </ChartCard>
      </motion.div>

      {/* Row 6: Keywords */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard ref={refs.keywords} title="Keywords by Category" subtitle="Active vs total keywords per category" icon={Hash} iconColor="#f59e0b">
          {keywordCatData.length ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={keywordCatData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12, fontWeight: 600 }} />
                  <Bar dataKey="total" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="active" name="Active" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.keywordMatches} title="Top Matched Keywords" subtitle="Most frequently triggered keywords" icon={KeyRound} iconColor="#ef4444">
          {topKeywords.length ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topKeywords} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="keyword" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} width={100} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Matches" radius={[0, 6, 6, 0]} maxBarSize={18}>
                    {topKeywords.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>
      </motion.div>

      {/* Row 7: Alert Status Summary */}
      <motion.div variants={fadeUp}>
        <ChartCard ref={refs.alertStatus} title="Alert Status Summary" subtitle="Current alert status distribution" icon={Activity} iconColor="#6366f1">
          {alertStatusData.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
              {alertStatusData.map(s => (
                <div key={s.name} className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center transition-all hover:shadow-md">
                  <p className="text-2xl font-black text-slate-900">{fmt(s.value, true)}</p>
                  <p className="mt-1 text-xs font-semibold" style={{ color: s.color }}>{s.name}</p>
                </div>
              ))}
            </div>
          ) : <EmptyState />}
        </ChartCard>
      </motion.div>

      <motion.div variants={fadeUp}>
        <RowLevelReportTable kind="alerts" dateFrom={dateFrom} dateTo={dateTo} />
      </motion.div>
    </motion.div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   GRIEVANCES INTELLIGENCE TAB
   ═══════════════════════════════════════════════════════════════════ */
const GrievancesIntelligence = ({ data, dateFrom, dateTo }) => {
  const refs = {
    trend: useRef(null),
    platform: useRef(null),
    workflow: useRef(null),
    classification: useRef(null),
    priority: useRef(null),
    gwrStatus: useRef(null),
    gwrCategory: useRef(null),
    suggCategory: useRef(null),
    critCategory: useRef(null),
    tagged: useRef(null),
    sentiment: useRef(null),
    urgency: useRef(null)
  };

  if (!data) return <EmptyState message="Loading grievances intelligence..." />;

  const platformData = (data.byPlatform || []).map(r => ({
    name: PLATFORM_LABELS[r.platform] || r.platform, value: r.count, color: PLATFORM_COLORS[r.platform] || PLATFORM_COLORS.unknown
  }));

  const workflowData = (data.workflowStatus || []).map((r, i) => ({
    name: prettify(r.status), value: r.count, color: STATUS_COLORS[r.status] || CHART_PALETTE[i % CHART_PALETTE.length]
  }));

  const classificationData = (data.classification || []).map((r, i) => ({
    name: prettify(r.type), value: r.count, color: CHART_PALETTE[i % CHART_PALETTE.length]
  }));

  const priorityData = (data.priority || []).map(r => ({
    name: prettify(r.level), value: r.count, color: r.level === 'critical' ? '#ef4444' : r.level === 'high' ? '#f97316' : r.level === 'medium' ? '#f59e0b' : '#22c55e'
  }));

  const gwrStatusData = (data.grievanceReports?.statusDistribution || []).map(r => ({
    name: r.status, value: r.count, color: STATUS_COLORS[r.status] || '#94a3b8'
  }));

  const gwrCategoryData = (data.grievanceReports?.categoryDistribution || []).map((r, i) => ({
    name: r.category, value: r.count, color: CHART_PALETTE[i % CHART_PALETTE.length]
  }));

  const suggCategoryData = (data.suggestions?.categoryDistribution || []).map((r, i) => ({
    name: r.category, value: r.count, color: CHART_PALETTE[i % CHART_PALETTE.length]
  }));

  const critCategoryData = (data.criticism?.categoryDistribution || []).map((r, i) => ({
    name: r.category, value: r.count, color: CHART_PALETTE[i % CHART_PALETTE.length]
  }));

  const taggedAccounts = (data.topTaggedAccounts || []).slice(0, 10);
  const trendData = data.dailyTrend || [];

  const sentimentData = (data.sentiment || []).map(r => ({
    name: prettify(r.sentiment), value: r.count, color: r.sentiment === 'positive' ? '#22c55e' : r.sentiment === 'negative' ? '#ef4444' : '#94a3b8'
  }));

  const urgencyData = (data.urgency || []).map(r => ({
    name: prettify(r.level), value: r.count, color: r.level === 'critical' ? '#ef4444' : r.level === 'high' ? '#f97316' : r.level === 'medium' ? '#f59e0b' : '#22c55e'
  }));

  const eng = data.engagement || {};

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-5">
      {/* KPI Cards */}
      <motion.div variants={stagger} className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Total Grievances" value={data.summary?.total} icon={MessageSquare} color="#f59e0b" />
        <KpiCard label="In Date Range" value={data.summary?.inRange} icon={CalendarDays} color="#3b82f6" growth={data.summary?.changePct} />
        <KpiCard label="Grievance Reports" value={data.grievanceReports?.total} icon={FileText} color="#8b5cf6" subtitle={`${data.grievanceReports?.shared || 0} shared`} />
        <KpiCard label="Pending" value={data.grievanceReports?.pending} icon={AlertTriangle} color="#ef4444" />
        <KpiCard label="Suggestions" value={data.suggestions?.total} icon={Building2} color="#10b981" subtitle={`${data.suggestions?.shared || 0} shared`} />
        <KpiCard label="Criticism" value={data.criticism?.total} icon={Zap} color="#ec4899" subtitle={`${data.criticism?.shared || 0} shared`} />
      </motion.div>

      {/* Engagement Summary */}
      <motion.div variants={fadeUp} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800">
          <Activity className="h-4 w-4 text-blue-500" /> Engagement Metrics
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { label: 'Total Views', value: eng.totalViews, color: '#3b82f6' },
            { label: 'Total Likes', value: eng.totalLikes, color: '#ef4444' },
            { label: 'Total Retweets', value: eng.totalRetweets, color: '#10b981' },
            { label: 'Total Replies', value: eng.totalReplies, color: '#8b5cf6' },
            { label: 'Avg Likes', value: eng.avgLikes, color: '#f59e0b' },
            { label: 'Avg Views', value: eng.avgViews, color: '#06b6d4' }
          ].map(m => (
            <div key={m.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center">
              <p className="text-2xl font-black text-slate-900">{fmt(m.value, true)}</p>
              <p className="mt-1 text-xs font-semibold" style={{ color: m.color }}>{m.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Row 1: Daily Trend + Platform */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <ChartCard ref={refs.trend} title="Daily Grievance Trend" subtitle="Volume of grievances over time" icon={Activity} iconColor="#f59e0b" className="xl:col-span-8">
          {trendData.length ? (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
                  <defs>
                    <linearGradient id="grievance-trend-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={v => String(v).slice(5)} minTickGap={18} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="count" name="Grievances" stroke="#f59e0b" strokeWidth={2} fill="url(#grievance-trend-grad)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.platform} title="Platform Distribution" subtitle="Grievances by source" icon={Globe} iconColor="#1877F2" className="xl:col-span-4">
          {platformData.length ? (
            <>
              <div className="relative h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={platformData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} cornerRadius={4}>
                      {platformData.map(e => <Cell key={e.name} fill={e.color} stroke="white" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-2xl font-black text-slate-900">{fmt(platformData.reduce((s, r) => s + r.value, 0), true)}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Total</p>
                </div>
              </div>
              <div className="mt-2 space-y-1.5">
                {platformData.map(r => (
                  <div key={r.name} className="flex items-center justify-between rounded-lg px-2 py-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="text-xs font-medium text-slate-600">{r.name}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-800">{fmt(r.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <EmptyState />}
        </ChartCard>
      </motion.div>

      {/* Row 2: Workflow Status + Classification + Priority */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard ref={refs.workflow} title="Workflow Status" subtitle="Grievance processing pipeline" icon={Layers} iconColor="#8b5cf6">
          {workflowData.length ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={workflowData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2} cornerRadius={3}>
                    {workflowData.map(e => <Cell key={e.name} fill={e.color} stroke="white" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.classification} title="Classification Breakdown" subtitle="Complaint vs acknowledged vs unclassified" icon={Tag} iconColor="#10b981">
          {classificationData.length ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classificationData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Count" radius={[8, 8, 0, 0]} maxBarSize={48}>
                    {classificationData.map(e => <Cell key={e.name} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.priority} title="Complaint Priority Levels" subtitle="Priority classification of complaints" icon={Shield} iconColor="#ef4444">
          {priorityData.length ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={priorityData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2} cornerRadius={3}>
                    {priorityData.map(e => <Cell key={e.name} fill={e.color} stroke="white" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>
      </motion.div>

      {/* Row 3: GWR Status + GWR Category + Sentiment */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard ref={refs.gwrStatus} title="Report Status (G-Workflow)" subtitle="PENDING / ESCALATED / CLOSED" icon={FileText} iconColor="#f59e0b">
          {gwrStatusData.length ? (
            <div className="space-y-3 pt-2">
              {gwrStatusData.map(s => {
                const total = gwrStatusData.reduce((sum, x) => sum + x.value, 0);
                const pct = total ? ((s.value / total) * 100).toFixed(1) : 0;
                return (
                  <div key={s.name}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">{s.name}</span>
                      <span className="text-xs font-bold text-slate-900">{fmt(s.value)} ({pct}%)</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.gwrCategory} title="Grievance Categories" subtitle="Report classification categories" icon={BarChart3} iconColor="#8b5cf6">
          {gwrCategoryData.length ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gwrCategoryData.slice(0, 7)} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} width={85} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Reports" radius={[0, 6, 6, 0]} maxBarSize={20}>
                    {gwrCategoryData.slice(0, 7).map(e => <Cell key={e.name} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.sentiment} title="Sentiment Analysis" subtitle="AI-detected sentiment distribution" icon={Activity} iconColor="#06b6d4">
          {sentimentData.length ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2} cornerRadius={3}>
                    {sentimentData.map(e => <Cell key={e.name} fill={e.color} stroke="white" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState message="No sentiment data" />}
        </ChartCard>
      </motion.div>

      {/* Row 4: Suggestion + Criticism Categories */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard ref={refs.suggCategory} title="Suggestion Categories" subtitle="Distribution of suggestion reports" icon={Building2} iconColor="#10b981">
          {suggCategoryData.length ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={suggCategoryData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Suggestions" radius={[8, 8, 0, 0]} maxBarSize={40}>
                    {suggCategoryData.map(e => <Cell key={e.name} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.critCategory} title="Criticism Categories" subtitle="Distribution of criticism reports" icon={Zap} iconColor="#ec4899">
          {critCategoryData.length ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={critCategoryData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Criticism" radius={[8, 8, 0, 0]} maxBarSize={40}>
                    {critCategoryData.map(e => <Cell key={e.name} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>
      </motion.div>

      {/* Row 5: Top Tagged Accounts */}
      <motion.div variants={fadeUp}>
        <ChartCard ref={refs.tagged} title="Top Tagged Accounts" subtitle="Most mentioned government handles" icon={Users} iconColor="#f59e0b">
          {taggedAccounts.length ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taggedAccounts.map((r, i) => ({ ...r, name: `@${r.account}`, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} width={120} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Mentions" radius={[0, 6, 6, 0]} maxBarSize={20}>
                    {taggedAccounts.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>
      </motion.div>

      <motion.div variants={fadeUp}>
        <RowLevelReportTable kind="grievances" dateFrom={dateFrom} dateTo={dateTo} />
      </motion.div>
    </motion.div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   PROFILES INTELLIGENCE TAB
   ═══════════════════════════════════════════════════════════════════ */
const ProfilesIntelligence = ({ data }) => {
  const refs = {
    trend: useRef(null),
    platform: useRef(null),
    monthly: useRef(null),
    district: useRef(null),
    coverage: useRef(null),
    creator: useRef(null)
  };

  if (!data) return <EmptyState message="Loading profiles intelligence..." />;

  const trendData = data.trend || [];
  const monthlyData = data.monthlyTrend || [];

  const platformData = (data.platformDistribution || []).map(r => ({
    name: PLATFORM_LABELS[r.platform] || r.platform, value: r.count, color: PLATFORM_COLORS[r.platform] || PLATFORM_COLORS.unknown
  }));

  const districtData = (data.districtDistribution || []).slice(0, 10).map((r, i) => ({
    name: r.district, value: r.count, color: CHART_PALETTE[i % CHART_PALETTE.length]
  }));

  const coverageData = (data.socialCoverage || []).map((r, i) => ({
    name: `${r.linkedPlatforms} Platform${r.linkedPlatforms !== 1 ? 's' : ''}`,
    value: r.count,
    color: CHART_PALETTE[i % CHART_PALETTE.length]
  }));

  const creatorData = (data.profilesByCreator || []).map((r, i) => ({
    name: r.creator, value: r.count, color: CHART_PALETTE[i % CHART_PALETTE.length]
  }));

  const summary = data.summary || {};

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-5">
      {/* KPI Cards */}
      <motion.div variants={stagger} className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="Total Profiles" value={summary.total} icon={Users} color="#8b5cf6" />
        <KpiCard label="Active" value={summary.active} icon={UserSearch} color="#10b981" />
        <KpiCard label="Archived" value={summary.archived} icon={FileText} color="#64748b" />
        <KpiCard label="Added in Range" value={summary.addedInRange} icon={TrendingUp} color="#3b82f6" growth={data.comparison?.changePct} />
        <KpiCard label="With FIR" value={summary.withFIR} icon={Shield} color="#ef4444" />
        <KpiCard label="With Reports" value={summary.withReports} icon={BookOpen} color="#f59e0b" />
        <KpiCard label="Deleted Profiles" value={summary.withDeletedProfiles} icon={AlertTriangle} color="#ec4899" subtitle="Tracked deletions" />
      </motion.div>

      {/* Row 1: Daily Trend + Platform */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <ChartCard ref={refs.trend} title="Profile Creation Trend" subtitle="Daily profile additions" icon={Activity} iconColor="#8b5cf6" className="xl:col-span-8">
          {trendData.length ? (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
                  <defs>
                    <linearGradient id="profile-trend-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={v => String(v).slice(5)} minTickGap={18} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="count" name="Profiles" stroke="#8b5cf6" strokeWidth={2} fill="url(#profile-trend-grad)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.platform} title="Platform Coverage" subtitle="Social media platforms linked" icon={Globe} iconColor="#1877F2" className="xl:col-span-4">
          {platformData.length ? (
            <>
              <div className="relative h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={platformData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} cornerRadius={4}>
                      {platformData.map(e => <Cell key={e.name} fill={e.color} stroke="white" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-2xl font-black text-slate-900">{fmt(platformData.reduce((s, r) => s + r.value, 0), true)}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Links</p>
                </div>
              </div>
              <div className="mt-2 space-y-1.5">
                {platformData.map(r => (
                  <div key={r.name} className="flex items-center justify-between rounded-lg px-2 py-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="text-xs font-medium text-slate-600">{r.name}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-800">{fmt(r.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <EmptyState />}
        </ChartCard>
      </motion.div>

      {/* Row 2: Monthly Trend + District Distribution */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard ref={refs.monthly} title="Monthly Creation Trend" subtitle="Profile additions per month" icon={CalendarDays} iconColor="#3b82f6">
          {monthlyData.length ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Profiles" radius={[8, 8, 0, 0]} maxBarSize={40} fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.district} title="District / Commissionerate" subtitle="Profile distribution by region" icon={Building2} iconColor="#f59e0b">
          {districtData.length ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={districtData} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} width={120} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Profiles" radius={[0, 6, 6, 0]} maxBarSize={20}>
                    {districtData.map(e => <Cell key={e.name} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>
      </motion.div>

      {/* Row 3: Social Coverage + Created By */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard ref={refs.coverage} title="Social Media Coverage" subtitle="Number of platforms linked per profile" icon={Layers} iconColor="#10b981">
          {coverageData.length ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={coverageData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Profiles" radius={[8, 8, 0, 0]} maxBarSize={48}>
                    {coverageData.map(e => <Cell key={e.name} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard ref={refs.creator} title="Profiles by Creator" subtitle="Who added the profiles" icon={Users} iconColor="#8b5cf6">
          {creatorData.length ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={creatorData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2} cornerRadius={3}>
                    {creatorData.map(e => <Cell key={e.name} fill={e.color} stroke="white" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>
      </motion.div>
    </motion.div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
const IntelligenceDashboard = () => {
  const [activeTab, setActiveTab] = useState('alerts');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alertsData, setAlertsData] = useState(null);
  const [grievancesData, setGrievancesData] = useState(null);
  const [profilesData, setProfilesData] = useState(null);
  const [exportingReport, setExportingReport] = useState(false);

  const activeTabMeta = useMemo(() => TABS.find(t => t.key === activeTab) || TABS[0], [activeTab]);

  const fetchData = useCallback(async (tab) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;

      const targetTab = tab || activeTab;
      const response = await api.get(`/intelligence/${targetTab}`, { params });

      switch (targetTab) {
        case 'alerts': setAlertsData(response.data); break;
        case 'grievances': setGrievancesData(response.data); break;
        case 'profiles': setProfilesData(response.data); break;
      }
    } catch (err) {
      setError(`Failed to load ${tab || activeTab} intelligence. Please try again.`);
    } finally {
      setLoading(false);
    }
  }, [activeTab, dateFrom, dateTo]);

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyDateRange = () => {
    if (!dateFrom || !dateTo) return;
    fetchData(activeTab);
  };

  const handleClearDateRange = () => {
    setDateFrom('');
    setDateTo('');
    // Re-fetch with no custom range
    setTimeout(() => fetchData(activeTab), 0);
  };

  const handleTabChange = (key) => {
    setActiveTab(key);
  };

  const currentData = activeTab === 'alerts' ? alertsData : activeTab === 'grievances' ? grievancesData : profilesData;

  const handleDownloadReport = async (format) => {
    if (!currentData) {
      toast.error('No data loaded yet — wait for the tab to finish loading.');
      return;
    }
    const model = buildReportModel(activeTab, currentData, dateFrom, dateTo);
    if (!model) return;
    setExportingReport(true);
    try {
      if (format === 'pdf') {
        exportReportPDF(model);
      } else {
        exportReportExcel(model);
      }
      toast.success(`${activeTabMeta.label} report downloaded (${format.toUpperCase()})`);
    } catch (err) {
      toast.error('Failed to generate report');
    } finally {
      setExportingReport(false);
    }
  };

  const generatedAt = currentData?.generatedAt ? new Date(currentData.generatedAt).toLocaleString() : '--';

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100 p-4 md:p-6">
      {/* Background decorations */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-28 bottom-10 h-80 w-80 rounded-full bg-violet-200/40 blur-3xl" />

      <div className="relative mx-auto max-w-[1600px] space-y-5">

        {/* ══════════ HEADER ══════════ */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1">
              <BarChart3 className="h-3.5 w-3.5 text-violet-600" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-violet-700">Intelligence Center</span>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
              Unified Reports Intelligence
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Comprehensive analytics across Alerts, Grievances & Profiles
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Date Range */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-slate-400"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-slate-400"
              />
              <Button size="sm" variant="outline" onClick={handleApplyDateRange} className="h-7 px-2 text-xs">Apply</Button>
              <Button size="sm" variant="ghost" onClick={handleClearDateRange} className="h-7 px-2 text-xs">Clear</Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchData(activeTab)} disabled={loading} className="gap-2 rounded-xl border-slate-200">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {/* Profile summary export — Alerts/Grievances tabs have their own row-level PDF/Excel buttons below */}
            {activeTab === 'profiles' && (
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={exportingReport || loading || !currentData}
                  onClick={() => handleDownloadReport('pdf')}
                  className="h-7 gap-1.5 rounded-lg px-2 text-xs"
                  title={`Download ${activeTabMeta.label} as PDF`}
                >
                  <Download className="h-3.5 w-3.5" /> PDF
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={exportingReport || loading || !currentData}
                  onClick={() => handleDownloadReport('excel')}
                  className="h-7 gap-1.5 rounded-lg px-2 text-xs"
                  title={`Download ${activeTabMeta.label} as Excel`}
                >
                  <Download className="h-3.5 w-3.5" /> Excel
                </Button>
              </div>
            )}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[11px] text-slate-500">{generatedAt}</span>
            </div>
          </div>
        </motion.div>

        {/* ══════════ TAB NAVIGATION ══════════ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
        >
          <div className="flex gap-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabChange(tab.key)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all',
                    isActive
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.key === 'alerts' ? 'Alerts' : tab.key === 'grievances' ? 'Grievances' : 'Profiles'}</span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* ══════════ ERROR BANNER ══════════ */}
        {error && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => fetchData(activeTab)}>Retry</Button>
            </div>
          </div>
        )}

        {/* ══════════ LOADING SKELETON ══════════ */}
        {loading && !currentData && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="animate-pulse space-y-5">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-32 rounded-2xl bg-slate-100" />
                ))}
              </div>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-8 h-80 rounded-2xl bg-slate-100" />
                <div className="col-span-4 h-80 rounded-2xl bg-slate-100" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-64 rounded-2xl bg-slate-100" />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════ TAB CONTENT ══════════ */}
        {activeTab === 'alerts' && <AlertsIntelligence data={alertsData} dateFrom={dateFrom} dateTo={dateTo} />}
        {activeTab === 'grievances' && <GrievancesIntelligence data={grievancesData} dateFrom={dateFrom} dateTo={dateTo} />}
        {activeTab === 'profiles' && <ProfilesIntelligence data={profilesData} />}

      </div>
    </div>
  );
};

export default IntelligenceDashboard;
