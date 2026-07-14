import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import api from '../lib/api';
import { AlertTriangle, CheckCircle, Flag, XCircle, Zap, Activity, MessageSquare, Filter, ExternalLink, Search, Calendar, Download, Loader2, ArrowUpCircle, Plus, LayoutGrid, LayoutList, Users } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { TwitterAlertCard, YoutubeAlertCard } from '../components/AlertCards';
import { FrequentEngagersDialog } from '../components/FrequentEngagersDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar as CalendarComponent } from '../components/ui/calendar';
import { format } from 'date-fns';
import ReportsContent from '../components/ReportsContent';
import AddSourceModal from '../components/AddSourceModal';
import { useRbac } from '../contexts/RbacContext';

const ALERT_STATUS_TABS = [
  { value: 'active', label: 'Active' },
];

const ENGAGER_AUTO_QUEUE_TRIGGER_KEY = 'engagerAutoQueueLastTriggerAt';
const ENGAGER_AUTO_QUEUE_TRIGGER_TTL = 60 * 60 * 1000; // 1 hour

const DATE_FILTER_MAX_RANGE_DAYS = 90;
const getDateFilterBounds = () => {
  const today = new Date();
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() - DATE_FILTER_MAX_RANGE_DAYS);
  return { fromDate: earliest, toDate: today };
};

