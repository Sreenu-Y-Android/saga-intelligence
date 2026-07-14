import React, { useState, useEffect } from 'react';
import { Users, Loader2, Search, X, ChevronRight, Info, Network, UserPlus, Check, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import api from '../lib/api';
import { toast } from 'sonner';
import { RetweetTree } from './RetweetTree';
import { FREQ_ROW_COLORS, FREQ_BADGE_STYLES, FREQ_LEGEND, FREQUENCY_LABELS } from './engagerFrequency';

export const FrequencyBadge = ({ frequency }) => {
    const style = FREQ_BADGE_STYLES[frequency] || FREQ_BADGE_STYLES['one-time'];
    const label = FREQUENCY_LABELS[frequency] || 'One-time';
    return <Badge variant="outline" className={style}>{label}</Badge>;
};

/**
 * Frequent Engagers — who repeatedly retweets a handle's posts.
 * List screen: every analyzed account (+ a cross-account Top Engagers
 * ranking). Detail screen (click a completed account): a radial network map
 * of its top 8 engagers alongside the full, searchable, frequency-colored
 * engager table. Analyses are queued automatically in the background
 * (POST /engager/engager-analysis-auto-queue, hourly) for every monitored X
 * handle — this dialog is for reviewing results and manually re-triggering,
 * not the primary way analyses get started.
 */
export const FrequentEngagersDialog = ({ open, onOpenChange, onAddSource, monitoredHandles = [] }) => {
    const [analyses, setAnalyses] = useState([]);
    const [topEngagers, setTopEngagers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [mainTab, setMainTab] = useState('top'); // 'top' | 'accounts'
    const [selectedHandle, setSelectedHandle] = useState(null);
    const [selectedAnalysis, setSelectedAnalysis] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [engagerPage, setEngagerPage] = useState(1);
    const [retweetSearch, setRetweetSearch] = useState('');
    const [listSearch, setListSearch] = useState('');
    const [listPage, setListPage] = useState(1);
    const [showFailedAccounts, setShowFailedAccounts] = useState(false);
    const [topSearch, setTopSearch] = useState('');
    const [topPage, setTopPage] = useState(1);
    const LIST_PAGE_SIZE = 20;
    const TOP_PAGE_SIZE = 25;
    const PAGE_SIZE = 20;

    const isMonitored = (handle) => {
        if (!handle || !Array.isArray(monitoredHandles) || monitoredHandles.length === 0) return false;
        const clean = String(handle).replace(/^@/, '').toLowerCase().trim();
        return monitoredHandles.some(h => h && String(h).replace(/^@/, '').toLowerCase().trim() === clean);
    };

    const handleAddSource = (rt) => {
        if (!onAddSource) return;
        onAddSource({ platform: 'x', identifier: rt.handle, display_name: rt.name || rt.handle, category: 'unknown' });
    };

    const retriggerAnalysis = async (handle) => {
        try {
            const res = await api.post('/engager/engager-analysis', { handle, period_days: 30 });
            const status = res.data?.status;
            if (status === 'already_processing') {
                toast.warning(`Analysis for @${handle} is already in progress.`);
                return;
            }
            if (status === 'blocked') {
                toast.warning(`Another analysis (@${res.data?.blocked_by}) is still processing. Please wait.`);
                return;
            }
            toast.success(`Re-analysis started for @${handle}`);
            setAnalyses(prev => prev.map(a => a.handle?.toLowerCase() === handle.toLowerCase() ? { ...a, status: 'processing', error: null, analyzed_at: new Date().toISOString() } : a));
        } catch {
            toast.error('Failed to start analysis');
        }
    };

    const loadAnalyses = async ({ silent = false } = {}) => {
        if (silent) setRefreshing(true);
        else setLoading(true);
        try {
            const [allRes, topRes] = await Promise.allSettled([
                api.get('/engager/engager-analysis-all'),
                api.get('/engager/engager-top')
            ]);
            if (allRes.status === 'fulfilled') {
                setAnalyses(allRes.value.data?.analyses || []);
            } else if (!silent) {
                console.error('[FrequentEngagers] Failed to load analyses:', allRes.reason);
                setAnalyses([]);
            }
            if (topRes.status === 'fulfilled') {
                setTopEngagers(topRes.value.data?.engagers || []);
            } else if (!silent) {
                console.error('[FrequentEngagers] Failed to load top engagers:', topRes.reason);
                setTopEngagers([]);
                toast.error(topRes.reason?.response?.data?.message || 'Failed to load top engagers');
            }
        } catch {
            if (!silent) {
                setAnalyses([]);
                setTopEngagers([]);
            }
        } finally {
            if (silent) setRefreshing(false);
            else setLoading(false);
        }
    };

    const openDetail = async (handle) => {
        setSelectedHandle(handle);
        setDetailLoading(true);
        setEngagerPage(1);
        setRetweetSearch('');
        try {
            const res = await api.get('/engager/engager-analysis/latest', { params: { handle } });
            setSelectedAnalysis(res.data);
        } catch {
            setSelectedAnalysis(null);
        } finally { setDetailLoading(false); }
    };

    const goBack = () => {
        setSelectedHandle(null);
        setSelectedAnalysis(null);
        loadAnalyses();
    };

    useEffect(() => {
        if (open) {
            loadAnalyses();
            setSelectedHandle(null);
            setSelectedAnalysis(null);
            setListSearch('');
            setListPage(1);
            setShowFailedAccounts(false);
            setTopSearch('');
            setTopPage(1);
            setMainTab('top');
        }
    }, [open]);

    // Auto-poll every 5s while any analysis is processing
    useEffect(() => {
        if (!open || selectedHandle) return;
        const hasProcessing = analyses.some(a => a.status === 'processing');
        if (!hasProcessing) return;
        const iv = setInterval(() => loadAnalyses({ silent: true }), 5000);
        return () => clearInterval(iv);
    }, [open, selectedHandle, analyses]);

    const analysis = selectedAnalysis;
    const engagers = analysis?.engagers || [];
    const sourceLabel = analysis?.display_name || selectedHandle || '';
    const sourceAvatar = analysis?.avatar || null;
    const searchTerm = retweetSearch.trim().toLowerCase();
    const filteredEngagers = searchTerm
        ? engagers.filter(e => (e.handle || '').toLowerCase().includes(searchTerm) || (e.name || '').toLowerCase().includes(searchTerm))
        : engagers;

    const listSearchTerm = listSearch.trim().toLowerCase();
    const visibleAnalyses = showFailedAccounts
        ? analyses
        : analyses.filter(a => a.status !== 'failed');
    const failedAnalysesCount = analyses.filter(a => a.status === 'failed').length;
    const filteredAnalyses = listSearchTerm
        ? visibleAnalyses.filter(a => (a.handle || '').toLowerCase().includes(listSearchTerm) || (a.display_name || '').toLowerCase().includes(listSearchTerm))
        : visibleAnalyses;
    const listTotalPages = Math.max(1, Math.ceil(filteredAnalyses.length / LIST_PAGE_SIZE));
    const pagedAnalyses = filteredAnalyses.slice((listPage - 1) * LIST_PAGE_SIZE, listPage * LIST_PAGE_SIZE);

    const topSearchTerm = topSearch.trim().toLowerCase();
    const filteredTop = topSearchTerm
        ? topEngagers.filter(e => (e.handle || '').toLowerCase().includes(topSearchTerm) || (e.name || '').toLowerCase().includes(topSearchTerm))
        : topEngagers;
    const topTotalPages = Math.max(1, Math.ceil(filteredTop.length / TOP_PAGE_SIZE));
    const pagedTop = filteredTop.slice((topPage - 1) * TOP_PAGE_SIZE, topPage * TOP_PAGE_SIZE);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[65vw] w-[65vw] max-h-[82vh] p-0 gap-0 overflow-hidden">
                <DialogHeader className="sr-only">
                    <DialogTitle>Frequent Engagers</DialogTitle>
                    <DialogDescription>
                        Review top engagers and account-level engagement analysis for monitored X handles.
                    </DialogDescription>
                </DialogHeader>
                {!selectedHandle ? (
                    <>
                        <div className="px-5 pt-4 pb-3 border-b border-border">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-sm font-semibold">Frequent Engagers</h2>
                                    <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                        <span>All X engagers ranked by total engagement · auto-updated hourly</span>
                                        {refreshing && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                                    </p>
                                </div>
                                <div className="relative w-52">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                    <input type="text" placeholder={mainTab === 'top' ? 'Search engagers…' : 'Search accounts…'}
                                        value={mainTab === 'top' ? topSearch : listSearch}
                                        onChange={(e) => { if (mainTab === 'top') { setTopSearch(e.target.value); setTopPage(1); } else { setListSearch(e.target.value); setListPage(1); } }}
                                        className="w-full pl-6 pr-6 py-1 text-[11px] rounded border bg-background placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                    {(mainTab === 'top' ? topSearch : listSearch) && (
                                        <button onClick={() => { if (mainTab === 'top') { setTopSearch(''); setTopPage(1); } else { setListSearch(''); setListPage(1); } }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {/* Tabs */}
                            <div className="flex gap-1 mt-3">
                                <button onClick={() => setMainTab('top')} className={`text-[11px] font-medium px-3 py-1 rounded-md transition-colors ${mainTab === 'top' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
                                    Top Engagers {topEngagers.length > 0 && <span className="ml-1 opacity-70">({topEngagers.length})</span>}
                                </button>
                                <button onClick={() => setMainTab('accounts')} className={`text-[11px] font-medium px-3 py-1 rounded-md transition-colors ${mainTab === 'accounts' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
                                    Accounts {visibleAnalyses.length > 0 && <span className="ml-1 opacity-70">({visibleAnalyses.length})</span>}
                                </button>
                            </div>
                        </div>
                        <ScrollArea className="flex-1" style={{ maxHeight: 'calc(82vh - 100px)' }}>
                            <div className="p-4">
                                {loading ? (
                                    <div className="h-48 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
                                ) : mainTab === 'top' ? (
                                    /* ── Top Engagers combined view ── */
                                    topEngagers.length === 0 ? (
                                        <div className="h-48 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                            <Users className="h-10 w-10 opacity-25" />
                                            <p className="text-sm">No engager data yet</p>
                                            <p className="text-xs text-center text-muted-foreground">Analysis runs automatically every hour for all monitored X handles.</p>
                                        </div>
                                    ) : (
                                        <>
                                        <div className="border rounded-lg overflow-hidden">
                                            <table className="w-full text-xs">
                                                <thead className="bg-muted/50">
                                                    <tr>
                                                        <th className="text-left px-3 py-2 font-semibold w-8">#</th>
                                                        <th className="text-left px-3 py-2 font-semibold">Engager</th>
                                                        <th className="text-center px-3 py-2 font-semibold">Total Engagements</th>
                                                        <th className="text-center px-3 py-2 font-semibold">Accounts Engaged</th>
                                                        <th className="text-center px-3 py-2 font-semibold">Type</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pagedTop.map((e, idx) => {
                                                        const rank = (topPage - 1) * TOP_PAGE_SIZE + idx + 1;
                                                        return (
                                                            <tr key={e.handle} className="border-t hover:bg-accent/30 transition-colors">
                                                                <td className="px-3 py-2 text-muted-foreground font-medium">{rank}</td>
                                                                <td className="px-3 py-2">
                                                                    <div className="flex items-center gap-2">
                                                                        {e.avatar ? (
                                                                            <img src={e.avatar} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                                                                        ) : (
                                                                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">
                                                                                {(e.handle || '?')[0].toUpperCase()}
                                                                            </div>
                                                                        )}
                                                                        <div>
                                                                            <span className="font-medium">@{e.handle}</span>
                                                                            {e.name && e.name !== e.handle && <span className="text-[10px] text-muted-foreground ml-1.5">{e.name}</span>}
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-2 text-center font-bold">{e.total_engagements}</td>
                                                                <td className="px-3 py-2 text-center text-muted-foreground">{e.accounts_engaged_count}</td>
                                                                <td className="px-3 py-2 text-center">
                                                                    <FrequencyBadge frequency={e.top_frequency} />
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        {topTotalPages > 1 && (
                                            <div className="flex items-center justify-between pt-3">
                                                <span className="text-[9px] text-muted-foreground">{filteredTop.length} engager{filteredTop.length !== 1 ? 's' : ''} · Page {topPage}/{topTotalPages}</span>
                                                <div className="flex gap-1">
                                                    <Button size="sm" variant="outline" className="h-6 text-[9px] px-2" disabled={topPage <= 1} onClick={() => setTopPage(p => p - 1)}>Prev</Button>
                                                    <Button size="sm" variant="outline" className="h-6 text-[9px] px-2" disabled={topPage >= topTotalPages} onClick={() => setTopPage(p => p + 1)}>Next</Button>
                                                </div>
                                            </div>
                                        )}
                                        {topSearchTerm && filteredTop.length === 0 && (
                                            <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">No engagers match "{topSearch}"</div>
                                        )}
                                        </>
                                    )
                                ) : (
                                    /* ── Accounts tab ── */
                                    visibleAnalyses.length === 0 ? (
                                        <div className="h-48 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                            <Users className="h-10 w-10 opacity-25" />
                                            <p className="text-sm">{failedAnalysesCount > 0 && !showFailedAccounts ? 'No visible analyses' : 'No analyses yet'}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {failedAnalysesCount > 0 && !showFailedAccounts
                                                    ? `All currently hidden rows are failed analyses. Use "Show failed (${failedAnalysesCount})" to review them.`
                                                    : 'Analysis runs automatically for monitored X handles.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <div className="text-[10px] text-muted-foreground">
                                                Showing completed and in-progress monitored X accounts first.
                                            </div>
                                            {failedAnalysesCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setShowFailedAccounts(v => !v); setListPage(1); }}
                                                    className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    {showFailedAccounts ? 'Hide' : 'Show'} failed ({failedAnalysesCount})
                                                </button>
                                            )}
                                        </div>
                                        <div className="border rounded-lg overflow-hidden">
                                            <table className="w-full text-xs">
                                                <thead className="bg-muted/50">
                                                    <tr>
                                                        <th className="text-left px-3 py-2 font-semibold">Account</th>
                                                        <th className="text-center px-3 py-2 font-semibold">Status</th>
                                                        <th className="text-center px-3 py-2 font-semibold">Tweets</th>
                                                        <th className="text-center px-3 py-2 font-semibold">Engagers</th>
                                                        <th className="text-center px-3 py-2 font-semibold">Last Analyzed</th>
                                                        <th className="text-center px-3 py-2 font-semibold w-16"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pagedAnalyses.map(a => (
                                                        <tr key={a.id || a.handle_lower}
                                                            className={`border-t transition-colors ${a.status === 'completed' ? 'cursor-pointer hover:bg-accent/50' : ''} ${a.status === 'processing' ? 'bg-yellow-50 dark:bg-yellow-950/10' : a.status === 'failed' ? 'bg-red-50/50 dark:bg-red-950/5' : ''}`}
                                                            onClick={() => a.status === 'completed' ? openDetail(a.handle) : null}
                                                        >
                                                            <td className="px-3 py-2">
                                                                <div className="flex items-center gap-2">
                                                                    {a.avatar ? (
                                                                        <img src={a.avatar} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                                                                    ) : (
                                                                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">
                                                                            {(a.display_name || a.handle || '?')[0].toUpperCase()}
                                                                        </div>
                                                                    )}
                                                                    <div>
                                                                        <span className="font-medium">@{a.handle}</span>
                                                                        {a.display_name && a.display_name !== a.handle && <span className="text-[10px] text-muted-foreground ml-1.5">{a.display_name}</span>}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                                                    a.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400' :
                                                                    a.status === 'processing' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400' :
                                                                    a.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400' :
                                                                    'bg-gray-100 text-gray-600'
                                                                }`}>
                                                                    {a.status === 'processing' && <Loader2 className="h-2.5 w-2.5 animate-spin inline mr-0.5" />}
                                                                    {a.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-center font-medium">{a.tweets_analyzed || '-'}</td>
                                                            <td className="px-3 py-2 text-center font-medium">{a.unique_retweeters || '-'}</td>
                                                            <td className="px-3 py-2 text-center text-muted-foreground">
                                                                {a.analyzed_at ? format(new Date(a.analyzed_at), 'MMM d, h:mm a') : '-'}
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                {a.status === 'failed' && (
                                                                    <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5" onClick={(e) => { e.stopPropagation(); retriggerAnalysis(a.handle); }}>
                                                                        Retry
                                                                    </Button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {listTotalPages > 1 && (
                                            <div className="flex items-center justify-between pt-3">
                                                <span className="text-[9px] text-muted-foreground">{filteredAnalyses.length} account{filteredAnalyses.length !== 1 ? 's' : ''} · Page {listPage}/{listTotalPages}</span>
                                                <div className="flex gap-1">
                                                    <Button size="sm" variant="outline" className="h-6 text-[9px] px-2" disabled={listPage <= 1} onClick={() => setListPage(p => p - 1)}>Prev</Button>
                                                    <Button size="sm" variant="outline" className="h-6 text-[9px] px-2" disabled={listPage >= listTotalPages} onClick={() => setListPage(p => p + 1)}>Next</Button>
                                                </div>
                                            </div>
                                        )}
                                        {listSearchTerm && filteredAnalyses.length === 0 && (
                                            <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">No accounts match "{listSearch}"</div>
                                        )}
                                        </>
                                    )
                                )}
                            </div>
                        </ScrollArea>
                    </>
                ) : (
                    <>
                        <div className="px-5 pt-4 pb-3 border-b border-border">
                            <div className="flex items-center gap-3">
                                <button onClick={goBack} className="text-muted-foreground hover:text-foreground transition-colors">
                                    <ChevronRight className="h-4 w-4 rotate-180" />
                                </button>
                                <div className="flex items-center gap-2 min-w-0">
                                    {sourceAvatar ? (
                                        <img src={sourceAvatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                                    ) : (
                                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                                            <Users className="h-4 w-4 text-white" />
                                        </div>
                                    )}
                                    <div>
                                        <h2 className="text-sm font-semibold">@{selectedHandle}</h2>
                                        {analysis && <p className="text-[10px] text-muted-foreground">{analysis.tweets_analyzed} tweets · {analysis.unique_retweeters} engagers · {analysis.period_days}-day window</p>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {detailLoading ? (
                            <div className="h-64 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
                        ) : !analysis ? (
                            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No completed analysis found.</div>
                        ) : (
                            <div className="flex flex-col lg:flex-row overflow-hidden" style={{ height: 'calc(82vh - 100px)' }}>
                                {/* LEFT — Network Map */}
                                <div className="lg:w-[45%] w-full shrink-0 border-b lg:border-b-0 lg:border-r border-border flex flex-col">
                                    <div className="px-4 py-2 border-b border-border bg-muted/10 shrink-0">
                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                                            <Network className="h-3.5 w-3.5" /> Network Map
                                        </div>
                                    </div>
                                    <div className="flex-1 flex items-center justify-center p-3">
                                        <RetweetTree
                                            sourceHandle={selectedHandle}
                                            sourceName={sourceLabel}
                                            sourceAvatar={sourceAvatar}
                                            topRetweeters={engagers.slice(0, 8).map(e => ({ ...e, tweet_count: e.tweets_retweeted }))}
                                            totalRetweeters={analysis.unique_retweeters || 0}
                                            onNodeClick={handleAddSource}
                                            isMonitored={isMonitored}
                                        />
                                    </div>
                                    <div className="flex items-start gap-2 px-3 py-2 border-t border-border bg-muted/10 shrink-0">
                                        <Info className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
                                        <p className="text-[9px] text-muted-foreground leading-relaxed">
                                            Click any node to <strong>add them as a monitoring source</strong>.
                                        </p>
                                    </div>
                                </div>

                                {/* RIGHT — Engager Table */}
                                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                                    <div className="px-3 pt-2 pb-0 shrink-0 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <div className="flex border-b border-border">
                                                <div className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border-b-2 border-primary text-primary -mb-px">
                                                    <Users className="h-3 w-3" /> All Engagers
                                                    <span className="ml-0.5 text-[9px] px-1 py-0.5 rounded-full font-bold bg-primary/10 text-primary">{analysis.unique_retweeters}</span>
                                                </div>
                                            </div>
                                            <div className="flex-1" />
                                            <div className="relative w-48">
                                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                                <input type="text" placeholder="Search…" value={retweetSearch}
                                                    onChange={(e) => { setRetweetSearch(e.target.value); setEngagerPage(1); }}
                                                    className="w-full pl-6 pr-6 py-1 text-[11px] rounded border bg-background placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                                                />
                                                {retweetSearch && (
                                                    <button onClick={() => { setRetweetSearch(''); setEngagerPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {searchTerm && <div className="text-[9px] text-muted-foreground">{filteredEngagers.length} result{filteredEngagers.length !== 1 ? 's' : ''}</div>}
                                    </div>

                                    <ScrollArea className="flex-1">
                                        <div className="px-3 py-2">
                                            {(() => {
                                                const totalPages = Math.ceil(filteredEngagers.length / PAGE_SIZE);
                                                const paged = filteredEngagers.slice((engagerPage - 1) * PAGE_SIZE, engagerPage * PAGE_SIZE);
                                                return (
                                                <div className="space-y-2">
                                                    {filteredEngagers.length === 0 ? (
                                                        <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
                                                            {searchTerm ? 'No engagers match your search.' : 'No retweeters found.'}
                                                        </div>
                                                    ) : (<>
                                                        <div className="border rounded-lg overflow-hidden">
                                                            <table className="w-full table-fixed text-[11px]">
                                                                <colgroup>
                                                                    <col style={{ width: '55%' }} />
                                                                    <col style={{ width: '25%' }} />
                                                                    <col style={{ width: '20%' }} />
                                                                </colgroup>
                                                                <thead className="bg-muted/50">
                                                                    <tr>
                                                                        <th className="text-left px-2 py-1.5 font-semibold">Engager</th>
                                                                        <th className="text-center px-2 py-1.5 font-semibold">Retweeted</th>
                                                                        <th className="text-center px-2 py-1.5 font-semibold">Monitor</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {paged.map((rt) => {
                                                                        const already = isMonitored(rt.handle);
                                                                        const freq = rt.frequency || 'one-time';
                                                                        return (
                                                                            <tr key={rt.handle} className={`border-t transition-colors ${FREQ_ROW_COLORS[freq] || ''}`}>
                                                                                <td className="px-2 py-1.5 align-middle">
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        {rt.avatar ? (
                                                                                            <img src={rt.avatar} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
                                                                                        ) : (
                                                                                            <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[8px] font-bold shrink-0">
                                                                                                {(rt.name || rt.handle || '?')[0].toUpperCase()}
                                                                                            </div>
                                                                                        )}
                                                                                        <div className="flex flex-col min-w-0">
                                                                                            <a href={`https://x.com/${rt.handle}`} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline text-[11px] break-all leading-tight">@{rt.handle}</a>
                                                                                            {rt.name && rt.name !== rt.handle && <span className="text-[9px] text-muted-foreground leading-tight truncate">{rt.name}</span>}
                                                                                        </div>
                                                                                        {rt.verified && <CheckCircle2 className="h-2.5 w-2.5 text-blue-500 shrink-0" />}
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-2 py-1.5 text-center align-middle">
                                                                                    <span className="font-bold">{rt.tweets_retweeted}</span>
                                                                                    <span className="text-[9px] text-muted-foreground"> / {analysis.tweets_analyzed}</span>
                                                                                </td>
                                                                                <td className="px-2 py-1.5 text-center align-middle">
                                                                                    {onAddSource && !already ? (
                                                                                        <Button size="sm" variant="outline" className="h-5 gap-0.5 text-[9px] px-1.5 border-green-300 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20 dark:text-green-400 dark:border-green-800" onClick={() => handleAddSource(rt)}>
                                                                                            <UserPlus className="h-2.5 w-2.5" /> Add
                                                                                        </Button>
                                                                                    ) : already ? (
                                                                                        <span className="inline-flex items-center gap-0.5 text-[9px] text-green-600 font-medium"><Check className="h-2.5 w-2.5" /> Monitored</span>
                                                                                    ) : null}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                        {totalPages > 1 && (
                                                            <div className="flex items-center justify-between pt-1">
                                                                <span className="text-[9px] text-muted-foreground">{filteredEngagers.length} total · Page {engagerPage}/{totalPages}</span>
                                                                <div className="flex gap-1">
                                                                    <Button size="sm" variant="outline" className="h-6 text-[9px] px-2" disabled={engagerPage <= 1} onClick={() => setEngagerPage(p => p - 1)}>Prev</Button>
                                                                    <Button size="sm" variant="outline" className="h-6 text-[9px] px-2" disabled={engagerPage >= totalPages} onClick={() => setEngagerPage(p => p + 1)}>Next</Button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>)}
                                                </div>
                                                );
                                            })()}
                                        </div>
                                    </ScrollArea>

                                    <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border bg-muted/10 shrink-0 flex-wrap">
                                        {FREQ_LEGEND.map(f => (
                                            <div key={f.key} className="flex items-center gap-1">
                                                <div className={`w-2.5 h-2.5 rounded-sm ${f.color}`} />
                                                <span className="text-[9px] text-muted-foreground">{f.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default FrequentEngagersDialog;