const Alerts = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const isFirstLoadRef = useRef(true);
  const [activeTab, setActiveTab] = useState('active'); // Always start on Active tab
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const [monitoredHandles, setMonitoredHandles] = useState([]);
  const [viewMode, setViewMode] = useState('grid');
  const [alertCategory, setAlertCategory] = useState('all'); // 'all', 'risk', 'viral', 'new_post'
  const [totalResults, setTotalResults] = useState(0);
  const [alertStats, setAlertStats] = useState(null);
  const [downloadStates, setDownloadStates] = useState({});
  const [newAlertCount, setNewAlertCount] = useState(0); // Count of new alerts since last scroll-to-top
  const scrollAnchorRef = useRef({ shouldRestore: false, prevHeight: 0, prevScroll: 0 });

  const ALERTS_CACHE_KEY = 'alertsCache_v1';
  const ALERTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Search & Pagination States
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [keywordFilter, setKeywordFilter] = useState('all');
  const [availableKeywords, setAvailableKeywords] = useState([]);
  const [sourceCategoryFilter, setSourceCategoryFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const { fromDate: dateFilterFromDate, toDate: dateFilterToDate } = useMemo(() => getDateFilterBounds(), []);
  const [instagramContentFilter, setInstagramContentFilter] = useState('all_posts_reels');
  const [instagramStoriesStatusFilter, setInstagramStoriesStatusFilter] = useState('all');
  const [capturedStories, setCapturedStories] = useState([]);
  const [capturedStoriesLoading, setCapturedStoriesLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState(null);
  const observerTarget = useRef(null);
  const isFetchingRef = useRef(false);
  const lastFetchKeyRef = useRef('');
  const fetchAbortRef = useRef(null);
  const fetchRequestSeqRef = useRef(0);

  // Link Investigation States
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [investigatedAlerts, setInvestigatedAlerts] = useState([]);

  const { markAllRead } = useNotification();
  const { hasFeatureAccess } = useRbac();

  const visibleStatusTabs = useMemo(
    () => ALERT_STATUS_TABS.filter((tab) => hasFeatureAccess('/alerts', tab.value)),
    [hasFeatureAccess]
  );
  const hasAnyAlertFeature = visibleStatusTabs.length > 0;
  const isCapturedStoriesView = platformFilter === 'instagram' && instagramContentFilter === 'captured_stories';

  const SOURCE_CATEGORY_OPTIONS = [
    { value: 'political', label: 'Political' },
    { value: 'communal', label: 'Communal' },
    { value: 'trouble_makers', label: 'Trouble Makers' },
    { value: 'defamation', label: 'Defamation' },
    { value: 'narcotics', label: 'Narcotics' },
    { value: 'history_sheeters', label: 'History Sheeters' },
    { value: 'others', label: 'Others' }
  ];

  const buildCacheKey = useCallback(() => {
    return [
      'tab', activeTab,
      'cat', alertCategory,
      'q', debouncedSearchQuery || '',
      'platform', platformFilter,
      'keyword', keywordFilter,
      'sourceCat', sourceCategoryFilter,
      'start', dateRange.start || '',
      'end', dateRange.end || '',
      'igContent', instagramContentFilter,
      'igStories', instagramStoriesStatusFilter
    ].join('|');
  }, [activeTab, alertCategory, debouncedSearchQuery, platformFilter, keywordFilter, sourceCategoryFilter, dateRange.start, dateRange.end, instagramContentFilter, instagramStoriesStatusFilter]);

  const readCache = useCallback((key) => {
    try {
      const raw = localStorage.getItem(ALERTS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const entry = parsed?.[key];
      if (!entry?.ts || !entry?.data) return null;
      if (Date.now() - entry.ts > ALERTS_CACHE_TTL) return null;
      return entry.data;
    } catch (error) {
      console.error('Failed to read alerts cache:', error);
      return null;
    }
  }, []);

  const writeCache = useCallback((key, data) => {
    try {
      const raw = localStorage.getItem(ALERTS_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[key] = { ts: Date.now(), data };
      localStorage.setItem(ALERTS_CACHE_KEY, JSON.stringify(parsed));
    } catch (error) {
      console.error('Failed to write alerts cache:', error);
    }
  }, []);

  // Read status from URL query params (e.g., /alerts?status=acknowledged)
  useEffect(() => {
    const statusParam = searchParams.get('status');
    const searchParam = searchParams.get('search');
    const platformParam = searchParams.get('platform');
    const categoryParam = searchParams.get('category');

    if (statusParam && ALERT_STATUS_TABS.some((tab) => tab.value === statusParam)) {
      setActiveTab(statusParam);
    }

    if (platformParam) {
      setPlatformFilter(platformParam);
    }

    if (categoryParam) {
      setAlertCategory(categoryParam);
    }

    // Only populate search query if EXPLICITLY provided via 'search' param
    if (searchParam) {
      setSearchQuery(searchParam);
      setDebouncedSearchQuery(searchParam);
    }
    // Note: 'handle' param is handled separately within ReportsContent
  }, [searchParams]);

  useEffect(() => {
    if (!hasAnyAlertFeature) return;
    const allowedValues = visibleStatusTabs.map((tab) => tab.value);
    if (!allowedValues.includes(activeTab)) {
      setActiveTab(allowedValues[0]);
    }
  }, [activeTab, hasAnyAlertFeature, visibleStatusTabs]);

  // Helper to clear handle param from URL
  const clearHandleParam = () => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.delete('handle');
      return newParams;
    });
  };

  const updateDownloadState = (id, updates) => {
    setDownloadStates((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        ...updates
      }
    }));
  };

  // Map to store reports by alert_id for quick lookup
  const [reportsMap, setReportsMap] = useState({});

  // Add Source Modal States
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [showEngagersDialog, setShowEngagersDialog] = useState(false);
  const [initialSourceData, setInitialSourceData] = useState(null);

  // Fetch reports for escalated alerts to show report status
  const fetchReportsForAlerts = useCallback(async (alertsList) => {
    const escalatedAlertIds = alertsList
      .filter(a => a.status === 'escalated')
      .map(a => a.id);

    if (escalatedAlertIds.length === 0) return;

    try {
      const response = await api.get('/reports');
      const reports = response.data.data || response.data || [];

      // Create a map of alert_id -> report, but ONLY for alerts currently on screen
      const newReportsMap = {};
      reports.forEach(report => {
        // Only include reports that match current escalated alerts
        if (report.alert_id && escalatedAlertIds.includes(report.alert_id)) {
          newReportsMap[report.alert_id] = report;
        }
      });
      setReportsMap(newReportsMap); // Replace, don't merge, to avoid stale data
    } catch (error) {
      console.error('Failed to fetch reports for alerts:', error);
    }
  }, []);

  const handleDownloadMedia = async (alert, contentData) => {
    const mediaUrl = alert?.content_url || contentData?.url || contentData?.link;
    if (!mediaUrl) {
      updateDownloadState(alert.id, { error: 'No media URL available' });
      setTimeout(() => updateDownloadState(alert.id, { error: null }), 3000);
      return;
    }

    updateDownloadState(alert.id, {
      downloading: true,
      progress: 0,
      status: 'Initializing...',
      error: null
    });

    try {
      updateDownloadState(alert.id, { progress: 10, status: 'Fetching media info...' });

      const downloadPromise = api.post('/media/download', {
        media_url: mediaUrl,
        content_id: contentData?.id || alert.content_id
      });

      let progress = 10;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress < 85) {
          updateDownloadState(alert.id, { progress: Math.min(progress, 85) });
          if (progress < 30) updateDownloadState(alert.id, { status: 'Fetching media info...' });
          else if (progress < 50) updateDownloadState(alert.id, { status: 'Downloading media...' });
          else if (progress < 70) updateDownloadState(alert.id, { status: 'Processing...' });
          else updateDownloadState(alert.id, { status: 'Almost done...' });
        }
      }, 500);

      const response = await downloadPromise;
      clearInterval(progressInterval);

      updateDownloadState(alert.id, { progress: 100, status: 'Complete!' });

      if (response.data.download_url) {
        setTimeout(() => {
          window.open(response.data.download_url, '_blank');
          updateDownloadState(alert.id, { downloading: false, progress: 0, status: '' });
        }, 500);
      } else {
        updateDownloadState(alert.id, { downloading: false, progress: 0, status: '' });
      }
    } catch (error) {
      updateDownloadState(alert.id, {
        downloading: false,
        progress: 0,
        status: '',
        error: error.response?.data?.error || 'Download failed'
      });
      setTimeout(() => updateDownloadState(alert.id, { error: null }), 3000);
    }
  };

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
    setNextCursor(null);
    setHasMore(true);
    if (!hasAnyAlertFeature) return;
    if (activeTab === 'reports') return;
    const cacheKey = buildCacheKey();
    const cached = readCache(cacheKey);
    if (cached?.alerts?.length) {
      setAlerts(cached.alerts);
      setTotalResults(cached.totalResults || 0);
      setHasMore(cached.hasMore ?? true);
      setPage(cached.nextPage || 2);
      setNextCursor(cached.nextCursor || null);
      if (cached.alertStats) setAlertStats(cached.alertStats);
    }
  }, [activeTab, alertCategory, debouncedSearchQuery, platformFilter, keywordFilter, sourceCategoryFilter, dateRange, buildCacheKey, readCache, hasAnyAlertFeature]);

  useEffect(() => {
    if (platformFilter !== 'instagram') {
      setInstagramContentFilter('all_posts_reels');
      setInstagramStoriesStatusFilter('all');
    }
  }, [platformFilter]);

  useEffect(() => {
    if (instagramContentFilter !== 'stories_24h') {
      setInstagramStoriesStatusFilter('all');
    }
  }, [instagramContentFilter]);

  useEffect(() => {
    const fetchKeywords = async () => {
      try {
        const response = await api.get('/keywords');
        const kws = (response.data || [])
          .map(k => k.keyword)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        setAvailableKeywords(kws);
      } catch (error) {
        console.error(error);
      }
    };

    fetchKeywords();

    // Prefetch lightweight summary for instant tab counts
    api.get('/alerts/summary').then(res => {
      if (res.data && !alertStats) {
        setAlertStats(prev => prev || res.data);
      }
    }).catch(() => { });
  }, []);

  // Removed mapContentToAlert as it was only for content/feed fallback which is now unified
  // Removed fetchContentFeed as we now use /api/alerts for everything

  const fetchAlerts = useCallback(async (isLoadMore = false, cursorOverride = null) => {
    if (!hasAnyAlertFeature) {
      setAlerts([]);
      setHasMore(false);
      setLoading(false);
      setIsRefreshing(false);
      setIsFetchingMore(false);
      return;
    }
    const isCurrentTabAllowed = visibleStatusTabs.some((tab) => tab.value === activeTab);
    if (!isCurrentTabAllowed) {
      setLoading(false);
      setIsRefreshing(false);
      setIsFetchingMore(false);
      return;
    }
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setError(null);
    if (isFirstLoadRef.current && !isLoadMore) {
      setLoading(true);
    } else if (isLoadMore) {
      setIsFetchingMore(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const requestSeq = ++fetchRequestSeqRef.current;
      if (!isLoadMore && fetchAbortRef.current) {
        fetchAbortRef.current.abort();
      }
      const controller = new AbortController();
      if (!isLoadMore) fetchAbortRef.current = controller;

      const params = {
        page: 1,
        limit: 20,
        includeStats: !isLoadMore,
        status: activeTab !== 'reports' ? activeTab : 'active',
        search: debouncedSearchQuery || undefined,
        platform: platformFilter !== 'all' ? platformFilter : undefined,
        category: sourceCategoryFilter !== 'all' ? sourceCategoryFilter : undefined,
        startDate: dateRange.start || undefined,
        endDate: dateRange.end || undefined,
        keyword: keywordFilter !== 'all' ? keywordFilter : undefined
      };

      if (isLoadMore && (cursorOverride || nextCursor)) {
        params.cursor = cursorOverride || nextCursor;
      }

      if (alertCategory === 'viral') {
        params.alert_type = 'velocity';
      } else if (alertCategory === 'risk') {
        params.alert_type = 'risk';
      } else if (['high', 'medium', 'low', 'critical'].includes(alertCategory)) {
        params.risk_level = alertCategory;
      }

      const response = await api.get('/alerts', { params, signal: controller.signal });
      if (requestSeq !== fetchRequestSeqRef.current) return;

      const newAlerts = response.data.alerts || [];
      const pagination = response.data.pagination;
      setTotalResults(pagination.total || 0);
      if (response.data.stats) setAlertStats(response.data.stats);

      const uniqueNewAlerts = [];
      const seenIds = new Set();
      newAlerts.forEach(alert => {
        if (!seenIds.has(alert.id)) {
          seenIds.add(alert.id);
          uniqueNewAlerts.push(alert);
        }
      });

      if (isLoadMore) {
        setAlerts(prev => {
          const existingIds = new Set(prev.map(a => a.id));
          const trulyUnique = uniqueNewAlerts.filter(a => !existingIds.has(a.id));
          // If no new unique items, return same reference to avoid re-render loop
          if (trulyUnique.length === 0) return prev;
          return [...prev, ...trulyUnique];
        });
      } else {
        setAlerts(uniqueNewAlerts);
      }

      // Safety: if server returned fewer items than requested, no more data
      if (isLoadMore && uniqueNewAlerts.length === 0) {
        setHasMore(false);
        setNextCursor(null);
        return;
      }

      setHasMore(pagination.hasMore);
      setNextCursor(pagination.nextCursor || null);
      setPage((prev) => (isLoadMore ? prev + 1 : 1));

      // Cache the result (use functional approach to get latest alerts)
      const cacheKey = buildCacheKey();
      if (!isLoadMore) {
        writeCache(cacheKey, {
          alerts: uniqueNewAlerts,
          totalResults: pagination.total || 0,
          hasMore: pagination.hasMore,
          nextPage: 2,
          nextCursor: pagination.nextCursor || null,
          alertStats: response.data.stats || null
        });
      }

    } catch (error) {
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return;
      console.error(error);
      setError('Failed to load alerts');
      toast.error('Failed to load alerts');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      setIsFetchingMore(false);
      isFirstLoadRef.current = false;
      isFetchingRef.current = false;
    }
  }, [activeTab, debouncedSearchQuery, platformFilter, keywordFilter, alertCategory, dateRange, sourceCategoryFilter, buildCacheKey, writeCache, nextCursor, hasAnyAlertFeature, visibleStatusTabs]);

  const fetchCapturedStories = useCallback(async () => {
    if (!isCapturedStoriesView) {
      setCapturedStories([]);
      setCapturedStoriesLoading(false);
      return;
    }

    setCapturedStoriesLoading(true);
    try {
      const allStories = [];
      let currentPage = 1;
      let hasMoreStories = true;

      while (hasMoreStories && currentPage <= 20) {
        const response = await api.get('/instagram-stories', {
          params: {
            page: currentPage,
            limit: 200,
            include_expired: true,
            include_unavailable: true,
            archived_only: true,
            s3_only: true
          }
        });

        const storiesChunk = Array.isArray(response.data?.stories) ? response.data.stories : [];
        allStories.push(...storiesChunk);

        hasMoreStories = Boolean(response.data?.pagination?.hasMore) && storiesChunk.length > 0;
        currentPage += 1;
      }

      const seenStoryIds = new Set();
      const dedupedStories = allStories.filter((story, index) => {
        const dedupeKey = story?.id || story?.story_pk || `${story?.author_handle || 'unknown'}-${story?.published_at || story?.created_at || index}`;
        if (seenStoryIds.has(dedupeKey)) return false;
        seenStoryIds.add(dedupeKey);
        return true;
      });

      setCapturedStories(dedupedStories);
    } catch (error) {
      console.error('Failed to fetch captured stories:', error);
      setCapturedStories([]);
      toast.error('Failed to load captured Instagram stories');
    } finally {
      setCapturedStoriesLoading(false);
    }
  }, [isCapturedStoriesView]);

  useEffect(() => {
    fetchCapturedStories();
  }, [fetchCapturedStories]);

  const fetchAlertStats = useCallback(async () => {
    // We now fetch stats always (for the Escalated pending count), 
    // relying on the JSX to hide regular status counts if no search is active.
    try {
      // Don't include URL queries in stats search - they're for investigation only
      const searchParam = isUrlQuery(debouncedSearchQuery) ? '' : debouncedSearchQuery;

      const params = {
        search: searchParam,
        platform: platformFilter !== 'all' ? platformFilter : undefined,
        category: sourceCategoryFilter !== 'all' ? sourceCategoryFilter : undefined,
        startDate: dateRange.start || undefined,
        endDate: dateRange.end || undefined,
        alert_type: alertCategory === 'viral' ? 'velocity' : undefined,
        keyword: keywordFilter !== 'all' ? keywordFilter : undefined
      };

      if (alertCategory === 'viral') {
        params.alert_type = 'velocity';
      } else if (alertCategory === 'risk') {
        params.alert_type = 'risk';
      } else if (['high', 'medium', 'low', 'critical'].includes(alertCategory)) {
        params.risk_level = alertCategory;
      }

      const response = await api.get('/alerts/stats', { params });
      setAlertStats(response.data);
    } catch (error) {
      console.error('Failed to fetch alert stats:', error);
    }
  }, [debouncedSearchQuery, platformFilter, keywordFilter, alertCategory, dateRange, sourceCategoryFilter]);

  // Initial load or Filter change
  // Debounce Search Query - but skip if it's a URL (for investigation)
  useEffect(() => {
    const timer = setTimeout(() => {
      // Don't use URLs as search filters - they're for investigation only
      if (!isUrlQuery(searchQuery)) {
        setDebouncedSearchQuery(searchQuery);
      } else {
        // Clear search filter if URL is pasted
        setDebouncedSearchQuery('');
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch Logic Triggered by Filters (Debounced Search, Tab Switch, etc.)
  useEffect(() => {
    if (!hasAnyAlertFeature) return;
    const key = `${activeTab}|${alertCategory}|${debouncedSearchQuery}|${platformFilter}|${keywordFilter}|${sourceCategoryFilter}|${dateRange.start}|${dateRange.end}`;
    const keyChanged = lastFetchKeyRef.current !== key;

    // Always update the key ref so transitions are detected correctly
    lastFetchKeyRef.current = key;

    // If on reports tab, let ReportsContent handle its own data fetching
    if (activeTab === 'reports') return;

    // Only reset and fetch if the filters or tab actually changed
    if (keyChanged) {
      setPage(1);
      setNextCursor(null);
      setHasMore(true);
      fetchAlerts(false);
    }
  }, [activeTab, alertCategory, debouncedSearchQuery, platformFilter, keywordFilter, dateRange, sourceCategoryFilter, fetchAlerts, hasAnyAlertFeature]);

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  // Infinite Scroll Observer
  useEffect(() => {
    if (!hasAnyAlertFeature) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading && !isFetchingRef.current) {
          fetchAlerts(true, nextCursor);
        }
      },
      { threshold: 0.25, rootMargin: '200px' }
    );

    const target = observerTarget.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [activeTab, hasMore, loading, nextCursor, fetchAlerts, hasAnyAlertFeature]);

  // Fetch reports for escalated alerts when viewing escalated tab
  useEffect(() => {
    if (activeTab === 'escalated' && alerts.length > 0) {
      fetchReportsForAlerts(alerts);
    } else {
      // Clear reports map when not on escalated tab
      setReportsMap({});
    }
  }, [activeTab, alerts, fetchReportsForAlerts]);

  // --- POLLING LOGIC ---
  const checkForNewAlerts = useCallback(async () => {
    if (!hasAnyAlertFeature) return;
    // Only poll on 'active' tab for now to avoid complexity in history tabs
    if (activeTab !== 'active' || isFetchingRef.current) return;

    try {
      const params = {
        page: 1,
        limit: 20,
        status: 'active',
        platform: platformFilter !== 'all' ? platformFilter : undefined,
        category: sourceCategoryFilter !== 'all' ? sourceCategoryFilter : undefined,
        search: debouncedSearchQuery || undefined,
        keyword: keywordFilter !== 'all' ? keywordFilter : undefined
      };

      if (alertCategory === 'viral') params.alert_type = 'velocity';
      else if (alertCategory === 'risk') params.alert_type = 'risk';
      else if (['high', 'medium', 'low', 'critical'].includes(alertCategory)) params.risk_level = alertCategory;

      const response = await api.get('/alerts', { params: { ...params, includeStats: true } });
      const mappedNew = response.data.alerts || [];

      // Identify TRULY new items
      setAlerts(currentAlerts => {
        const currentIds = new Set(currentAlerts.map(a => a.id));
        const trulyNew = mappedNew.filter(a => !currentIds.has(a.id));

        if (trulyNew.length > 0) {
          // If scrolled down, anchor the scroll position to prevent visual jump
          if (window.scrollY > 100) {
            scrollAnchorRef.current = {
              shouldRestore: true,
              prevHeight: document.documentElement.scrollHeight,
              prevScroll: window.scrollY
            };
            setNewAlertCount(prev => prev + trulyNew.length);
          }
          // Always merge immediately (Auto Load)
          return [...trulyNew, ...currentAlerts];
        }
        return currentAlerts;
      });
      if (response.data?.stats) setAlertStats(response.data.stats);

    } catch (e) {
      console.error("Polling error:", e); // Silent fail
    }
  }, [activeTab, loading, platformFilter, debouncedSearchQuery, alertCategory, keywordFilter, sourceCategoryFilter, hasAnyAlertFeature]);

  // Scroll Anchoring Effect
  React.useLayoutEffect(() => {
    if (scrollAnchorRef.current.shouldRestore) {
      const newHeight = document.documentElement.scrollHeight;
      const diff = newHeight - scrollAnchorRef.current.prevHeight;
      if (diff > 0) {
        window.scrollTo(0, scrollAnchorRef.current.prevScroll + diff);
      }
      scrollAnchorRef.current.shouldRestore = false;
    }
  }, [alerts]);

  // Reset new count when at top
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY < 50 && newAlertCount > 0) {
        setNewAlertCount(0);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [newAlertCount]);

  const fetchSourcesMetadata = useCallback(async () => {
    try {
      const response = await api.get('/sources');
      // Handle both { data: [...] } and directly [...]
      const data = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      const handles = data.map(s => s.identifier).filter(Boolean);
      setMonitoredHandles(handles);
      console.log(`[Alerts] Fetched ${handles.length} monitored handles:`, handles);
    } catch (err) {
      console.error('Error fetching source metadata:', err);
    }
  }, []);

  useEffect(() => {
    // fetchSourcesMetadata is called initially and periodically
    fetchSourcesMetadata();

    // Auto-refresh every 2 minutes
    const interval = setInterval(() => {
      checkForNewAlerts(); // Use checkForNewAlerts for silent refresh
      fetchSourcesMetadata();
      if (isCapturedStoriesView) {
        fetchCapturedStories();
      }
    }, 120000);

    return () => clearInterval(interval);
  }, [checkForNewAlerts, fetchAlerts, fetchAlertStats, fetchSourcesMetadata, fetchCapturedStories, isCapturedStoriesView]);

  // The backend already auto-queues Frequent Engagers analyses hourly, but
  // that timer only starts fresh on a backend restart — this pings the same
  // endpoint once per hour (per browser) as a redundant nudge so a long
  // backend uptime without a restart doesn't mean a long wait for the first
  // handles to get analyzed.
  useEffect(() => {
    try {
      const lastTriggeredAt = Number(localStorage.getItem(ENGAGER_AUTO_QUEUE_TRIGGER_KEY) || 0);
      if (Date.now() - lastTriggeredAt < ENGAGER_AUTO_QUEUE_TRIGGER_TTL) return;
    } catch (error) {
      console.error('Failed to read engager auto-queue trigger cache:', error);
    }

    api.post('/engager/engager-analysis-auto-queue')
      .then(() => {
        try {
          localStorage.setItem(ENGAGER_AUTO_QUEUE_TRIGGER_KEY, String(Date.now()));
        } catch (error) {
          console.error('Failed to write engager auto-queue trigger cache:', error);
        }
      })
      .catch((error) => {
        console.error('Failed to trigger engager auto-queue:', error);
      });
  }, []);

  useEffect(() => {
    if (!hasAnyAlertFeature) return;
    if (!hasAnyAlertFeature) return undefined;
    const interval = setInterval(checkForNewAlerts, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [checkForNewAlerts, hasAnyAlertFeature]);

  useEffect(() => {
    return () => {
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setNewAlertCount(0);
  };



  const handleAlertResolve = (resolvedAlert) => {
    const newStatus = resolvedAlert.status;

    // If the new status doesn't match the current tab, remove it immediately for better UX
    setAlerts(prev => prev.filter(a => a.id !== resolvedAlert.id || (newStatus === activeTab)));
    setInvestigatedAlerts(prev => prev.filter(a => a.id !== resolvedAlert.id || (newStatus === activeTab)));

    toast.success(`Alert moved to ${newStatus?.replace('_', ' ') || 'updated'}`);
    fetchAlertStats();
  };

  const handleAlertDelete = (alertId) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    setInvestigatedAlerts(prev => prev.filter(a => a.id !== alertId));
    fetchAlertStats();
  };

  const handleAlertEditSentiment = (alertId, riskLevel) => {
    setAlerts(prev => prev.map(a => (a.id === alertId ? { ...a, risk_level: riskLevel } : a)));
    setInvestigatedAlerts(prev => prev.map(a => (a.id === alertId ? { ...a, risk_level: riskLevel } : a)));
  };

  const handleInvestigate = async (url) => {
    if (!url.trim()) return;

    console.log('[Alerts] Investigating URL:', url);
    setIsInvestigating(true);
    try {
      console.log('[Alerts] POSTing to /alerts/investigate...');
      const response = await api.post('/alerts/investigate', { url });
      console.log('[Alerts] Investigation response:', response.data);
      const newAlert = response.data;

      setInvestigatedAlerts(prev => [newAlert, ...prev]);
      setSearchQuery(''); // Clear search after investigation
      toast.success('Investigation complete. Result added to the list.');

      // Clear frontend localStorage cache so refresh gets fresh data from DB
      try {
        localStorage.removeItem(ALERTS_CACHE_KEY);
      } catch (e) { /* ignore */ }

      // Re-fetch the main alerts list so the new alert appears in the regular list
      // This ensures it persists after page refresh (no longer depends on client state)
      setPage(1);
      setNextCursor(null);
      setHasMore(true);
      isFetchingRef.current = false; // Reset so fetchAlerts can run
      fetchAlerts(false);

      // Also refresh stats to update counts
      fetchAlertStats();

      // Auto-switch to active tab if not already there to see the result
      const fallbackTab = visibleStatusTabs.some((tab) => tab.value === 'active')
        ? 'active'
        : visibleStatusTabs[0]?.value;
      if (fallbackTab && activeTab !== fallbackTab) {
        setActiveTab(fallbackTab);
      }

      // Scroll to top to see the new result
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('Investigation failed:', error);
      const serverMessage = error.response?.data?.message;
      const debugDetails = error.response?.data?.debug;

      const displayMessage = serverMessage
        ? `${serverMessage}${debugDetails ? ` (Debug: ${JSON.stringify(debugDetails)})` : ''}`
        : 'Failed to investigate link';

      toast.error(displayMessage);
    } finally {
      setIsInvestigating(false);
    }
  };

  // Filter investigated alerts based on current filters
  const filterInvestigatedAlerts = useCallback((alerts) => {
    return alerts.filter(alert => {
      // Platform filter
      if (platformFilter !== 'all' && alert.platform !== platformFilter) {
        return false;
      }

      // Search query filter (search in text, author, author_handle)
      if (debouncedSearchQuery) {
        const searchLower = debouncedSearchQuery.toLowerCase();
        const textMatch = alert.content_id?.text?.toLowerCase().includes(searchLower) ||
          alert.content_details?.text?.toLowerCase().includes(searchLower);
        const authorMatch = alert.author?.toLowerCase().includes(searchLower) ||
          alert.author_handle?.toLowerCase().includes(searchLower);
        if (!textMatch && !authorMatch) {
          return false;
        }
      }

      // Alert category filter (risk level or viral)
      if (alertCategory !== 'all') {
        if (alertCategory === 'viral') {
          // For viral, check if has high engagement metrics
          const isViral = alert.viral_score > 70 || alert.engagement_velocity > 100;
          if (!isViral) return false;
        } else {
          // For risk levels (high, medium, low)
          const riskLevel = alert.risk_level?.toLowerCase() || alert.severity?.toLowerCase();
          if (riskLevel !== alertCategory) {
            return false;
          }
        }
      }

      // Keyword filter
      if (keywordFilter !== 'all' && alert.matched_keywords) {
        const hasKeyword = alert.matched_keywords.some(k =>
          k.keyword_id === keywordFilter || k.keyword === keywordFilter
        );
        if (!hasKeyword) {
          return false;
        }
      }

      // Date range filter
      if (dateRange.start || dateRange.end) {
        const alertDate = new Date(alert.created_at || alert.timestamp);
        if (dateRange.start && alertDate < new Date(dateRange.start)) {
          return false;
        }
        if (dateRange.end && alertDate > new Date(dateRange.end)) {
          return false;
        }
      }

      // Status filter (activeTab)
      // Investigated alerts are always is_investigation=true and initially active
      if (activeTab === 'reports') {
        return false; // Investigated alerts don't appear in reports tab
      }

      // Match status
      const alertStatus = alert.status || 'active';
      if (activeTab !== alertStatus) {
        return false;
      }

      return true;
    });
  }, [platformFilter, debouncedSearchQuery, alertCategory, keywordFilter, dateRange, activeTab]);

  const allFilteredAlerts = useMemo(() => {
    const filteredInvestigated = filterInvestigatedAlerts(investigatedAlerts);
    const filteredRegular = alerts.filter(a => !investigatedAlerts.some(inv => inv.id === a.id));

    const applyInstagramContentFilter = (items) => {
      if (platformFilter !== 'instagram') return items;
      return items.filter((item) => {
        const content =
          item?.content_details ||
          ((item?.content_id && typeof item.content_id === 'object') ? item.content_id : null) ||
          {};
        const contentType = String(content?.content_type || '').toLowerCase();
        const contentUrl = item?.content_url || content?.content_url || content?.url || '';
        const publishedAt = content?.published_at || item?.created_at || item?.timestamp;
        const isStory = contentType === 'story' || /instagram\.com\/stories\//i.test(contentUrl);
        const isReel = contentType === 'reel' || /instagram\.com\/(reel|reels)\//i.test(contentUrl);
        const isPost = contentType === 'post' || /instagram\.com\/p\//i.test(contentUrl);
        const isArchivedStory = isStory && /(amazonaws|s3|bhaskar-media-storage)/i.test(contentUrl);

        if (instagramContentFilter === 'stories_24h') {
          if (!isStory) return false;
          if (publishedAt) {
            const publishedTime = new Date(publishedAt).getTime();
            if (!Number.isNaN(publishedTime) && Date.now() - publishedTime > 24 * 60 * 60 * 1000) {
              return false;
            }
          }
          const isDeleted = content?.is_available === false || item?.is_available === false || content?.is_deleted === true;
          if (instagramStoriesStatusFilter === 'live') return !isDeleted;
          if (instagramStoriesStatusFilter === 'deleted') return isDeleted;
          return true;
        }

        if (instagramContentFilter === 'captured_stories') {
          if (!isArchivedStory) return false;
          if (!dateRange.start && !dateRange.end) return true;
          const publishedTime = publishedAt ? new Date(publishedAt).getTime() : null;
          if (!publishedTime || Number.isNaN(publishedTime)) return false;
          const startTime = dateRange.start ? new Date(dateRange.start).getTime() : null;
          const endTime = dateRange.end ? new Date(dateRange.end).getTime() : null;
          if (startTime && publishedTime < startTime) return false;
          if (endTime && publishedTime > endTime) return false;
          return true;
        }

        // all_posts_reels
        return isPost || isReel || (!isStory && !isArchivedStory);
      });
    };

    const parseDateTime = (value) => {
      if (!value) return 0;
      if (value instanceof Date) {
        const t = value.getTime();
        return Number.isNaN(t) ? 0 : t;
      }
      if (typeof value === 'number') return value;
      const str = String(value).trim();
      if (!str) return 0;
      const direct = new Date(str).getTime();
      if (!Number.isNaN(direct)) return direct;

      const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
      if (match) {
        let day = Number(match[1]);
        let month = Number(match[2]);
        let year = Number(match[3]);
        let hour = Number(match[4] || 0);
        const minute = Number(match[5] || 0);
        const second = Number(match[6] || 0);
        const meridiem = (match[7] || '').toUpperCase();
        if (year < 100) year += 2000;
        if (meridiem) {
          if (meridiem === 'PM' && hour < 12) hour += 12;
          if (meridiem === 'AM' && hour === 12) hour = 0;
        }
        const parsed = new Date(year, month - 1, day, hour, minute, second).getTime();
        return Number.isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    };

    const getAlertTime = (item) => {
      const content = item?.content_details || item?.content_id || {};
      const published =
        content?.published_at ||
        content?.dateTime ||
        content?.created_at ||
        content?.timestamp;
      const fallback =
        item?.created_at ||
        item?.timestamp ||
        item?.updated_at;
      return parseDateTime(published || fallback);
    };

    const mapCapturedStoryToAlert = (story, index) => {
      const storyId = story?.id || story?.story_pk || `${story?.author_handle || 'unknown'}-${story?.published_at || story?.created_at || index}`;
      const publishedAt = story?.published_at || story?.created_at || story?.updated_at || new Date().toISOString();
      const mediaUrl = story?.s3_url || story?.original_url || story?.thumbnail_url || '';
      const previewUrl = story?.s3_thumbnail_url || story?.thumbnail_url || mediaUrl;
      const isVideo = String(story?.media_type || '').toLowerCase() === 'video' || Number(story?.media_type) === 2;
      const mediaType = isVideo ? 'video' : 'photo';

      return {
        id: `captured-story-${storyId}`,
        platform: 'instagram',
        status: 'active',
        risk_level: 'low',
        alert_type: 'content',
        created_at: publishedAt,
        timestamp: publishedAt,
        content_url: mediaUrl || previewUrl || '',
        author: story?.author || story?.author_handle || 'Instagram User',
        author_handle: story?.author_handle || '',
        is_story_archive: true,
        is_available: story?.is_available,
        content_details: {
          id: storyId,
          platform: 'instagram',
          content_type: 'story',
          content_url: mediaUrl || previewUrl || '',
          text: story?.caption || '',
          author_handle: story?.author_handle || '',
          published_at: publishedAt,
          media: mediaUrl ? [{
            type: mediaType,
            media_type: mediaType,
            url: mediaUrl,
            preview: previewUrl,
            s3_url: story?.s3_url || undefined,
            s3_preview: story?.s3_thumbnail_url || undefined,
            video_versions: Array.isArray(story?.video_versions) ? story.video_versions : undefined
          }] : [],
          is_deleted: story?.is_available === false,
          is_available: story?.is_available,
          deleted_at: story?.deleted_at || null,
          is_archived: true,
          s3_url: story?.s3_url || null,
          s3_thumbnail_url: story?.s3_thumbnail_url || null
        },
        source_meta: {
          name: story?.author || story?.author_handle || 'Instagram User',
          handle: story?.author_handle || '',
          profile_image_url: story?.author_avatar || '',
          is_verified: false
        }
      };
    };

    if (isCapturedStoriesView) {
      const startTime = dateRange.start ? parseDateTime(dateRange.start) : null;
      const endTime = dateRange.end ? parseDateTime(dateRange.end) : null;

      return capturedStories
        .filter((story) => {
          const hasS3Media = Boolean(story?.s3_url || story?.s3_thumbnail_url);
          if (!hasS3Media) return false;

          const storyTime = parseDateTime(story?.published_at || story?.created_at || story?.updated_at);
          if ((startTime || endTime) && !storyTime) return false;
          if (startTime && storyTime < startTime) return false;
          if (endTime && storyTime > endTime) return false;
          return true;
        })
        .map(mapCapturedStoryToAlert)
        .sort((a, b) => getAlertTime(b) - getAlertTime(a));
    }

    return applyInstagramContentFilter([
      ...filteredInvestigated,
      ...filteredRegular
    ]).sort((a, b) => getAlertTime(b) - getAlertTime(a));
  }, [alerts, investigatedAlerts, filterInvestigatedAlerts, platformFilter, instagramContentFilter, instagramStoriesStatusFilter, dateRange.start, dateRange.end, capturedStories, isCapturedStoriesView]);

  // Detect if search query is a URL
  const isUrlQuery = (query) => {
    const urlPattern = /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com|youtube\.com|youtu\.be|instagram\.com|facebook\.com|whatsapp\.com)/i;
    return urlPattern.test(query.trim());
  };

  // Handle search input change with URL detection
  const handleSearchChange = (value) => {
    setSearchQuery(value);

    // If it looks like a URL and user presses Enter, we'll investigate
    // Otherwise, it's normal filtering
  };

  // Handle search submit (Enter key or button click)
  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();

    const query = searchQuery.trim();
    if (!query) return;

    // Check if it's a URL
    if (isUrlQuery(query)) {
      handleInvestigate(query);
    }
    // Otherwise, just use it as a filter (already set in state)
  };

  const handleOpenAddSource = (data = null) => {
    setInitialSourceData(data);
    setSourceModalOpen(true);
  };

  const getRiskBadge = (level) => {
    const styles = {
      HIGH: 'bg-red-100 text-red-700 border-red-200',
      MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200',
      high: 'bg-red-100 text-red-700 border-red-200',
      medium: 'bg-amber-100 text-amber-700 border-amber-200',
      critical: 'bg-red-100 text-red-700 border-red-200'
    };
    return styles[level] || 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const getAlertTypeIcon = (type) => {
    switch (type) {
      case 'velocity':
        return <Zap className="h-4 w-4" />;
      case 'new_post':
        return <MessageSquare className="h-4 w-4" />;
      case 'ai_risk':
        return <Activity className="h-4 w-4" />;
      case 'content':
        return <LayoutList className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getAlertTypeLabel = (type) => {
    switch (type) {
      case 'velocity':
        return 'Velocity';
      case 'new_post':
        return 'New Post';
      case 'ai_risk':
        return 'AI Risk';
      case 'content':
        return 'Post';
      default:
        return 'Risk';
    }
  };

  return (
    <>
      <div className="space-y-6 max-w-[1600px] mx-auto" data-testid="alerts-page">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex flex-col">
            <h1 className="text-3xl font-heading font-bold tracking-tight">Alerts Center</h1>
            <p className="text-sm text-muted-foreground mt-1">Monitor, triage, and respond to threat alerts in real-time</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowEngagersDialog(true)} className="gap-2 shadow-sm">
              <Users className="h-4 w-4" />
              Frequent Engagers
            </Button>
            <Button
              onClick={() => {
                setInitialSourceData(null);
                setSourceModalOpen(true);
              }}
              className="gap-2 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add Resource
            </Button>
          </div>
        </div>

        <FrequentEngagersDialog
          open={showEngagersDialog}
          onOpenChange={setShowEngagersDialog}
          onAddSource={handleOpenAddSource}
          monitoredHandles={monitoredHandles}
        />

        {/* Search & Filters Row */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Unified Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative w-full md:flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search alerts or paste URL to investigate..."
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring pl-9 pr-28"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              disabled={isInvestigating}
            />
            {isInvestigating && (
              <div className="absolute right-2 top-1.5 flex items-center gap-2 px-3 py-1 bg-muted rounded-md text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Investigating...</span>
              </div>
            )}
            {searchQuery && isUrlQuery(searchQuery) && !isInvestigating && (
              <button
                type="submit"
                className="absolute right-2 top-1 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 shadow-sm flex items-center gap-1 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Investigate
              </button>
            )}
          </form>

          {/* Compact Filter Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-[130px] h-9 text-xs">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="x">Twitter (X)</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sourceCategoryFilter} onValueChange={setSourceCategoryFilter}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {SOURCE_CATEGORY_OPTIONS.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value} className="capitalize">
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={keywordFilter} onValueChange={setKeywordFilter}>
              <SelectTrigger className="w-[130px] h-9 text-xs">
                <SelectValue placeholder="Keyword" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Keywords</SelectItem>
                {availableKeywords.map((kw) => (
                  <SelectItem key={kw} value={kw}>{kw}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`h-9 w-[200px] justify-start text-left font-normal text-xs ${!dateRange.start && "text-muted-foreground"}`}
                >
                  <Calendar className="mr-1.5 h-3.5 w-3.5" />
                  {dateRange.start ? (
                    dateRange.end ? (
                      <>
                        {format(new Date(dateRange.start), "LLL dd")} -{" "}
                        {format(new Date(dateRange.end), "LLL dd, y")}
                      </>
                    ) : (
                      format(new Date(dateRange.start), "LLL dd, y")
                    )
                  ) : (
                    <span>Date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange.start ? new Date(dateRange.start) : new Date()}
                  selected={{
                    from: dateRange.start ? new Date(dateRange.start) : undefined,
                    to: dateRange.end ? new Date(dateRange.end) : undefined
                  }}
                  onSelect={(range) => {
                    setDateRange({
                      start: range?.from ? range.from.toISOString() : '',
                      end: range?.to ? range.to.toISOString() : ''
                    });
                  }}
                  fromDate={dateFilterFromDate}
                  toDate={dateFilterToDate}
                  disabled={{ before: dateFilterFromDate, after: dateFilterToDate }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>
          {isRefreshing && !isFirstLoadRef.current && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Refreshing…</span>
            </div>
          )}
        </div>

        {/* Status & Category Filter Bar */}
        <div className="border border-border bg-card rounded-md p-3 space-y-2.5">
          {/* Status Tabs */}
          <div className="w-full overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1 min-w-max">
              {visibleStatusTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  data-testid={`tab-${tab.value}`}
                  className={`relative px-3 py-1.5 text-sm font-medium transition-all rounded-md ${activeTab === tab.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                >
                  <span className="flex items-center gap-1.5">
                    {tab.label}
                    {tab.value === 'escalated' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${activeTab === tab.value ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-destructive/10 text-destructive'}`}>
                        {alertStats?.escalated_pending_report || 0}
                      </span>
                    )}
                    {searchQuery && !isUrlQuery(searchQuery) && alertStats && (
                      <span className={`text-[10px] ${activeTab === tab.value ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        ({alertStats[tab.value] || 0})
                      </span>
                    )}
                  </span>
                </button>
              ))}
              {!hasAnyAlertFeature && (
                <span className="px-3 py-1.5 text-sm text-muted-foreground">
                  No alert features are assigned to your account.
                </span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border/50" />

          {/* Category Quick Filters */}
          <div className="flex items-center gap-1.5 text-sm overflow-x-auto no-scrollbar">
            {[
              { value: 'all', label: 'All' },
              { value: 'high', label: 'Negative' },
              { value: 'medium', label: 'Moderate' },
              { value: 'low', label: 'Positive' },
              { value: 'viral', label: 'Viral' }
            ].map((cat) => (
              <button
                key={cat.value}
                onClick={() => setAlertCategory(cat.value)}
                className={`px-3 py-1 font-medium transition-all rounded-full text-xs ${alertCategory === cat.value
                  ? 'bg-secondary text-secondary-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {platformFilter === 'instagram' && (
            <div className="flex items-center gap-1.5 text-sm overflow-x-auto no-scrollbar pt-1">
              {[
                { value: 'all_posts_reels', label: 'All Posts & Reels' },
                { value: 'stories_24h', label: 'Stories (Last 24 hrs)' },
                { value: 'captured_stories', label: 'Captured Stories' }
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setInstagramContentFilter(opt.value)}
                  className={`px-3 py-1 font-medium transition-all rounded-full text-xs ${instagramContentFilter === opt.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
              {instagramContentFilter === 'stories_24h' && (
                <div className="ml-2">
                  <Select value={instagramStoriesStatusFilter} onValueChange={setInstagramStoriesStatusFilter}>
                    <SelectTrigger className="h-8 w-[150px] text-xs">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="deleted">Deleted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {instagramContentFilter === 'captured_stories' && (
                <div className="ml-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`h-8 w-[190px] justify-start text-left font-normal text-xs ${!dateRange.start && "text-muted-foreground"}`}
                      >
                        <Calendar className="mr-1.5 h-3.5 w-3.5" />
                        {dateRange.start ? (
                          dateRange.end ? (
                            <>
                              {format(new Date(dateRange.start), "LLL dd")} -{" "}
                              {format(new Date(dateRange.end), "LLL dd, y")}
                            </>
                          ) : (
                            format(new Date(dateRange.start), "LLL dd, y")
                          )
                        ) : (
                          <span>Captured date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <CalendarComponent
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange.start ? new Date(dateRange.start) : new Date()}
                        selected={{
                          from: dateRange.start ? new Date(dateRange.start) : undefined,
                          to: dateRange.end ? new Date(dateRange.end) : undefined
                        }}
                        onSelect={(range) => {
                          setDateRange({
                            start: range?.from ? range.from.toISOString() : '',
                            end: range?.to ? range.to.toISOString() : ''
                          });
                        }}
                        fromDate={dateFilterFromDate}
                        toDate={dateFilterToDate}
                        disabled={{ before: dateFilterFromDate, after: dateFilterToDate }}
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div>
          {activeTab === 'reports' ? (
            <ReportsContent
              platformFilter={platformFilter}
              dateRange={dateRange}
              searchQuery={debouncedSearchQuery}
              keywordFilter={keywordFilter}
              viewHandle={searchParams.get('handle')}
              onClearHandle={clearHandleParam}
            />
          ) : (
            <>
              {/* New Alert / Scroll Top Button */}
              {(newAlertCount > 0 || (typeof window !== 'undefined' && window.scrollY > 300)) && (
                <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4">
                  <button
                    onClick={scrollToTop}
                    className={`shadow-lg flex items-center gap-2 rounded-md px-4 py-2.5 font-medium text-sm transition-all hover:scale-105 ${newAlertCount > 0
                      ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/30'
                      : 'bg-card hover:bg-accent text-foreground border border-border'
                      }`}
                  >
                    <ArrowUpCircle className="h-5 w-5" />
                    {newAlertCount > 0 ? (
                      <span>{newAlertCount} New Alerts</span>
                    ) : null}
                  </button>
                </div>
              )}

              {/* View Toggle Commented Out
              <div className="flex justify-end mb-4">
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-blue-400'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    title="Grid View"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'list'
                      ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-blue-400'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    title="List View"
                  >
                    <LayoutList className="h-4 w-4" />
                  </button>
                </div>
              </div>
              */}

              {searchQuery && !isUrlQuery(searchQuery) && (
                <div className="mb-4 text-xs text-muted-foreground flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span>Found <strong className="text-foreground">{totalResults}</strong> results matching "<strong className="text-foreground">{searchQuery}</strong>"</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-4 text-xs text-destructive">{error}</div>
              )}

              {(() => {

                if (isFirstLoadRef.current && allFilteredAlerts.length === 0 && (loading || capturedStoriesLoading)) {
                  return (
                    <div className="columns-1 md:columns-2 lg:columns-3 w-full [column-gap:1.5rem]">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="break-inside-avoid mb-6">
                          <Card className="p-4 space-y-3 border border-border rounded-md animate-pulse">
                            <div className="flex items-center justify-between">
                              <Skeleton className="h-5 w-16 rounded-full" />
                              <Skeleton className="h-5 w-20 rounded-md" />
                            </div>
                            <div className="flex items-center gap-2.5">
                              <Skeleton className="h-9 w-9 rounded-full" />
                              <div className="space-y-1.5 flex-1">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-3 w-16" />
                              </div>
                            </div>
                            <Skeleton className="h-16 w-full rounded-md" />
                            <Skeleton className="h-32 w-full rounded-md" />
                            <div className="flex justify-between">
                              <Skeleton className="h-3 w-24" />
                              <Skeleton className="h-3 w-16" />
                            </div>
                          </Card>
                        </div>
                      ))}
                    </div>
                  );
                }

                if (!loading && !capturedStoriesLoading && !isFetchingRef.current && allFilteredAlerts.length === 0) {
                  return (
                    <Card className="p-12 text-center border border-border rounded-md" data-testid="no-alerts">
                      <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-sm text-muted-foreground mb-2">No alerts found matching your criteria.</p>
                      <Button
                        variant="link"
                        className="text-xs"
                        onClick={() => {
                          setSearchQuery('');
                          setPlatformFilter('all');
                          setKeywordFilter('all');
                          setAlertCategory('all');
                          setSourceCategoryFilter('all');
                        }}
                      >
                        Clear All Filters
                      </Button>
                    </Card>
                  );
                }

                return (
                  <div className="flex flex-col lg:flex-row gap-8 items-start">
                    <div className="flex-1 min-w-0">
                      <div className="columns-1 md:columns-2 lg:columns-3 w-full [column-gap:1.5rem]">
                        {allFilteredAlerts.map((alert, index) => {
                          const isYoutube = alert?.platform === 'youtube';
                          const isStoryArchiveCard = Boolean(alert?.is_story_archive);

                          const contentData =
                            alert?.content_details ||
                            ((alert?.content_id && typeof alert.content_id === 'object') ? alert.content_id : null) ||
                            {};

                          const sourceData =
                            alert?.source_meta ||
                            alert?.source_details ||
                            alert?.source ||
                            (alert?.author ? { name: alert.author } : null);

                          return (
                            <div
                              key={alert?.id || index}
                              className="group relative flex flex-col break-inside-avoid mb-6"
                              data-testid={`alert-item-${index}`}
                            >
                              {isYoutube ? (
                                <YoutubeAlertCard
                                  alert={alert}
                                  content={contentData}
                                  source={sourceData}
                                  onResolve={handleAlertResolve}
                                  onDelete={handleAlertDelete}
                                  onEditSentiment={handleAlertEditSentiment}
                                  enableSpecialActions
                                  viewMode="grid"
                                  hideActions={isStoryArchiveCard}
                                  report={reportsMap[alert?.id]}
                                  onAddSource={handleOpenAddSource}
                                  isInvestigatedResult={alert?.is_investigation}
                                />
                              ) : (
                                <TwitterAlertCard
                                  alert={alert}
                                  content={contentData}
                                  source={sourceData}
                                  onResolve={handleAlertResolve}
                                  onDelete={handleAlertDelete}
                                  onEditSentiment={handleAlertEditSentiment}
                                  enableSpecialActions
                                  viewMode="grid"
                                  hideActions={isStoryArchiveCard}
                                  searchQuery={searchQuery}
                                  monitoredHandles={monitoredHandles}
                                  report={reportsMap[alert?.id]}
                                  onAddSource={handleOpenAddSource}
                                  isInvestigatedResult={alert?.is_investigation}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Load More Sentinel */}
                      {!isCapturedStoriesView && hasMore && (
                        <div ref={observerTarget} className="py-6 flex justify-center w-full">
                          {!loading && !isFetchingMore && <span className="text-muted-foreground text-xs">Scroll to load more...</span>}
                          {isFetchingMore && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        </div>
                      )}
                      {!isCapturedStoriesView && !hasMore && allFilteredAlerts.length > 0 && (
                        <div className="py-6 text-center text-muted-foreground text-xs w-full">
                          All alerts loaded.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>

      <AddSourceModal
        open={sourceModalOpen}
        onClose={() => setSourceModalOpen(false)}
        initialData={initialSourceData}
        onSuccess={async (createdSource) => {
          toast.success('Monitoring started for this profile');

          const newHandle = createdSource?.identifier || initialSourceData?.identifier;
          if (newHandle) {
            setMonitoredHandles(prev => [...prev, newHandle]);
          }

          // Update all alerts from this profile to mark as monitored (both investigated and regular)
          if (initialSourceData || createdSource) {
            const platform = createdSource?.platform || initialSourceData?.platform;
            const identifier = createdSource?.identifier || initialSourceData?.identifier;
            const displayName = createdSource?.display_name || initialSourceData?.display_name;

            const updateMonitoredStatus = (alert) => {
              const matchesPlatform = alert.platform === platform;
              const matchesIdentifier = alert.author_handle === identifier;
              const matchesDisplayName = alert.author === displayName;

              return (matchesPlatform && matchesIdentifier) || (matchesPlatform && matchesDisplayName)
                ? { ...alert, is_monitored: true, source_id: createdSource?.id || null }
                : alert;
            };

            setInvestigatedAlerts(prev => prev.map(updateMonitoredStatus));
            setAlerts(prev => prev.map(updateMonitoredStatus));

            // Update backend alerts to link them to the source
            try {
              const alertsToUpdate = [...investigatedAlerts, ...alerts].filter(alert => {
                const matchesPlatform = alert.platform === platform;
                const matchesIdentifier = alert.author_handle === identifier;
                const matchesDisplayName = alert.author === displayName;
                return (matchesPlatform && matchesIdentifier) || (matchesPlatform && matchesDisplayName);
              });

              // Update each alert with source_id
              for (const alert of alertsToUpdate) {
                try {
                  api.put(`/alerts/${alert.id}`, { source_id: createdSource?.id || null }).catch(err => {
                    console.error(`Failed to link alert ${alert.id} to source:`, err);
                  });
                } catch (error) {
                  console.error(`Failed to link alert ${alert.id} to source:`, error);
                }
              }
            } catch (error) {
              console.error('Failed to update alerts with source_id:', error);
            }
          }
        }}

      />
    </>
  );
};

export default Alerts;
