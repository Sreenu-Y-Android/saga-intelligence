import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { extractLocationsBatch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
    Search, Shield, FileText, CheckCircle2, Calendar, Clock,
    AlertCircle, X, RefreshCw, Plus, Trash2, Loader2, Download,
    Building2, Users, BadgeCheck, CalendarDays, Filter, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Tag, MapPin
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Separator } from '../components/ui/separator';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../components/ui/select';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar as CalendarComponent } from '../components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { format } from 'date-fns';
import { VideoPlayer, normalizeMediaList } from '../components/AlertCards';
import { GrievanceCard } from '../components/grievances/GrievanceCard';
import { GrievanceTopNavbar } from '../components/grievances/GrievanceTopNavbar';
import { TopMlaWatchCard } from '../components/grievances/TopMlaWatchCard';
import { CriticismPopup } from '../components/grievances/CriticismPopup';
import { CriticismReports } from '../components/grievances/CriticismReports';
import { GrievancePopup } from '../components/grievances/GrievancePopup';
import { GrievanceWorkflowReports } from '../components/grievances/GrievanceWorkflowReports';
import { GrievanceStatusChangePopup } from '../components/grievances/GrievanceStatusChangePopup';
import { FrequentEngagersDialog } from '../components/FrequentEngagersDialog';
import { QueryPopup } from '../components/grievances/QueryPopup';
import { QueryReports } from '../components/grievances/QueryReports';
import { SuggestionPopup } from '../components/grievances/SuggestionPopup';
import { SuggestionReports } from '../components/grievances/SuggestionReports';
import GrievanceAnalysisModal from '../components/grievances/GrievanceAnalysisModal';
import { useRbac } from '../contexts/RbacContext';
import { usePoliticianNavigation } from '../contexts/PoliticianNavigationContext';
import { buildKeywordList, scoreRelevance } from '../utils/keywordService';
import { TOP_10_MINISTERS, getMinisterById, getMinisterInitials } from '../data/telanganaMinistersData';
import { MlaAnalyticsSummary } from '../components/grievances/MlaAnalyticsSummary';
/* ═══════════════════════════════════════════════════════════════ */
/*                       MAIN COMPONENT                          */
/* ═══════════════════════════════════════════════════════════════ */
const Grievances = () => {
    const { hasFeatureAccess } = useRbac();
    const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

    // Get logged-in user from AuthContext (full_name is the canonical field)
    const { user: authUser } = useAuth();
    const userName = authUser?.full_name || authUser?.name || authUser?.email?.split('@')[0] || 'Operator';
    const [downloadStates, setDownloadStates] = useState({});

    const updateDownloadState = useCallback((id, updates) => {
        if (!id) return;
        setDownloadStates((prev) => ({
            ...prev,
            [id]: {
                ...(prev[id] || {}),
                ...updates
            }
        }));
    }, []);

    const getProxiedMediaUrl = useCallback((rawUrl) => {
        if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
        // Render every platform's media (Twitter/X, Facebook, Instagram, YouTube, S3, etc.)
        // directly from its source URL instead of round-tripping through the backend
        // proxy — the proxy adds a hard dependency on BACKEND_URL being reachable from
        // the browser, which breaks playback (ERR_CONNECTION_REFUSED) whenever it isn't.
        return rawUrl;
    }, []);

    const triggerBlobDownload = useCallback(async (url, filename) => {
        try {
            const absoluteUrl = typeof url === 'string' && url.startsWith('/') ? `${BACKEND_URL}${url}` : url;
            const response = await fetch(absoluteUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('text/html')) {
                throw new Error('Invalid file response (HTML)');
            }
            const blob = await response.blob();
            const hasExtension = /\.[a-z0-9]{2,5}$/i.test(filename || '');
            let finalFilename = filename || 'media';
            if (!hasExtension) {
                if (contentType.includes('video/mp4')) finalFilename = `${finalFilename}.mp4`;
                else if (contentType.includes('video/')) finalFilename = `${finalFilename}.mp4`;
                else if (contentType.includes('image/png')) finalFilename = `${finalFilename}.png`;
                else if (contentType.includes('image/webp')) finalFilename = `${finalFilename}.webp`;
                else if (contentType.includes('image/gif')) finalFilename = `${finalFilename}.gif`;
                else finalFilename = `${finalFilename}.jpg`;
            }
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = finalFilename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
            return true;
        } catch (error) {
            return false;
        }
    }, [BACKEND_URL]);

    const downloadMediaForGrievance = async (grievance) => {
        const grievanceId = grievance?.id;
        const context = grievance?.context || {};

        const collectedMedia = [
            ...normalizeMediaList(grievance?.content?.media),
            ...normalizeMediaList(context?.content?.media),
            ...normalizeMediaList(context?.quoted?.content?.media),
            ...normalizeMediaList(context?.in_reply_to?.content?.media),
            ...normalizeMediaList(context?.reposted_from?.content?.media),
            ...normalizeMediaList(context?.parent?.content?.media),
            ...normalizeMediaList(context?.thread_parent?.content?.media)
        ];

        const mediaItems = Array.from(new Map(
            collectedMedia
                .map((item) => ({
                    type: item?.type || 'photo',
                    url: item?.url || item?.preview
                }))
                .filter((item) => !!item.url)
                .map((item) => [item.url, item])
        ).values());

        const fallbackMediaUrl = [
            grievance?.tweet_url,
            grievance?.url,
            context?.tweet_url,
            context?.url,
            context?.quoted?.tweet_url,
            context?.quoted?.url,
            context?.in_reply_to?.tweet_url,
            context?.in_reply_to?.url,
            context?.reposted_from?.tweet_url,
            context?.reposted_from?.url,
            context?.parent?.tweet_url,
            context?.parent?.url,
            context?.thread_parent?.tweet_url,
            context?.thread_parent?.url,
            mediaItems[0]?.url
        ].find(Boolean);

        if (!mediaItems.length && !fallbackMediaUrl) {
            updateDownloadState(grievanceId, { error: 'No media available to download' });
            setTimeout(() => updateDownloadState(grievanceId, { error: null }), 3000);
            toast.error('No media available to download');
            return;
        }

        const isVideoLike = (item) => {
            const type = String(item?.type || '').toLowerCase();
            const url = String(item?.url || '').toLowerCase();
            return type === 'video' || type === 'animated_gif' || url.includes('video.twimg.com') || /\.(mp4|webm|mov|mkv|avi|m3u8)(\?|$)/i.test(url);
        };

        const videoItems = mediaItems.filter(isVideoLike);
        const imageItems = mediaItems.filter((item) => !isVideoLike(item));

        updateDownloadState(grievanceId, {
            downloading: true,
            progress: 5,
            status: 'Video is downloading...',
            error: null
        });

        let progress = 5;
        const progressInterval = setInterval(() => {
            progress = Math.min(progress + Math.random() * 12, 90);
            updateDownloadState(grievanceId, {
                progress,
                status: progress < 45 ? 'Fetching media info...' : progress < 75 ? 'Downloading video...' : 'Finalizing download...'
            });
        }, 450);

        try {
            const filesToDownload = [];

            if (videoItems.length > 0) {
                const uniqueVideoUrls = [...new Set(videoItems.map((v) => v.url).filter(Boolean))];
                updateDownloadState(grievanceId, { progress: 20, status: `Preparing ${uniqueVideoUrls.length} video download(s)...` });

                for (let vi = 0; vi < uniqueVideoUrls.length; vi += 1) {
                    const videoUrl = uniqueVideoUrls[vi];
                    const baseProgress = 20 + Math.round(((vi + 1) / uniqueVideoUrls.length) * 20);
                    updateDownloadState(grievanceId, { progress: baseProgress, status: `Fetching video ${vi + 1}/${uniqueVideoUrls.length}...` });

                    const videoResponse = await api.post('/media/download-video', {
                        media_url: videoUrl || fallbackMediaUrl,
                        content_id: grievance?.content_id || grievance?.id
                    });

                    const vData = videoResponse.data || {};
                    if (Array.isArray(vData.items) && vData.items.length > 0) {
                        filesToDownload.push(...vData.items.map((item, idx) => ({
                            url: item?.download_url,
                            filename: item?.filename || `video_${vi + 1}_${idx + 1}.mp4`
                        })));
                    } else if (vData.download_url) {
                        filesToDownload.push({
                            url: vData.download_url,
                            filename: vData.filename || `video_${vi + 1}.mp4`
                        });
                    }
                }
            }

            if (imageItems.length > 0) {
                updateDownloadState(grievanceId, { progress: 45, status: 'Preparing image download...' });
                const imageUrls = imageItems.map((m) => m.url).filter(Boolean);
                const imageResponse = await api.post('/media/download-images', {
                    image_urls: imageUrls,
                    content_id: grievance?.content_id || grievance?.id
                });
                const iData = imageResponse.data || {};
                if (Array.isArray(iData.items) && iData.items.length > 0) {
                    filesToDownload.push(...iData.items.map((item, idx) => ({
                        url: item?.download_url,
                        filename: item?.filename || `image_${idx + 1}.jpg`
                    })));
                }
            }

            if (!filesToDownload.length) {
                clearInterval(progressInterval);
                updateDownloadState(grievanceId, {
                    downloading: false,
                    progress: 0,
                    status: '',
                    error: 'No download URL returned from server'
                });
                setTimeout(() => updateDownloadState(grievanceId, { error: null }), 3000);
                toast.error('No download URL returned from server');
                return;
            }

            clearInterval(progressInterval);
            updateDownloadState(grievanceId, { progress: 92, status: 'Saving files...' });

            let successCount = 0;
            for (let i = 0; i < filesToDownload.length; i += 1) {
                const item = filesToDownload[i];
                const ok = await triggerBlobDownload(item.url, item.filename);
                if (ok) successCount += 1;

                const pct = 92 + Math.round(((i + 1) / filesToDownload.length) * 8);
                updateDownloadState(grievanceId, { progress: Math.min(100, pct), status: 'Download started' });
                if (i < filesToDownload.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 300));
                }
            }

            if (successCount === 0) {
                throw new Error('All downloads failed');
            }

            setTimeout(() => {
                updateDownloadState(grievanceId, {
                    downloading: false,
                    progress: 0,
                    status: ''
                });
            }, 900);

            toast.success(`Downloaded ${successCount} file${successCount !== 1 ? 's' : ''}`);
        } catch (error) {
            clearInterval(progressInterval);
            updateDownloadState(grievanceId, {
                downloading: false,
                progress: 0,
                status: '',
                error: error?.response?.data?.error || 'Failed to download media'
            });
            setTimeout(() => updateDownloadState(grievanceId, { error: null }), 3000);
            toast.error(error?.response?.data?.error || 'Failed to download media');
        }
    };

    const { navigateToPoliticianGrievances } = usePoliticianNavigation();

    /* ─── State ─── */
    const [searchParams, setSearchParams] = useSearchParams();
    const [grievances, setGrievances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [activeTab, setActiveTab] = useState('all');
    const [, setStats] = useState({ total: 0, pending: 0, escalated: 0, closed: 0, converted_to_fir: 0 });
    const [, setWorkflowStats] = useState({ total: 0, pending: 0, escalated: 0, closed: 0, fir: 0 });
    const [activeReportSubTab, setActiveReportSubTab] = useState('grievance'); // grievance, suggestion, criticism
    const [pagination, setPagination] = useState({ hasMore: false, nextCursor: null, total: 0, pages: 0 });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const fetchAbortRef = useRef(null); // AbortController for cancelling stale requests

    // Sources
    const [sources, setSources] = useState([]);
    const [sourcesLoading, setSourcesLoading] = useState(false);
    const [showAddSource, setShowAddSource] = useState(false);
    const [addSourcePlatform, setAddSourcePlatform] = useState('x');
    const [addSourceHandle, setAddSourceHandle] = useState('');
    const [addSourceDept, setAddSourceDept] = useState('');
    const [addingSource, setAddingSource] = useState(false);
    const [fetchingSource, setFetchingSource] = useState(null);
    const [showEngagersDialog, setShowEngagersDialog] = useState(false);
    const [fetchingHashtag, setFetchingHashtag] = useState(false);
    const [showSourcePanel, setShowSourcePanel] = useState(true);

    // Fetch date range for source
    const [fetchDateDialog, setFetchDateDialog] = useState(null);
    const [fetchDateRange, setFetchDateRange] = useState({ from: null, to: null });

    // Dialogs
    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
    const [isMediaOpen, setIsMediaOpen] = useState(false);
    const [isFirConfirmOpen, setIsFirConfirmOpen] = useState(false);
    const [deleteConfirmSource, setDeleteConfirmSource] = useState(null);

    // Criticism popup
    const [criticismGrievance, setCriticismGrievance] = useState(null);
    const [grievancePopupGrievance, setGrievancePopupGrievance] = useState(null);
    const [statusChangePopup, setStatusChangePopup] = useState(null); // { grievance, targetStatus }
    const [queryPopupGrievance, setQueryPopupGrievance] = useState(null);
    const [suggestionPopupGrievance, setSuggestionPopupGrievance] = useState(null);

    // Selected grievance
    const [selectedGrievance, setSelectedGrievance] = useState(null);
    const [selectedMedia, setSelectedMedia] = useState(null);
    const [newStatus, setNewStatus] = useState('');
    const [statusUpdateNote, setStatusUpdateNote] = useState('');
    const [firNote, setFirNote] = useState('');
    const [firNumber, setFirNumber] = useState('');
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // Politician context (populated when navigating from MLA panel)
    const politicianContext = useMemo(() => {
        const id = searchParams.get('politician_id');
        const name = searchParams.get('politician_name');
        const role = searchParams.get('politician_role');
        // politician_constituency is the preferred param; fall back to 'location' for older URLs
        const constituency = searchParams.get('politician_constituency') || searchParams.get('location') || '';
        const entityType = searchParams.get('entity_type') || 'mla';
        if (!id && !name) return null;
        return { id, name, shortName: name, role: role || 'MLA', constituency, entityType };
    }, [searchParams]);

    // Full politician record from local data (for image, color, activityScore, etc.)
    const politicianData = useMemo(
        () => (politicianContext?.id ? getMinisterById(politicianContext.id) : null),
        [politicianContext]
    );

    // Compute analytics from already-fetched grievances (no extra API call)
    const mlaAnalytics = useMemo(() => {
        if (!politicianContext || grievances.length === 0) return null;
        const sentiments = { positive: 0, neutral: 0, negative: 0 };
        const topics = {};
        grievances.forEach(g => {
            const s = g.analysis?.sentiment;
            if (s && s in sentiments) sentiments[s]++;
            const t = g.analysis?.grievance_type || g.analysis?.category;
            if (t && t.trim()) topics[t.trim()] = (topics[t.trim()] || 0) + 1;
        });
        const topTopics = Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 4);
        return { total: grievances.length, sentiments, topTopics };
    }, [politicianContext, grievances]);

    // MLA keyword management state — resets on politician change, persists for UI toggles
    const prevPoliticianIdRef = useRef(null);
    const [customKeywords, setCustomKeywords] = useState([]);
    const [disabledKeywordIds, setDisabledKeywordIds] = useState(new Set());
    const [newKeywordInput, setNewKeywordInput] = useState('');
    const [showKeywordEditor, setShowKeywordEditor] = useState(false);

    // Derived: full keyword list (system + custom) — recomputed on every entity/custom change
    const mlaModeKeywords = useMemo(() => {
        if (!politicianContext) return [];
        const sys = buildKeywordList(politicianContext);
        const custom = customKeywords.map((term, i) => ({
            id: `custom_${i}`, term, type: 'custom', label: term, isSystem: false,
        }));
        return [...sys, ...custom];
    }, [politicianContext, customKeywords]);

    const activeMlaKeywords = useMemo(
        () => mlaModeKeywords.filter(k => !disabledKeywordIds.has(k.id)),
        [mlaModeKeywords, disabledKeywordIds]
    );

    // ─── Filters ───────────────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '');
    const [platformFilter, setPlatformFilter] = useState('all');
    const [dateRange, setDateRange] = useState({ from: null, to: null });
    const [locationFilter, setLocationFilter] = useState(() => searchParams.get('location') || null);

    // normalizeTopicFilterLabel must be defined before topicFilter useState (used in initializer)
    const normalizeTopicFilterLabel = useCallback((topic) => {
        const raw = String(topic || '').trim();
        if (!raw) return null;
        const normalized = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
        if (normalized === 'govt praise' || normalized === 'government praise' || normalized === 'general praise' || normalized === 'general complaint') {
            return 'General Complaint';
        }
        return raw;
    }, []);

    // ─── Top Navbar Filters — declared before showTopMlaGrid to avoid TDZ ──────
    const [selectedHandle, setSelectedHandle] = useState(() => searchParams.get('posted_by') || searchParams.get('handle') || null);
    const [sentimentFilter, setSentimentFilter] = useState(() => searchParams.get('sentiment') || null);
    const [topicFilter, setTopicFilter] = useState(() => normalizeTopicFilterLabel(searchParams.get('grievance_type')));
    const [analysisCategoryFilter, setAnalysisCategoryFilter] = useState(() => searchParams.get('analysis_category') || null);
    // Public Opinion highlights click-through (Overview tab)
    const [departmentFilter, setDepartmentFilter] = useState(() => searchParams.get('department') || null);
    const [fakeNewsFlag, setFakeNewsFlag] = useState(() => searchParams.get('flag') || null);
    const [constituencyFilter, setConstituencyFilter] = useState(() => searchParams.get('location_constituency') || null);
    const [navbarPlatform, setNavbarPlatform] = useState('all');
    const [navbarStatus, setNavbarStatus] = useState('total');

    // Debounce search state — must be before showTopMlaGrid
    const searchTimerRef = useRef(null);
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // ─── Derived display flags — all deps declared above ──────────────────────
    // Top 10 MLA Watch Grid is disabled — default view shows all posts.
    // When a specific politician is selected (politicianContext), filtered data is shown.
    const showTopMlaGrid = false;

    const topMlaGridFilters = useMemo(() => ({}), []);

    const grievanceStatusFeatureMap = useMemo(() => ({
        total: 'all',
        pending: 'pending',
        escalated: 'pending',
        closed: 'closed',
        fir: 'fir',
        reports: 'reports',
    }), []);

    const canAccessGrievanceReports = hasFeatureAccess('/grievances', 'reports');

    const allowedNavbarStatuses = useMemo(
        () => Object.keys(grievanceStatusFeatureMap).filter((status) => (
            hasFeatureAccess('/grievances', grievanceStatusFeatureMap[status])
        )),
        [grievanceStatusFeatureMap, hasFeatureAccess]
    );

    // Enforce feature access on navbarStatus.
    useEffect(() => {
        if (allowedNavbarStatuses.length === 0) {
            setNavbarStatus('');
            return;
        }
        if (!allowedNavbarStatuses.includes(navbarStatus)) {
            setNavbarStatus(allowedNavbarStatuses[0]);
        }
    }, [allowedNavbarStatuses, navbarStatus]);

    const mapTopicFilterToApi = useCallback((topic) => {
        const normalizedTopic = normalizeTopicFilterLabel(topic);
        if (normalizedTopic === 'General Complaint') return 'Government Praise';
        return normalizedTopic;
    }, [normalizeTopicFilterLabel]);

    const GRIEVANCE_TOPICS = [
        'Political Criticism', 'Hate Speech', 'Public Complaint', 'Corruption Complaint',
        'General Complaint', 'Traffic Complaint', 'Public Nuisance', 'Road & Infrastructure',
        'Law & Order', 'Normal'
    ];
    const [openGReportCode, setOpenGReportCode] = useState('');
    const [openSReportCode, setOpenSReportCode] = useState('');
    const [openCReportCode, setOpenCReportCode] = useState('');
    const [actionedGrievanceIds, setActionedGrievanceIds] = useState([]);

    const splitPaneRef = useRef(null);

    // Excel sheet modal
    const [showExcelModal, setShowExcelModal] = useState(false);
    const [preFilledRow, setPreFilledRow] = useState(null); // For pre-filling from grievance
    const [excelRows, setExcelRows] = useState([
        {
            id: 1,
            uniqueNumber: 'UNQ-001',
            callerNumber: '',
            receivedBy: userName,
            mentionName: '',
            receivedTime: new Date().toISOString().slice(0, 16),
            contents: '',
            psJurisdiction: '',
            typeOfPost: '',
            subCategory: '',
            informedTo: '',
            actionTime: '',
            actionTaken: '',
            caseDetails: '',
            actionInformedTo: '',
            completionDate: '',
        }
    ]);

    // Draggable/resizable modal state
    const [modalPos, setModalPos] = useState({ x: 100, y: 50 });
    const [modalSize, setModalSize] = useState({ width: 1200, height: 600 });
    const [isDraggingModal, setIsDraggingModal] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isResizingModal, setIsResizingModal] = useState(false);
    const modalRef = useRef(null);

    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 400);
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [searchQuery]);

    // Keep filter state in sync when URL query params change (e.g. map redirection).
    useEffect(() => {
        const urlSearch = searchParams.get('search') || '';
        const urlSentiment = searchParams.get('sentiment') || null;
        const urlHandle = searchParams.get('posted_by') || searchParams.get('handle') || null;
        const urlTopic = normalizeTopicFilterLabel(searchParams.get('grievance_type'));
        const urlAnalysisCategory = searchParams.get('analysis_category') || null;
        const urlDepartment = searchParams.get('department') || null;
        const urlFlag = searchParams.get('flag') || null;
        const urlConstituency = searchParams.get('location_constituency') || null;

        // In politician mode the 'location' param is the constituency, not a user-applied filter.
        // Using politician_constituency for new navigations; 'location' is a legacy fallback.
        // Either way, skip setting locationFilter when a politician is active.
        const hasPoliticianId = !!searchParams.get('politician_id');
        const urlLocation = hasPoliticianId ? null : (searchParams.get('location') || null);

        setSearchQuery(urlSearch);
        setLocationFilter(urlLocation);
        setSentimentFilter(urlSentiment);
        setSelectedHandle(urlHandle);
        setTopicFilter(urlTopic);
        setAnalysisCategoryFilter(urlAnalysisCategory);
        setDepartmentFilter(urlDepartment);
        setFakeNewsFlag(urlFlag);
        setConstituencyFilter(urlConstituency);
    }, [searchParams, normalizeTopicFilterLabel]);

    // Modal dragging
    useEffect(() => {
        if (!isDraggingModal) return;

        const handleMouseMove = (e) => {
            setModalPos({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y,
            });
        };

        const handleMouseUp = () => setIsDraggingModal(false);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingModal, dragOffset]);

    // Modal resizing
    useEffect(() => {
        if (!isResizingModal) return;

        const handleMouseMove = (e) => {
            if (!modalRef.current) return;
            const rect = modalRef.current.getBoundingClientRect();
            const newWidth = Math.max(600, e.clientX - rect.left);
            const newHeight = Math.max(400, e.clientY - rect.top);
            setModalSize({ width: newWidth, height: newHeight });
        };

        const handleMouseUp = () => setIsResizingModal(false);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingModal]);

    /* ─── Location stats (aggregated from stored detected_location in DB) ─── */
    const [uniqueLocations, setUniqueLocations] = useState([]);

    const fetchLocationStats = async () => {
        try {
            const res = await api.get('/grievances/location-stats');
            const data = res.data;
            setUniqueLocations(
                (data.cities || []).map(c => ({ city: c.city, count: c.count, district: c.district, constituency: c.constituency }))
            );
        } catch (err) {
            console.warn('[Grievances] Location stats fetch failed:', err);
            setUniqueLocations([]);
        }
    };

    /* ─── Politician mode: reset custom keywords when MLA changes ─── */
    useEffect(() => {
        const id = politicianContext?.id || null;
        if (id !== prevPoliticianIdRef.current) {
            prevPoliticianIdRef.current = id;
            setCustomKeywords([]);
            setDisabledKeywordIds(new Set());
            setNewKeywordInput('');
        }
    }, [politicianContext]);

    /* ─── Keyword action handlers ─── */
    const toggleMlaKeyword = (kwId) => {
        setDisabledKeywordIds(prev => {
            const next = new Set(prev);
            if (next.has(kwId)) next.delete(kwId); else next.add(kwId);
            return next;
        });
    };

    const addMlaKeyword = () => {
        const term = newKeywordInput.trim();
        if (!term || customKeywords.includes(term)) return;
        setCustomKeywords(prev => [...prev, term]);
        setNewKeywordInput('');
    };

    const removeMlaKeyword = (term) => {
        setCustomKeywords(prev => prev.filter(t => t !== term));
    };

    const clearPoliticianMode = useCallback(() => {
        setSearchParams(new URLSearchParams());
    }, [setSearchParams]);

    /* ─── Data Fetching ─── */
    useEffect(() => { fetchSources(); fetchLocationStats(); }, []);
    useEffect(() => {
        if (!navbarStatus) return;
        if (!allowedNavbarStatuses.includes(navbarStatus)) return;
        fetchDashboardStats();
        if (showTopMlaGrid) {
            setLoading(false);
            setGrievances([]);
            setPagination({ hasMore: false, nextCursor: null, total: 0 });
            return;
        }
        if (politicianContext) {
            fetchPoliticianGrievances();
        } else {
            fetchGrievances();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, platformFilter, dateRange, debouncedSearch, navbarPlatform, navbarStatus, selectedHandle, sentimentFilter, topicFilter, analysisCategoryFilter, locationFilter, departmentFilter, fakeNewsFlag, constituencyFilter, allowedNavbarStatuses, politicianContext, disabledKeywordIds, customKeywords, showTopMlaGrid]);

    const fetchSources = async () => {
        setSourcesLoading(true);
        try {
            const res = await api.get('/grievances/sources');
            setSources(res.data || []);
        } catch (error) {
            console.error('Failed to fetch sources', error);
        } finally {
            setSourcesLoading(false);
        }
    };

    const fetchDashboardStats = async () => {
        try {
            const requests = [api.get('/grievances/stats')];
            if (canAccessGrievanceReports) {
                requests.push(api.get('/grievance-workflow/reports', { params: { page: 1, limit: 1 } }));
            }

            const [statsRes, wfRes] = await Promise.all(requests);
            if (statsRes.data) setStats(statsRes.data);
            if (wfRes?.data?.stats) {
                setWorkflowStats(wfRes.data.stats);
            } else if (!canAccessGrievanceReports) {
                setWorkflowStats({ total: 0, pending: 0, escalated: 0, closed: 0, fir: 0 });
            }
        } catch (error) {
            console.error('Failed to fetch stats', error);
        }
    };

    /* ─── Politician-mode fetch: multi-keyword parallel, merged + relevance-scored ─── */
    const fetchPoliticianGrievances = async () => {
        if (!politicianContext) return;

        const activeKws = activeMlaKeywords;
        if (!activeKws.length) {
            setGrievances([]);
            setPagination({ hasMore: false, nextCursor: null, total: 0 });
            return;
        }

        if (fetchAbortRef.current) fetchAbortRef.current.abort();
        setLoading(true);
        setGrievances([]);

        const commonParams = {};
        if (navbarStatus && navbarStatus !== 'total' && navbarStatus !== 'reports') commonParams.status_filter = navbarStatus;
        if (navbarPlatform !== 'all') commonParams.platform = navbarPlatform;
        if (sentimentFilter) commonParams.sentiment = sentimentFilter;
        if (topicFilter) commonParams.grievance_type = mapTopicFilterToApi(topicFilter);

        try {
            // All name/alias/handle keywords go into ONE query (backend ORs them
            // together) instead of one full-collection-scan regex query per
            // keyword — this used to fire up to 5 parallel scans per click.
            // count=false skips the redundant countDocuments() scan since this
            // view computes its own total from the merged, re-scored results.
            const nameTerms = activeKws
                .filter(k => k.type !== 'constituency')
                .slice(0, 5)
                .map(kw => kw.term);
            const nameReq = nameTerms.length
                ? api.get('/grievances', { params: { search: nameTerms, limit: 200, count: false, ...commonParams } })
                    .catch(() => ({ data: { grievances: [] } }))
                : Promise.resolve({ data: { grievances: [] } });

            // Constituency fetch — supplementary signal only.
            // Reduced limit (20) because location-only matches are the main source of noise.
            const constReq = politicianContext.constituency
                ? api.get('/grievances', {
                    params: {
                        location_city: politicianContext.constituency.toLowerCase(),
                        location: politicianContext.constituency.toLowerCase(),
                        limit: 20,
                        count: false,
                        ...commonParams,
                    },
                }).catch(() => ({ data: { grievances: [] } }))
                : Promise.resolve({ data: { grievances: [] } });

            const responses = await Promise.all([nameReq, constReq]);

            // Merge + deduplicate by grievance ID
            const seen = new Set();
            const merged = [];
            responses.forEach(res => {
                (Array.isArray(res.data?.grievances) ? res.data.grievances : []).forEach(g => {
                    if (g.id && !seen.has(g.id)) {
                        seen.add(g.id);
                        merged.push(g);
                    }
                });
            });

            // Relevance scoring: primary keyword hits (3pts) > constituency (2pts) > alias (1pt)
            const primaryKeywords = activeKws.filter(k => k.type === 'primary');
            const scored = merged.map(g => {
                const text = [
                    g.content?.full_text,
                    g.content?.text,
                    g.posted_by?.name,
                    g.posted_by?.display_name,
                    g.location_city,
                ].filter(Boolean).join(' ');
                return { ...g, _relevanceScore: scoreRelevance(text, activeKws) };
            });

            // ── Two-stage quality gate ──────────────────────────────────────────
            // Stage 1: Drop anything with zero keyword hits (pure noise).
            // Stage 2: Drop constituency-location-only matches that don't mention
            //          the MLA by name — these are the biggest source of irrelevant
            //          content (e.g. any post from Madhira city, not about the MLA).
            const relevant = scored.filter(g => {
                if (g._relevanceScore <= 0) return false;
                const textLower = [
                    g.content?.full_text,
                    g.content?.text,
                    g.posted_by?.display_name,
                ].filter(Boolean).join(' ').toLowerCase();
                const hasPrimaryHit = primaryKeywords.some(k => textLower.includes(k.term.toLowerCase()));
                // If score is only from constituency match (≤2 pts) and no primary name found → drop
                if (!hasPrimaryHit && g._relevanceScore <= 2) return false;
                return true;
            });

            // Sort by relevance first, then by most recent date
            relevant.sort((a, b) =>
                b._relevanceScore !== a._relevanceScore
                    ? b._relevanceScore - a._relevanceScore
                    : new Date(b.post_date) - new Date(a.post_date)
            );

            setGrievances(relevant);
            setPagination({ hasMore: false, nextCursor: null, total: relevant.length });
        } catch (err) {
            if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
                console.error('[MLA mode] Failed to fetch politician grievances', err);
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchGrievances = async (pageNum = 1, sizeOverride = null) => {
        if (!navbarStatus || (allowedNavbarStatuses.length > 0 && !allowedNavbarStatuses.includes(navbarStatus))) {
            setGrievances([]);
            setPagination({ hasMore: false, nextCursor: null, total: 0, pages: 0 });
            setLoading(false);
            return;
        }

        if (navbarStatus === 'reports') {
            setGrievances([]);
            setPagination({ hasMore: false, nextCursor: null, total: 0, pages: 0 });
            setLoading(false);
            return;
        }

        // A new fetch always supersedes whatever's in flight — page nav, filter
        // change, or refresh all replace the current page rather than appending.
        if (fetchAbortRef.current) {
            fetchAbortRef.current.abort();
        }
        const abortController = new AbortController();
        fetchAbortRef.current = abortController;

        setPage(pageNum);
        if (pageNum === 1) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }
        try {
            const effectiveSize = sizeOverride ?? pageSize;
            const params = {
                tab: activeTab === 'fir' ? 'fir' : activeTab,
                page: pageNum,
                limit: effectiveSize,
            };

            if (navbarStatus && navbarStatus !== 'total' && navbarStatus !== 'reports') {
                params.status_filter = navbarStatus;
            }
            if (navbarPlatform && navbarPlatform !== 'all') {
                params.platform = navbarPlatform;
            } else if (platformFilter && platformFilter !== 'all') {
                params.platform = platformFilter;
            }
            if (selectedHandle) params.handle = selectedHandle;
            if (sentimentFilter) params.sentiment = sentimentFilter;
            if (topicFilter) params.grievance_type = mapTopicFilterToApi(topicFilter);
            if (analysisCategoryFilter) params.analysis_category = analysisCategoryFilter;
            if (departmentFilter) params.department = departmentFilter;
            if (fakeNewsFlag) params.flag = fakeNewsFlag;
            if (constituencyFilter) params.location_constituency = constituencyFilter;
            if (locationFilter) {
                // Keep both keys for compatibility with existing and legacy backend handlers.
                params.location_city = locationFilter;
                params.location = locationFilter;
            }
            if (debouncedSearch) params.search = debouncedSearch;
            if (dateRange.from) params.from = dateRange.from.toISOString();
            if (dateRange.to) params.to = dateRange.to.toISOString();

            const res = await api.get('/grievances', { params, signal: abortController.signal });
            const data = res.data;
            const rows = Array.isArray(data.grievances) ? data.grievances : [];

            // ── Location extraction: enrich each grievance with detected location ──
            // Uses the same 3-step cascade as TweetPulse India:
            //   Step 1: user_location (profile location field)
            //   Step 2: text (post/tweet content)
            //   Step 3: hashtags → user_bio (fallback)
            const itemsForLocation = rows
                .filter(g => g.id && (g.content?.full_text || g.content?.text))
                .map(g => {
                    const text = g.content?.full_text || g.content?.text || '';
                    const hashtags = (text.match(/#\w+/g) || []).join(' ');
                    return {
                        id: g.id,
                        text,
                        user_location: g.posted_by?.location || '',
                        user_bio: g.posted_by?.bio || g.posted_by?.description || '',
                        hashtags,
                    };
                });

            let locationMap = {};
            if (itemsForLocation.length > 0) {
                try {
                    locationMap = await extractLocationsBatch(itemsForLocation);
                } catch (e) {
                    console.warn('[Grievances] Location extraction failed:', e);
                }
            }

            const enrichedRows = rows.map(g => {
                const loc = locationMap[g.id];
                if (loc && loc.location_found) {
                    return {
                        ...g,
                        detected_location: {
                            city: loc.city,
                            keyword_matched: loc.keyword_matched,
                            lat: loc.lat,
                            lng: loc.lng,
                            confidence: loc.confidence,
                            source: loc.source,
                        },
                    };
                }
                return g;
            });

            setGrievances(enrichedRows);
            setPagination({
                hasMore: data.pagination?.hasMore || false,
                nextCursor: data.pagination?.nextCursor || null,
                total: data.pagination?.total ?? 0,
                pages: data.pagination?.pages ?? 0
            });
            // Scroll the results back into view on page navigation — otherwise the
            // user is left staring at the pagination bar at the bottom of the old page.
            if (pageNum > 1) {
                splitPaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (error) {
            if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return; // aborted — ignore
            toast.error('Failed to load grievances');
            console.error(error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    /* ─── Source Management ─── */
    const handleAddSource = async () => {
        if (!addSourceHandle.trim()) {
            toast.error('Please enter an account handle or ID');
            return;
        }
        setAddingSource(true);
        try {
            const res = await api.post('/grievances/sources', {
                handle: addSourceHandle.trim(),
                platform: addSourcePlatform,
                department: addSourceDept || undefined,
            });
            toast.success(`Source "${res.data.display_name || addSourceHandle}" added successfully`);
            setSources(prev => [res.data, ...prev]);
            setShowAddSource(false);
            setAddSourceHandle('');
            setAddSourceDept('');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to add source');
        } finally {
            setAddingSource(false);
        }
    };

    const handleDeleteSource = async (source) => {
        try {
            await api.delete(`/grievances/sources/${source.id}`);
            toast.success(`Source "${source.handle}" removed`);
            setSources(prev => prev.filter(s => s.id !== source.id));
            setDeleteConfirmSource(null);
        } catch (error) {
            toast.error('Failed to delete source');
        }
    };

    const handleFetchForSource = async (source, startDate, endDate) => {
        setFetchingSource(source.id);
        try {
            const res = await api.post(`/grievances/sources/${source.id}/fetch`, {
                start_date: startDate || undefined,
                end_date: endDate || undefined,
            });
            const newCount = res.data?.newGrievances || 0;
            toast.success(`Fetched ${newCount} new grievance${newCount !== 1 ? 's' : ''} for ${source.handle}`);
            fetchGrievances();
            fetchDashboardStats();
            fetchSources();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to fetch grievances for source');
        } finally {
            setFetchingSource(null);
            setFetchDateDialog(null);
        }
    };

    const handleFetchAll = async () => {
        setFetchingSource('all');
        try {
            const res = await api.post('/grievances/fetch-all');
            const newCount = res.data?.newGrievances || 0;
            toast.success(`Fetched ${newCount} new grievance${newCount !== 1 ? 's' : ''} from all sources`);
            fetchGrievances();
            fetchDashboardStats();
            fetchSources();
        } catch (error) {
            toast.error('Failed to fetch grievances');
        } finally {
            setFetchingSource(null);
        }
    };

    const handleFetchKeywords = async (platform) => {
        const key = platform || 'keywords';
        setFetchingSource(key);
        try {
            const res = await api.post('/grievances/fetch-keywords', platform ? { platform } : {});
            const newCount = res.data?.newGrievances || 0;
            const kwCount = res.data?.keywordsSearched || 0;
            const label = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'all platforms';
            toast.success(`Fetched ${newCount} new post${newCount !== 1 ? 's' : ''} from ${label} (${kwCount} keyword${kwCount !== 1 ? 's' : ''})`);
            fetchGrievances();
            fetchDashboardStats();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to fetch keyword content');
        } finally {
            setFetchingSource(null);
        }
    };

    const handleFetchHashtag = async () => {
        const q = searchQuery.trim();
        if (!q.startsWith('#') || q.length < 2) return;
        setFetchingHashtag(true);
        try {
            const res = await api.post('/grievances/fetch-hashtag', { query: q });
            const newCount = res.data?.newGrievances || 0;
            const total = res.data?.total || 0;
            toast.success(`Found ${total} tweets for "${q}", ingested ${newCount} new grievance${newCount !== 1 ? 's' : ''}`);
            fetchGrievances();
            fetchDashboardStats();
        } catch (error) {
            toast.error(error.response?.data?.message || `Failed to fetch tweets for "${q}"`);
        } finally {
            setFetchingHashtag(false);
        }
    };

    const handleUpdateGrievanceWorkflowStatus = async (grievance, status) => {
        const reportId = grievance?.grievance_workflow?.report_id;
        if (!reportId) {
            toast.error('Unique ID not generated yet for this post');
            return;
        }

        // ESCALATED or CLOSED → open multi-step popup
        if (['ESCALATED', 'CLOSED'].includes(status)) {
            setStatusChangePopup({ grievance, targetStatus: status });
            return;
        }

        // PENDING → direct API call
        try {
            const res = await api.put(`/grievance-workflow/${grievance.grievance_workflow.id}/status`, { status });
            const nextStatus = res?.data?.status || status;
            triggerActionBlink(grievance.id);

            setGrievances(prev => prev.map(item => (
                item.id === grievance.id
                    ? {
                        ...item,
                        grievance_workflow: {
                            ...(item.grievance_workflow || {}),
                            status: nextStatus
                        }
                    }
                    : item
            )));

            toast.success(`Status updated to ${nextStatus}`);
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to update grievance workflow status');
        }
    };

    const handleStatusChangeComplete = (grievanceId, newStatus) => {
        triggerActionBlink(grievanceId);
        setGrievances(prev => prev.map(item => (
            item.id === grievanceId
                ? {
                    ...item,
                    grievance_workflow: {
                        ...(item.grievance_workflow || {}),
                        status: newStatus
                    }
                }
                : item
        )));
    };

    const triggerActionBlink = (id) => {
        if (!id) return;
        setActionedGrievanceIds(prev => [...prev, id]);
        setTimeout(() => {
            setActionedGrievanceIds(prev => prev.filter(item => item !== id));
        }, 5000);
    };

    const handleGrievanceReportCreated = (originalGrievanceId, report) => {
        if (!originalGrievanceId || !report) return;
        triggerActionBlink(originalGrievanceId);

        const nextWorkflow = {
            report_id: report.id,
            unique_code: report.unique_code,
            status: report.status || 'PENDING'
        };

        setGrievances(prev => prev.map(item => (
            item.id === originalGrievanceId
                ? {
                    ...item,
                    grievance_workflow: {
                        ...(item.grievance_workflow || {}),
                        ...nextWorkflow
                    }
                }
                : item
        )));

        setSelectedGrievance(prev => (
            prev?.id === originalGrievanceId
                ? {
                    ...prev,
                    grievance_workflow: {
                        ...(prev.grievance_workflow || {}),
                        ...nextWorkflow
                    }
                }
                : prev
        ));

        setGrievancePopupGrievance(prev => (
            prev?.id === originalGrievanceId
                ? {
                    ...prev,
                    grievance_workflow: {
                        ...(prev.grievance_workflow || {}),
                        ...nextWorkflow
                    }
                }
                : prev
        ));

        fetchDashboardStats();
    };

    const handleQueryReportCreated = (originalGrievanceId, report) => {
        if (!originalGrievanceId || !report) return;
        triggerActionBlink(originalGrievanceId);

        const nextQuery = {
            report_id: report.id,
            unique_code: report.unique_code,
            status: report.status || 'PENDING'
        };

        setGrievances(prev => prev.map(item => (
            item.id === originalGrievanceId
                ? {
                    ...item,
                    query_workflow: {
                        ...(item.query_workflow || {}),
                        ...nextQuery
                    }
                }
                : item
        )));

        setSelectedGrievance(prev => (
            prev?.id === originalGrievanceId
                ? {
                    ...prev,
                    query_workflow: {
                        ...(prev.query_workflow || {}),
                        ...nextQuery
                    }
                }
                : prev
        ));

        setQueryPopupGrievance(prev => (
            prev?.id === originalGrievanceId
                ? {
                    ...prev,
                    query_workflow: {
                        ...(prev.query_workflow || {}),
                        ...nextQuery
                    }
                }
                : prev
        ));

        fetchDashboardStats();
    };

    const handleSuggestionReportCreated = (originalGrievanceId, report) => {
        if (!originalGrievanceId || !report) return;
        triggerActionBlink(originalGrievanceId);

        const nextSuggestion = {
            report_id: report.id,
            unique_code: report.unique_code,
            category: report.category
        };

        setGrievances(prev => prev.map(item => (
            item.id === originalGrievanceId
                ? {
                    ...item,
                    suggestion: {
                        ...(item.suggestion || {}),
                        ...nextSuggestion
                    }
                }
                : item
        )));

        setSelectedGrievance(prev => (
            prev?.id === originalGrievanceId
                ? {
                    ...prev,
                    suggestion: {
                        ...(prev.suggestion || {}),
                        ...nextSuggestion
                    }
                }
                : prev
        ));

        setSuggestionPopupGrievance(prev => (
            prev?.id === originalGrievanceId
                ? {
                    ...prev,
                    suggestion: {
                        ...(prev.suggestion || {}),
                        ...nextSuggestion
                    }
                }
                : prev
        ));

        fetchDashboardStats();
    };

    const handleCriticismReportCreated = (criticismReport, grievanceId) => {
        triggerActionBlink(grievanceId);
        setGrievances(prev => prev.map(g =>
            g.id === grievanceId
                ? {
                    ...g,
                    criticism: {
                        ...(g.criticism || {}),
                        ...criticismReport
                    }
                }
                : g
        ));

        setCriticismGrievance(prev => (
            prev?.id === grievanceId
                ? {
                    ...prev,
                    criticism: {
                        ...(prev.criticism || {}),
                        ...criticismReport
                    }
                }
                : prev
        ));
    };

    const handleDeleteGrievance = async (grievance) => {
        try {
            await api.delete(`/grievances/${grievance.id}`);
            setGrievances(prev => prev.filter(g => g.id !== grievance.id));
            toast.success('Post deleted');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete post');
        }
    };

    const handleEditGrievanceSentiment = async (grievance, sentiment) => {
        try {
            await api.put(`/grievances/${grievance.id}/sentiment`, { sentiment });
            setGrievances(prev => prev.map(item => (
                item.id === grievance.id
                    ? { ...item, analysis: { ...(item.analysis || {}), sentiment, analyzed_at: item.analysis?.analyzed_at || new Date().toISOString() } }
                    : item
            )));
            toast.success('Sentiment updated');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update sentiment');
        }
    };

    /* ─── Card Actions ─── */
    const handleAction = (action, { grievance, media, status, sentiment }) => {
        if (action === 'delete') {
            handleDeleteGrievance(grievance);
            return;
        }
        if (action === 'edit_sentiment') {
            handleEditGrievanceSentiment(grievance, sentiment);
            return;
        }
        setSelectedGrievance(grievance);
        if (action === 'view') {
            setIsDetailOpen(true);
        } else if (action === 'update_status') {
            setNewStatus(grievance.workflow_status || 'received');
            setStatusUpdateNote('');
            setIsStatusOpen(true);
        } else if (action === 'convert_to_fir') {
            setFirNote('');
            setFirNumber('');
            setIsFirConfirmOpen(true);
        } else if (action === 'view_media') {
            setSelectedMedia(media);
            setIsMediaOpen(true);
        } else if (action === 'share_to_excel') {
            // Pre-fill modal with grievance data
            const complainantName = grievance.posted_by?.display_name || grievance.complainant_phone || 'Unknown';
            const content = grievance.content?.full_text || grievance.content?.text || '';
            setPreFilledRow({
                callerNumber: grievance.complainant_phone || grievance.posted_by?.handle || '',
                mentionName: complainantName,
                contents: content,
                receivedTime: new Date().toISOString().slice(0, 16),
            });
            setShowExcelModal(true);
        } else if (action === 'download') {
            downloadMediaForGrievance(grievance);
        } else if (action === 'classify_criticism') {
            setCriticismGrievance(grievance);
        } else if (action === 'classify_grievance') {
            setGrievancePopupGrievance(grievance);
        } else if (action === 'classify_query') {
            setQueryPopupGrievance(grievance);
        } else if (action === 'classify_suggestion') {
            setSuggestionPopupGrievance(grievance);
        } else if (action === 'open_g_report') {
            const uniqueCode = grievance?.grievance_workflow?.unique_code || '';
            if (!uniqueCode) {
                toast.error('No grievance report code found for this card');
                return;
            }
            setActiveReportSubTab('grievance');
            setNavbarStatus('reports');
            setOpenGReportCode(uniqueCode);
        } else if (action === 'open_s_report') {
            const uniqueCode = grievance?.suggestion?.unique_code || '';
            if (!uniqueCode) {
                toast.error('No suggestion report code found for this card');
                return;
            }
            setActiveReportSubTab('suggestion');
            setNavbarStatus('reports');
            setOpenSReportCode(uniqueCode);
        } else if (action === 'open_c_report') {
            const uniqueCode = grievance?.criticism?.unique_code || '';
            if (!uniqueCode) {
                toast.error('No criticism report code found for this card');
                return;
            }
            setActiveReportSubTab('criticism');
            setNavbarStatus('reports');
            setOpenCReportCode(uniqueCode);
        } else if (action === 'view_analysis') {
            setIsAnalysisOpen(true);
        } else if (action === 'update_g_workflow_status') {
            handleUpdateGrievanceWorkflowStatus(grievance, status);
        }
    };

    // Handler for updating a grievance report status inline
    const handleUpdateGrievanceWorkflowStatusInline = async (grievance, newStatus) => {
        try {
            await api.put(`/grievance-workflow/${grievance.grievance_workflow.id}/status`, {
                status: newStatus
            });
            triggerActionBlink(grievance.id);
            toast.success('Report status updated');
        } catch (error) {
            toast.error('Failed to update report status');
        }
    };

    const handleUpdateStatus = async () => {
        if (!selectedGrievance) return;
        setUpdatingStatus(true);
        try {
            await api.put(`/grievances/${selectedGrievance.id}/workflow`, {
                workflow_status: newStatus,
                note: statusUpdateNote || undefined,
            });
            triggerActionBlink(selectedGrievance.id);
            toast.success('Status updated successfully');
            setIsStatusOpen(false);

            // Add delay so user can see the blink before it vanishes to another tab
            setTimeout(() => {
                // Switch to the tab matching the new status
                const statusTabMap = {
                    received: 'pending',
                    reviewed: 'pending',
                    action_taken: 'pending',
                    closed: 'closed',
                    converted_to_fir: 'fir'
                };
                const targetTab = statusTabMap[newStatus] || 'all';
                setActiveTab(targetTab);
                setGrievances([]);
                fetchGrievances();
                fetchDashboardStats();
            }, 1000);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update status');
        } finally {
            setUpdatingStatus(false);
        }
    };

    const handleConvertToFir = async () => {
        if (!selectedGrievance) return;
        setUpdatingStatus(true);
        try {
            await api.post(`/grievances/${selectedGrievance.id}/convert-to-fir`, {
                note: firNote || undefined,
                fir_number: firNumber || undefined,
            });
            triggerActionBlink(selectedGrievance.id);
            toast.success('Grievance converted to FIR');
            setIsFirConfirmOpen(false);

            setTimeout(() => {
                // Switch to FIR tab
                setActiveTab('fir');
                setGrievances([]);
                fetchGrievances();
                fetchDashboardStats();
            }, 1000);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to convert to FIR');
        } finally {
            setUpdatingStatus(false);
        }
    };

    const clearFilters = () => {
        setSearchQuery('');
        setPlatformFilter('all');
        setDateRange({ from: null, to: null });
        setNavbarPlatform('all');
        setNavbarStatus('total');
        setSelectedHandle(null);
        setLocationFilter(null);
    };

    const hasActiveFilters = platformFilter !== 'all' || dateRange.from || debouncedSearch || navbarPlatform !== 'all' || navbarStatus !== 'total' || selectedHandle || locationFilter;
    const isReportsTab = navbarStatus === 'reports';

    const displayedGrievances = useMemo(() => {
        // In politician mode, fetchPoliticianGrievances already handles constituency-based
        // filtering server-side. Skip client-side location narrowing to avoid double-filtering.
        if (!locationFilter || politicianContext) return grievances;

        let target = String(locationFilter).trim().toLowerCase();
        if (!target) return grievances;

        // If target is "Hyderabad, Telangana", we only want to match "Hyderabad".
        // Matching both "Hyderabad" AND "Telangana" via OR is too broad.
        if (target.includes(',')) {
            target = target.split(',')[0].trim();
        }

        return grievances.filter((grievance) => {
            const city = String(grievance?.detected_location?.city || '').toLowerCase().trim();
            const district = String(grievance?.detected_location?.district || '').toLowerCase().trim();
            const constituency = String(grievance?.detected_location?.constituency || '').toLowerCase().trim();

            if (!city && !district && !constituency) return false;

            // Strict match first
            if (city === target || district === target || constituency === target) {
                // If we matched via district/constituency, but city is broadly "telangana"
                // and the target is a specific city, exclude it.
                if (city === 'telangana' && target !== 'telangana') return false;
                return true;
            }

            // Flexible matching for cases like "Hyderabad" filter vs "Hyderabad, Telangana" data
            // We only do this for locations longer than 3 chars to avoid false positives
            if (city.length > 3 && (city.includes(target) || target.includes(city))) return true;

            // If we match via district or constituency, we must ensure the city isn't just "telangana"
            // unless the user specifically searched for "telangana".
            if (district.length > 3 && (district.includes(target) || target.includes(district))) {
                return (city !== 'telangana' || target === 'telangana');
            }
            if (constituency.length > 3 && (constituency.includes(target) || target.includes(constituency))) {
                return (city !== 'telangana' || target === 'telangana');
            }

            return false;
        });
    }, [grievances, locationFilter]);

    const selectedLocationTotal = useMemo(() => {
        if (!locationFilter) return null;
        const selected = uniqueLocations.find((loc) => String(loc.city).toLowerCase() === String(locationFilter).toLowerCase());
        return selected?.count ?? null;
    }, [locationFilter, uniqueLocations]);

    const effectiveTotal = locationFilter
        ? (selectedLocationTotal ?? displayedGrievances.length)
        : (pagination.total || displayedGrievances.length);

    /* ─── Pagination derived values ─── */
    const totalPages = Math.max(1, pagination.pages || Math.ceil((pagination.total || 0) / pageSize) || 1);
    const rangeStart = displayedGrievances.length ? (page - 1) * pageSize + 1 : 0;
    const rangeEnd = displayedGrievances.length ? rangeStart + displayedGrievances.length - 1 : 0;

    // Windowed page numbers: first, last, current ± 1, with '…' gaps — keeps the
    // control usable even when there are hundreds of pages.
    const pageWindow = useMemo(() => {
        const delta = 1;
        const range = [];
        for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
            range.push(i);
        }
        const withEdges = [];
        if (range[0] > 1) {
            withEdges.push(1);
            if (range[0] > 2) withEdges.push('…');
        }
        withEdges.push(...range);
        if (range[range.length - 1] < totalPages) {
            if (range[range.length - 1] < totalPages - 1) withEdges.push('…');
            withEdges.push(totalPages);
        }
        return withEdges;
    }, [page, totalPages]);

    const xSources = sources.filter(s => s.platform === 'x');
    const fbSources = sources.filter(s => s.platform === 'facebook');

    /* ═══════════════════════════════════════════════════════════════ */
    /*                           RENDER                              */
    /* ═══════════════════════════════════════════════════════════════ */
    return (
        <div className="p-4 md:p-6 space-y-0 bg-slate-50 min-h-screen flex flex-col">

            {/* ─── MLA Isolation Mode Banner ─── */}
            {politicianContext && (() => {
                const kwTypeStyle = {
                    primary: 'bg-indigo-600 text-white border-indigo-600',
                    constituency: 'bg-blue-500 text-white border-blue-500',
                    alias: 'bg-violet-500 text-white border-violet-500',
                    custom: 'bg-emerald-600 text-white border-emerald-600',
                };
                const activeCount = activeMlaKeywords.length;

                return (
                    <div className="mx-2 mt-2 mb-0 border border-indigo-200 bg-gradient-to-r from-indigo-50/80 to-violet-50/50 rounded-xl shadow-sm overflow-hidden">
                        {/* ── Header Row ── */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-100">
                            <div className="flex items-center gap-3">
                                {/* Politician avatar */}
                                <div className="relative shrink-0">
                                    {politicianData?.image ? (
                                        <img
                                            src={politicianData.image}
                                            alt={politicianContext.name}
                                            className="h-11 w-11 rounded-full object-cover object-top ring-2 ring-indigo-200 shadow-sm"
                                            onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
                                        />
                                    ) : null}
                                    <div
                                        className="h-11 w-11 rounded-full bg-indigo-600 text-white font-bold text-sm items-center justify-center ring-2 ring-indigo-200 shadow-sm"
                                        style={{ display: politicianData?.image ? 'none' : 'flex' }}
                                    >
                                        {getMinisterInitials(politicianContext.name)}
                                    </div>
                                    {/* Activity indicator dot */}
                                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white" title="Active monitoring" />
                                </div>
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[13px] font-bold text-indigo-900">{politicianContext.name}</span>
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-600 text-white uppercase tracking-wide">
                                            {politicianContext.role}
                                        </span>
                                        {politicianContext.constituency && (
                                            <span className="flex items-center gap-1 text-[10px] font-medium text-indigo-600">
                                                <MapPin className="h-2.5 w-2.5" />
                                                {politicianContext.constituency.charAt(0).toUpperCase() + politicianContext.constituency.slice(1)}
                                            </span>
                                        )}
                                        {politicianData?.department && (
                                            <span className="text-[10px] text-slate-400 hidden sm:inline">· {politicianData.department}</span>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-indigo-500 mt-0.5">
                                        {grievances.length} results matched · {activeCount} active keyword{activeCount !== 1 ? 's' : ''} · {mlaModeKeywords.length - activeCount} paused
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => setShowKeywordEditor(v => !v)}
                                    aria-expanded={showKeywordEditor}
                                    className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors border ${showKeywordEditor ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'}`}
                                >
                                    <Tag className="h-3 w-3" />
                                    Keywords ({mlaModeKeywords.length})
                                    <ChevronDown className={`h-3 w-3 transition-transform ${showKeywordEditor ? 'rotate-180' : ''}`} />
                                </button>
                                <button
                                    onClick={clearPoliticianMode}
                                    className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-red-600 px-2 py-1 rounded-lg border border-transparent hover:border-red-200 hover:bg-red-50 transition-all"
                                >
                                    <X className="h-3.5 w-3.5" />
                                    Exit
                                </button>
                            </div>
                        </div>

                        {/* ── Keyword Dropdown — collapsed by default to save vertical space ── */}
                        {showKeywordEditor && (
                            <>
                                <div className="px-4 py-2.5 flex flex-wrap items-center gap-1.5 border-t border-indigo-100">
                                    <span className="text-[10px] font-semibold text-indigo-400 mr-0.5 shrink-0">Filters:</span>
                                    {mlaModeKeywords.map(kw => {
                                        const isDisabled = disabledKeywordIds.has(kw.id);
                                        return (
                                            <button
                                                key={kw.id}
                                                onClick={() => toggleMlaKeyword(kw.id)}
                                                title={isDisabled ? 'Click to enable' : 'Click to pause'}
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all cursor-pointer select-none ${isDisabled
                                                    ? 'bg-white text-slate-400 border-slate-200 line-through opacity-60'
                                                    : (kwTypeStyle[kw.type] || kwTypeStyle.primary)
                                                    }`}
                                            >
                                                {kw.label}
                                                {!kw.isSystem && (
                                                    <span
                                                        onClick={e => { e.stopPropagation(); removeMlaKeyword(kw.term); }}
                                                        className="ml-0.5 text-[11px] leading-none hover:opacity-60"
                                                    >×</span>
                                                )}
                                            </button>
                                        );
                                    })}

                                    {/* Inline add-keyword input */}
                                    <div className="inline-flex items-center gap-1">
                                        <input
                                            type="text"
                                            value={newKeywordInput}
                                            onChange={e => setNewKeywordInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addMlaKeyword()}
                                            placeholder="+ add keyword"
                                            className="h-[22px] px-2 text-[10px] border border-dashed border-indigo-300 rounded-full outline-none focus:border-indigo-500 bg-transparent w-28 text-indigo-700 placeholder:text-indigo-300"
                                        />
                                        {newKeywordInput.trim() && (
                                            <button
                                                onClick={addMlaKeyword}
                                                className="h-[22px] px-2 text-[10px] bg-emerald-600 text-white rounded-full font-bold hover:bg-emerald-700 transition-colors"
                                            >
                                                +
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* ── Keyword Legend ── */}
                                <div className="px-4 pb-3 flex flex-wrap items-center gap-3 text-[10px]">
                                    {[
                                        { type: 'primary', label: 'Name keywords' },
                                        { type: 'constituency', label: 'Constituency' },
                                        { type: 'alias', label: 'Known aliases' },
                                        { type: 'custom', label: 'Your additions' },
                                    ].map(({ type, label }) => (
                                        <div key={type} className="flex items-center gap-1.5">
                                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${type === 'primary' ? 'bg-indigo-600' : type === 'constituency' ? 'bg-blue-500' : type === 'alias' ? 'bg-violet-500' : 'bg-emerald-600'}`} />
                                            <span className="text-slate-500">{label}</span>
                                        </div>
                                    ))}
                                    <span className="text-slate-400 ml-2">· Click any keyword to pause/resume · Strikethrough = paused</span>
                                </div>
                            </>
                        )}

                        {/* ── Isolation mode footer ── */}
                    </div>
                );
            })()}

            {/* ─── MLA Analytics Summary ─── */}
            {politicianContext && !loading && (
                <MlaAnalyticsSummary
                    analytics={mlaAnalytics}
                    politician={politicianData || politicianContext}
                    loading={loading}
                />
            )}

            {/* ─── Page Header ─── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-2 py-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Grievance Management</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Monitor and resolve public complaints from social platforms</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && searchQuery.trim().startsWith('#')) { e.preventDefault(); handleFetchHashtag(); } }}
                            placeholder="Search handle, name, #hashtag..."
                            className="bg-white border border-slate-200 rounded-md pl-8 pr-8 py-1.5 text-xs font-medium text-slate-700 w-56 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-400"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                    {searchQuery.trim().startsWith('#') && searchQuery.trim().length >= 2 && (
                        <Button
                            variant="default" size="sm"
                            onClick={handleFetchHashtag}
                            disabled={fetchingHashtag}
                            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {fetchingHashtag ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            {fetchingHashtag ? 'Fetching...' : 'Fetch Tweets'}
                        </Button>
                    )}
                    <div className="relative">
                        <select
                            value={topicFilter || ''}
                            onChange={(e) => setTopicFilter(e.target.value || null)}
                            className="appearance-none bg-white border border-teal-400 rounded-md pl-7 pr-8 py-1.5 text-xs font-medium text-slate-700 hover:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
                        >
                            <option value="">All Topics</option>
                            {GRIEVANCE_TOPICS.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                        <Tag className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                    </div>
                    <div className="relative">
                        <select
                            value={sentimentFilter || ''}
                            onChange={(e) => setSentimentFilter(e.target.value || null)}
                            className="appearance-none bg-white border border-rose-400 rounded-md pl-7 pr-8 py-1.5 text-xs font-medium text-slate-700 hover:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 cursor-pointer"
                        >
                            <option value="">All Risk Levels</option>
                            <option value="positive">Positive</option>
                            <option value="neutral">Moderate</option>
                            <option value="negative">Negative</option>
                        </select>
                        <Shield className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                    </div>
                    <Button
                        variant="outline" size="sm"
                        onClick={handleFetchAll}
                        disabled={fetchingSource === 'all'}
                        className="gap-2"
                    >
                        {fetchingSource === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Fetch All
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { fetchGrievances(); fetchDashboardStats(); fetchLocationStats(); }} className="gap-2">
                        <RefreshCw className="h-4 w-4" /> Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowEngagersDialog(true)} className="gap-2">
                        <Users className="h-4 w-4" /> Frequent Engagers
                    </Button>
                </div>
            </div>

            <FrequentEngagersDialog open={showEngagersDialog} onOpenChange={setShowEngagersDialog} />

            {/* ─── Top Navigation Bar with Filters ─── */}
            <GrievanceTopNavbar
                activePlatform={navbarPlatform}
                onPlatformChange={setNavbarPlatform}
                selectedHandle={selectedHandle}
                onHandleChange={setSelectedHandle}
                sources={sources}
                onDeleteSource={(source) => setDeleteConfirmSource(source)}
                onAddSource={() => {
                    if (navbarPlatform !== 'all') {
                        setAddSourcePlatform(navbarPlatform);
                    }
                    setShowAddSource(true);
                }}
                locationFilter={locationFilter}
                onLocationChange={setLocationFilter}
                uniqueLocations={uniqueLocations}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
            />

            {/* Dashboard Filter Banner */}
            {(sentimentFilter || selectedHandle || topicFilter || analysisCategoryFilter || locationFilter || departmentFilter || fakeNewsFlag || constituencyFilter) && (
                <div className="mx-2 mt-2 flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg text-xs">
                    <span className="text-violet-700 font-medium">Filtered by:</span>
                    {fakeNewsFlag === 'fake_news' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold text-[11px]">
                            🚩 Fake News (flagged)
                            <button type="button" onClick={() => setFakeNewsFlag(null)} className="ml-0.5 hover:opacity-70">&times;</button>
                        </span>
                    )}
                    {departmentFilter && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold text-[11px]">
                            🏢 {departmentFilter}
                            <button type="button" onClick={() => setDepartmentFilter(null)} className="ml-0.5 hover:opacity-70">&times;</button>
                        </span>
                    )}
                    {constituencyFilter && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold text-[11px]">
                            🏛️ {constituencyFilter}
                            <button type="button" onClick={() => setConstituencyFilter(null)} className="ml-0.5 hover:opacity-70">&times;</button>
                        </span>
                    )}
                    {sentimentFilter && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[11px] ${sentimentFilter === 'negative' ? 'bg-red-100 text-red-700' :
                            sentimentFilter === 'positive' ? 'bg-emerald-100 text-emerald-700' :
                                'bg-amber-100 text-amber-700'}`}>
                            {sentimentFilter === 'negative' ? 'Negative' : sentimentFilter === 'positive' ? 'Positive' : 'Moderate'}
                            <button type="button" onClick={() => setSentimentFilter(null)} className="ml-0.5 hover:opacity-70">&times;</button>
                        </span>
                    )}
                    {analysisCategoryFilter && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold text-[11px]">
                            {analysisCategoryFilter.replace(/_/g, ' ')}
                            <button type="button" onClick={() => setAnalysisCategoryFilter(null)} className="ml-0.5 hover:opacity-70">&times;</button>
                        </span>
                    )}
                    {topicFilter && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold text-[11px]">
                            {topicFilter}
                            <button type="button" onClick={() => setTopicFilter(null)} className="ml-0.5 hover:opacity-70">&times;</button>
                        </span>
                    )}
                    {selectedHandle && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            @{selectedHandle.replace('@', '')}
                            <button type="button" onClick={() => setSelectedHandle(null)} className="ml-0.5 hover:opacity-70">&times;</button>
                        </span>
                    )}
                    {locationFilter && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold text-[11px]">
                            📍 {locationFilter}
                            <button type="button" onClick={() => setLocationFilter(null)} className="ml-0.5 hover:opacity-70">&times;</button>
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => { setSentimentFilter(null); setSelectedHandle(null); setTopicFilter(null); setAnalysisCategoryFilter(null); setLocationFilter(null); setDepartmentFilter(null); setFakeNewsFlag(null); setConstituencyFilter(null); }}
                        className="ml-auto text-violet-600 hover:text-violet-800 font-medium"
                    >
                        Clear all
                    </button>
                </div>
            )}

            {/* ─── Reports Tab Content ─── */}
            {isReportsTab && (
                <div className="px-4 mt-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Big Navigation Buttons */}
                    <div className="grid grid-cols-3 gap-6 max-w-5xl mx-auto">
                        {[
                            { id: 'grievance', label: 'Grievance Reports', icon: FileText, color: 'blue', desc: 'Track formal complaints' },
                            { id: 'suggestion', label: 'Suggestions', icon: Building2, color: 'purple', desc: 'Community feedback' },
                            { id: 'criticism', label: 'Criticisms', icon: AlertCircle, color: 'red', desc: 'Critical alerts' },
                        ].map((btn) => {
                            const isActive = activeReportSubTab === btn.id;
                            const colors = {
                                blue: isActive ? 'bg-blue-600 text-white ring-blue-200' : 'bg-white text-slate-600 hover:bg-blue-50/50',
                                purple: isActive ? 'bg-purple-600 text-white ring-purple-200' : 'bg-white text-slate-600 hover:bg-purple-50/50',
                                red: isActive ? 'bg-red-600 text-white ring-red-200' : 'bg-white text-slate-600 hover:bg-red-50/50',
                            };
                            const iconColors = {
                                blue: isActive ? 'text-white' : 'text-blue-500',
                                purple: isActive ? 'text-white' : 'text-purple-500',
                                red: isActive ? 'text-white' : 'text-red-500',
                            };

                            return (
                                <button
                                    key={btn.id}
                                    onClick={() => setActiveReportSubTab(btn.id)}
                                    className={cn(
                                        "relative flex flex-col items-center justify-center p-6 rounded-3xl transition-all duration-300 border h-40 group",
                                        isActive
                                            ? "shadow-2xl scale-[1.02] border-transparent ring-4"
                                            : "border-slate-200 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-slate-300",
                                        colors[btn.color]
                                    )}
                                >
                                    <div className={cn(
                                        "p-3 rounded-2xl mb-3 transition-colors duration-300",
                                        isActive ? "bg-white/20" : "bg-slate-100 group-hover:bg-white"
                                    )}>
                                        <btn.icon className={cn("h-8 w-8", iconColors[btn.color])} />
                                    </div>
                                    <div className="text-center">
                                        <h4 className="font-black text-lg uppercase tracking-tight">{btn.label}</h4>
                                        <p className={cn("text-[10px] font-medium opacity-80 mt-1 uppercase tracking-widest")}>
                                            {btn.desc}
                                        </p>
                                    </div>
                                    {isActive && (
                                        <div className="absolute -bottom-2 flex justify-center w-full">
                                            <div className="h-1.5 w-8 rounded-full bg-white shadow-sm" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <Separator className="max-w-5xl mx-auto opacity-50" />

                    {/* Active Report View */}
                    <div className="transition-all duration-500">
                        {activeReportSubTab === 'grievance' && (
                            <GrievanceWorkflowReports
                                onStatsUpdate={setWorkflowStats}
                                openReportCode={openGReportCode}
                                onReportCodeHandled={() => setOpenGReportCode('')}
                            />
                        )}
                        {activeReportSubTab === 'suggestion' && (
                            <SuggestionReports
                                openReportCode={openSReportCode}
                                onReportCodeHandled={() => setOpenSReportCode('')}
                            />
                        )}
                        {activeReportSubTab === 'criticism' && (
                            <CriticismReports
                                openReportCode={openCReportCode}
                                onReportCodeHandled={() => setOpenCReportCode('')}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* ─── Tab Layout + Content ─── */}
            {!isReportsTab && (
                <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setGrievances([]); }} className="w-full mx-2">
                    <TabsContent value={activeTab} className="mt-4 px-2">
                        <div
                            ref={splitPaneRef}
                            className="grid grid-cols-1 gap-4 items-start"
                        >
                            {/* 60%: Grievances */}
                            <div className="space-y-4 relative z-10">
                                {showTopMlaGrid ? (
                                    <div className="space-y-4">
                                        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-sky-50 px-5 py-4 shadow-sm">
                                            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                                <div>
                                                    <h3 className="text-base font-semibold text-slate-900">Top 10 MLA Watch Grid</h3>
                                                    <p className="mt-1 text-sm text-slate-500">
                                                        Related content for the top 10 MLAs refreshes automatically every 10 minutes. Each card below shows the full thread context for the most relevant recent posts.
                                                    </p>
                                                </div>
                                                <div className="shrink-0 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                                                    2-column monitoring view
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start">
                                            {TOP_10_MINISTERS.map((politician, index) => (
                                                <TopMlaWatchCard
                                                    key={politician.id}
                                                    politician={politician}
                                                    rank={index + 1}
                                                    filters={topMlaGridFilters}
                                                    onAction={handleAction}
                                                    getProxiedMediaUrl={getProxiedMediaUrl}
                                                    downloadStates={downloadStates}
                                                    actionedGrievanceIds={actionedGrievanceIds}
                                                    selectedGrievanceId={selectedGrievance?.id}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ) : loading ? (
                                    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg border border-slate-200">
                                        <Loader2 className="h-8 w-8 animate-spin text-slate-400 mb-3" />
                                        <p className="text-sm text-muted-foreground">Loading grievances...</p>
                                    </div>
                                ) : grievances.length === 0 ? (
                                    politicianContext ? (
                                        <div className="text-center p-12 bg-indigo-50 rounded-xl border-2 border-dashed border-indigo-200">
                                            {politicianData?.image ? (
                                                <img
                                                    src={politicianData.image}
                                                    alt={politicianContext.name}
                                                    className="h-16 w-16 rounded-full object-cover object-top mx-auto mb-3 ring-2 ring-indigo-200 opacity-60"
                                                />
                                            ) : (
                                                <Users className="h-12 w-12 mx-auto text-indigo-300 mb-3" />
                                            )}
                                            <h3 className="text-sm font-semibold text-slate-900">
                                                No posts found for {politicianContext.name}
                                            </h3>
                                            <p className="mt-1 text-sm text-slate-500">
                                                Try enabling paused keywords or adding new ones using the Keywords panel above.
                                            </p>
                                            <Button
                                                variant="outline" size="sm"
                                                onClick={() => setShowKeywordEditor(true)}
                                                className="mt-3 gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                                            >
                                                <Tag className="h-3.5 w-3.5" />
                                                Manage Keywords
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="text-center p-12 bg-white rounded-lg border-2 border-dashed border-slate-200">
                                            <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                                            <h3 className="text-sm font-semibold text-slate-900">No grievances found</h3>
                                            <p className="mt-1 text-sm text-slate-500">
                                                {hasActiveFilters
                                                    ? 'Try adjusting your filters or search terms.'
                                                    : 'Add source accounts and fetch grievances to get started.'}
                                            </p>
                                            {hasActiveFilters && (
                                                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3">
                                                    Clear Filters
                                                </Button>
                                            )}
                                        </div>
                                    )
                                ) : (
                                    <div className="space-y-4">
                                        {/* Results summary + page-size selector */}
                                        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                                            <span>
                                                {politicianContext
                                                    ? `${displayedGrievances.length} posts for ${politicianContext.name}`
                                                    : displayedGrievances.length
                                                        ? `Showing ${rangeStart}–${rangeEnd}${effectiveTotal ? ` of ${effectiveTotal}` : ''} results`
                                                        : 'No results'}
                                            </span>
                                            {!politicianContext && (
                                                <label className="flex items-center gap-1.5 text-[11px]">
                                                    Per page
                                                    <select
                                                        value={pageSize}
                                                        onChange={(e) => {
                                                            const v = Number(e.target.value);
                                                            setPageSize(v);
                                                            fetchGrievances(1, v);
                                                        }}
                                                        className="border border-slate-200 rounded-md px-1.5 py-0.5 text-[11px] bg-white"
                                                    >
                                                        {[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                                                    </select>
                                                </label>
                                            )}
                                        </div>

                                        {/* Masonry grid — CSS columns handle variable card heights natively */}
                                        <div className="columns-1 md:columns-2 2xl:columns-3 gap-4">
                                            {displayedGrievances.map((grievance, i) => (
                                                <div key={grievance.id} className="break-inside-avoid-column mb-4">
                                                    <GrievanceCard
                                                        grievance={grievance}
                                                        onAction={handleAction}
                                                        getProxiedMediaUrl={getProxiedMediaUrl}
                                                        downloadState={downloadStates[grievance.id]}
                                                        isSelected={selectedGrievance?.id === grievance.id && window.innerWidth >= 1280}
                                                        isActioned={actionedGrievanceIds.includes(grievance.id)}
                                                        compact={true}
                                                        enableSpecialActions
                                                    />
                                                </div>
                                            ))}
                                        </div>

                                        {/* Pagination */}
                                        {!politicianContext && totalPages > 1 && (
                                            <div className="flex items-center justify-center gap-1 py-4">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => fetchGrievances(page - 1)}
                                                    disabled={page <= 1 || loadingMore}
                                                    className="gap-1 px-2"
                                                >
                                                    <ChevronLeft className="h-4 w-4" />
                                                </Button>

                                                {pageWindow.map((p, i) => (
                                                    p === '…' ? (
                                                        <span key={`ellipsis_${i}`} className="px-1.5 text-xs text-muted-foreground select-none">…</span>
                                                    ) : (
                                                        <Button
                                                            key={p}
                                                            variant={p === page ? 'default' : 'outline'}
                                                            size="sm"
                                                            onClick={() => p !== page && fetchGrievances(p)}
                                                            disabled={loadingMore}
                                                            className="min-w-[32px] px-2"
                                                        >
                                                            {p}
                                                        </Button>
                                                    )
                                                ))}

                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => fetchGrievances(page + 1)}
                                                    disabled={(page >= totalPages && !pagination.hasMore) || loadingMore}
                                                    className="gap-1 px-2"
                                                >
                                                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>


                        </div>
                    </TabsContent>
                </Tabs>
            )}

            {/* Criticism Popup */}
            {criticismGrievance && (
                <CriticismPopup
                    grievance={criticismGrievance}
                    onClose={() => setCriticismGrievance(null)}
                    onReportCreated={handleCriticismReportCreated}
                    userName={userName}
                />
            )}

            {/* Grievance Workflow Popup */}
            {grievancePopupGrievance && (
                <GrievancePopup
                    grievance={grievancePopupGrievance}
                    onClose={() => setGrievancePopupGrievance(null)}
                    onReportCreated={handleGrievanceReportCreated}
                    userName={userName}
                />
            )}

            {/* Grievance Status Change Popup (ESCALATED / CLOSED) */}
            {statusChangePopup && (
                <GrievanceStatusChangePopup
                    grievance={statusChangePopup.grievance}
                    targetStatus={statusChangePopup.targetStatus}
                    onClose={() => setStatusChangePopup(null)}
                    onStatusUpdated={handleStatusChangeComplete}
                    userName={userName}
                />
            )}

            {/* Query Workflow Popup */}
            {queryPopupGrievance && (
                <QueryPopup
                    grievance={queryPopupGrievance}
                    onClose={() => setQueryPopupGrievance(null)}
                    onReportCreated={handleQueryReportCreated}
                    userName={userName}
                />
            )}

            {/* Suggestion Popup */}
            {suggestionPopupGrievance && (
                <SuggestionPopup
                    grievance={suggestionPopupGrievance}
                    onClose={() => setSuggestionPopupGrievance(null)}
                    onReportCreated={handleSuggestionReportCreated}
                    userName={userName}
                />
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/*                        DIALOGS                            */}
            {/* ═══════════════════════════════════════════════════════════ */}

            {/* Excel Sheet Modal */}
            <ExcelSheetModal
                open={showExcelModal}
                onOpenChange={setShowExcelModal}
                rows={excelRows}
                setRows={setExcelRows}
                modalPos={modalPos}
                setModalPos={setModalPos}
                modalSize={modalSize}
                setModalSize={setModalSize}
                isDragging={isDraggingModal}
                setIsDragging={setIsDraggingModal}
                dragOffset={dragOffset}
                setDragOffset={setDragOffset}
                isResizing={isResizingModal}
                setIsResizing={setIsResizingModal}
                modalRef={modalRef}
                preFilledRow={preFilledRow}
                setPreFilledRow={setPreFilledRow}
                userName={userName}
            />

            {/* Add Source Dialog */}
            <Dialog open={showAddSource} onOpenChange={setShowAddSource}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5" /> Add Government Account
                        </DialogTitle>
                        <DialogDescription>
                            Add an X (Twitter) or Facebook government account to monitor for tagged grievances.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Platform</Label>
                            <Select value={addSourcePlatform} onValueChange={setAddSourcePlatform}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="x">X (Twitter)</SelectItem>
                                    <SelectItem value="facebook">Facebook</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>{addSourcePlatform === 'x' ? 'Twitter Handle' : 'Facebook Page ID/URL'}</Label>
                            <Input
                                placeholder={addSourcePlatform === 'x' ? '@government_handle' : 'page-id or URL'}
                                value={addSourceHandle}
                                onChange={(e) => setAddSourceHandle(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                {addSourcePlatform === 'x'
                                    ? 'Enter the X handle without @ symbol'
                                    : 'Enter the Facebook page ID or URL slug'}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Department <span className="text-muted-foreground">(optional)</span></Label>
                            <Input
                                placeholder="e.g., Police Department"
                                value={addSourceDept}
                                onChange={(e) => setAddSourceDept(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddSource(false)}>Cancel</Button>
                        <Button onClick={handleAddSource} disabled={addingSource || !addSourceHandle.trim()}>
                            {addingSource ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Adding...</> : 'Add Source'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Fetch Date Range Dialog */}
            <Dialog open={!!fetchDateDialog} onOpenChange={(open) => { if (!open) setFetchDateDialog(null); }}>
                <DialogContent className="sm:max-w-fit">
                    <DialogHeader>
                        <DialogTitle>Fetch Grievances for {fetchDateDialog?.handle}</DialogTitle>
                        <DialogDescription>
                            Optionally select a date range to fetch historical grievances, or fetch recent ones.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="flex justify-center">
                            <CalendarComponent
                                mode="range"
                                selected={fetchDateRange}
                                onSelect={setFetchDateRange}
                                numberOfMonths={2}
                            />
                        </div>
                        {fetchDateRange.from && (
                            <div className="text-center text-sm text-muted-foreground mt-2">
                                {format(fetchDateRange.from, 'LLL dd, y')}
                                {fetchDateRange.to && ` – ${format(fetchDateRange.to, 'LLL dd, y')}`}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => { setFetchDateDialog(null); setFetchDateRange({ from: null, to: null }); }}>Cancel</Button>
                        <Button variant="outline" onClick={() => {
                            if (fetchDateDialog) handleFetchForSource(fetchDateDialog);
                            setFetchDateRange({ from: null, to: null });
                        }}>
                            Fetch Recent
                        </Button>
                        <Button onClick={() => {
                            if (fetchDateDialog && fetchDateRange.from) {
                                handleFetchForSource(
                                    fetchDateDialog,
                                    fetchDateRange.from.toISOString(),
                                    fetchDateRange.to?.toISOString()
                                );
                            }
                            setFetchDateRange({ from: null, to: null });
                        }} disabled={!fetchDateRange.from}>
                            Fetch by Date
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Source Confirmation */}
            <Dialog open={!!deleteConfirmSource} onOpenChange={(open) => { if (!open) setDeleteConfirmSource(null); }}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-red-600">Remove Source</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to remove <strong>{deleteConfirmSource?.handle}</strong>?
                            Existing grievances will not be deleted.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteConfirmSource(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={() => handleDeleteSource(deleteConfirmSource)}>Remove</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Status Update Dialog */}
            <Dialog open={isStatusOpen} onOpenChange={setIsStatusOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Update Workflow Status</DialogTitle>
                        <DialogDescription>
                            Change the workflow status for complaint {selectedGrievance?.complaint_code || selectedGrievance?.id?.substring(0, 8)}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-3">
                        {selectedGrievance && (
                            <div className="bg-slate-50 rounded-lg p-3 text-sm">
                                <span className="text-muted-foreground">Current status: </span>
                                <span className="font-medium capitalize">{(selectedGrievance.workflow_status || 'received').replace(/_/g, ' ')}</span>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>New Status</Label>
                            <Select value={newStatus} onValueChange={setNewStatus}>
                                <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="received">Received (Pending)</SelectItem>
                                    <SelectItem value="reviewed">Reviewed</SelectItem>
                                    <SelectItem value="action_taken">Action Taken</SelectItem>
                                    <SelectItem value="closed">Closed (Resolved)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Remarks / Note</Label>
                            <Textarea
                                placeholder="Add a note about this status update..."
                                value={statusUpdateNote}
                                onChange={(e) => setStatusUpdateNote(e.target.value)}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsStatusOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdateStatus} disabled={updatingStatus}>
                            {updatingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Update Status
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Convert to FIR Dialog */}
            <Dialog open={isFirConfirmOpen} onOpenChange={setIsFirConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-600 flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" />
                            Confirm FIR Conversion
                        </DialogTitle>
                        <DialogDescription>
                            This will mark the grievance as "Converted to FIR" and log the timestamp.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-3">
                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                            <p className="text-sm text-red-800">
                                <strong>Warning:</strong> This action initiates the formal FIR process. Ensure all preliminary reviews are complete before proceeding.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>FIR Number <span className="text-muted-foreground">(optional)</span></Label>
                            <Input
                                placeholder="Enter FIR number if available"
                                value={firNumber}
                                onChange={(e) => setFirNumber(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Official Remarks</Label>
                            <Textarea
                                placeholder="Enter reason or reference for FIR conversion..."
                                value={firNote}
                                onChange={(e) => setFirNote(e.target.value)}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsFirConfirmOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleConvertToFir} disabled={updatingStatus}>
                            {updatingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Convert to FIR
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Details Modal */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle>Grievance Details</DialogTitle>
                    </DialogHeader>
                    {selectedGrievance && (
                        <ScrollArea className="max-h-[70vh] pr-4">
                            <div className="space-y-6">
                                {/* Info grid */}
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <InfoField label="Complaint Code" value={selectedGrievance.complaint_code || selectedGrievance.id?.substring(0, 8)} />
                                    <InfoField label="Platform" value={<span className="capitalize">{selectedGrievance.platform}</span>} />
                                    <InfoField label="Complainant" value={selectedGrievance.posted_by?.display_name || selectedGrievance.posted_by?.handle || selectedGrievance.complainant_phone || 'Unknown'} />
                                    <InfoField label="Date Received" value={selectedGrievance.post_date ? format(new Date(selectedGrievance.post_date), 'PPP p') : 'N/A'} />
                                    <InfoField label="Current Status" value={
                                        <Badge variant="outline" className="capitalize">
                                            {(selectedGrievance.workflow_status || 'received').replace(/_/g, ' ')}
                                        </Badge>
                                    } />
                                    <InfoField label="Escalation Count" value={selectedGrievance.escalation_count || 0} />
                                    {selectedGrievance.tagged_account && <InfoField label="Tagged Account" value={selectedGrievance.tagged_account} />}
                                    {selectedGrievance.fir_number && <InfoField label="FIR Number" value={selectedGrievance.fir_number} />}
                                </div>

                                {/* Content */}
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-500 mb-2">Content</h4>
                                    <div className="p-4 bg-slate-50 rounded-lg text-sm whitespace-pre-wrap break-words border">
                                        {selectedGrievance.content?.full_text || selectedGrievance.content?.text || 'No content'}
                                    </div>
                                </div>

                                {/* Media */}
                                {selectedGrievance.content?.media?.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-slate-500 mb-2">Media ({selectedGrievance.content.media.length})</h4>
                                        <div className="grid grid-cols-3 gap-2">
                                            {selectedGrievance.content.media.map((m, i) => (
                                                <div key={i} className="aspect-video rounded-lg overflow-hidden bg-slate-100 cursor-pointer border"
                                                    onClick={() => {
                                                        setSelectedMedia(m);
                                                        setIsMediaOpen(true);
                                                    }}>
                                                    <img
                                                        src={getProxiedMediaUrl(m.preview_url || m.url)}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                        referrerPolicy="no-referrer"
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Workflow History */}
                                {selectedGrievance.workflow_history?.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-slate-500 mb-2">Workflow History</h4>
                                        <div className="space-y-2">
                                            {selectedGrievance.workflow_history.map((h, i) => (
                                                <div key={i} className="text-sm border-l-2 border-slate-300 pl-3 py-1.5">
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="font-medium capitalize text-slate-700">{(h.to || '').replace(/_/g, ' ')}</span>
                                                        <span className="text-xs text-muted-foreground">{h.at ? format(new Date(h.at), 'MMM d, h:mm a') : ''}</span>
                                                    </div>
                                                    {h.from && <span className="text-xs text-muted-foreground">From: {(h.from || '').replace(/_/g, ' ')}</span>}
                                                    {h.note && <p className="text-slate-600 text-xs mt-1">{h.note}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Original URL */}
                                {(selectedGrievance.tweet_url || selectedGrievance.url) && (
                                    <div>
                                        <Button variant="outline" size="sm" className="gap-2" asChild>
                                            <a href={selectedGrievance.tweet_url || selectedGrievance.url} target="_blank" rel="noopener noreferrer">
                                                <ExternalLink className="h-4 w-4" /> View Original Post
                                            </a>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    )}
                </DialogContent>
            </Dialog>

            {/* Fullscreen Media Preview */}
            <Dialog open={isMediaOpen} onOpenChange={setIsMediaOpen} modal={false}>
                <DialogContent
                    className="w-[100vw] h-[100vh] max-w-none p-0 bg-black/95 border-none rounded-none [&>button]:hidden"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="w-full h-full flex items-center justify-center relative">
                        <button
                            type="button"
                            onClick={() => setIsMediaOpen(false)}
                            className="absolute top-4 right-4 z-50 rounded-full bg-black/50 p-2 text-white hover:bg-white/20 transition-colors"
                            aria-label="Close preview"
                        >
                            <X className="h-6 w-6" />
                        </button>
                        {selectedMedia ? (
                            selectedMedia.type === 'video' || selectedMedia.type === 'animated_gif' ? (
                                <VideoPlayer
                                    url={getProxiedMediaUrl(selectedMedia.video_url || selectedMedia.url)}
                                    preview={getProxiedMediaUrl(selectedMedia.preview_url)}
                                    type={selectedMedia.type}
                                    autoPlay={selectedMedia.type === 'animated_gif'}
                                    onError={(e) => {
                                        console.error('Video playback error:', e);
                                        toast.error('Failed to load video.');
                                    }}
                                />
                            ) : (
                                <img
                                    src={getProxiedMediaUrl(selectedMedia.url || selectedMedia.preview_url)}
                                    alt="Media"
                                    className="max-w-full max-h-full object-contain"
                                    referrerPolicy="no-referrer"
                                />
                            )
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Grievance Analysis Details Modal */}
            <GrievanceAnalysisModal
                open={isAnalysisOpen}
                onClose={() => setIsAnalysisOpen(false)}
                grievance={selectedGrievance}
            />
        </div>
    );
};

/* ─── Source Card Sub-component ─── */
const SourceCard = ({ source, fetching, onFetch, onDelete }) => (
    <Card className="border-slate-200 hover:border-slate-300 transition-colors">
        <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="h-9 w-9 shrink-0">
                        <AvatarImage src={source.profile_image_url} />
                        <AvatarFallback className="text-xs bg-slate-200">
                            {(source.handle || '?').replace('@', '')[0]?.toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-slate-900 truncate">
                                {source.display_name || source.handle}
                            </span>
                            {source.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{source.handle}</div>
                    </div>
                </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{source.total_grievances || 0} grievances</span>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onFetch} disabled={fetching} title="Fetch grievances">
                        {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={onDelete} title="Remove source">
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </CardContent>
    </Card>
);

/* ─── Detail Info Field ─── */
const InfoField = ({ label, value }) => (
    <div>
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</h4>
        <div className="text-sm text-slate-800">{value}</div>
    </div>
);

/* ─── Resizable/Draggable Excel Sheet Modal ─── */
const ExcelSheetModal = ({ open, onOpenChange, rows, setRows, modalPos, setModalPos, modalSize, setModalSize, isDragging, setIsDragging, dragOffset, setDragOffset, isResizing, setIsResizing, modalRef, preFilledRow, setPreFilledRow, userName }) => {
    // Dropdown options
    const psJurisdictionOptions = [
        'PS-01', 'PS-02', 'PS-03', 'PS-04', 'PS-05', 'PS-06', 'PS-07', 'PS-08', 'PS-09', 'PS-10'
    ];
    const typeOfPostOptions = [
        'Twitter/X Post', 'Facebook Post', 'Instagram Post', 'WhatsApp Message', 'Comment', 'Story', 'Other'
    ];
    const subCategoryOptions = [
        'Complaint', 'Suggestion', 'Appreciation', 'Query', 'Feedback', 'Report', 'Other'
    ];
    const actionTakenOptions = [
        'Forwarded', 'Suggested', 'Solved'
    ];
    const informedToOptions = [
        { label: 'Police Station', phone: '100' },
        { label: 'Fire Department', phone: '101' },
        { label: 'Ambulance', phone: '102' },
        { label: 'Disaster Management', phone: '108' },
        { label: 'Women Helpline', phone: '1091' },
        { label: 'Custom Contact', phone: '' }
    ];

    const [searchInputs, setSearchInputs] = useState({});

    const addRow = () => {
        const newId = Math.max(...rows.map(r => r.id), 0) + 1;
        const now = new Date().toISOString().slice(0, 16);

        // If we have pre-filled data, use it
        const newRow = {
            id: newId,
            uniqueNumber: `UNQ-${String(newId).padStart(3, '0')}`,
            callerNumber: preFilledRow?.callerNumber || '',
            receivedBy: userName,
            mentionName: preFilledRow?.mentionName || '',
            receivedTime: preFilledRow?.receivedTime || now,
            contents: preFilledRow?.contents || '',
            psJurisdiction: '',
            typeOfPost: '',
            subCategory: '',
            informedTo: '',
            actionTime: '',
            actionTaken: '',
            caseDetails: '',
            actionInformedTo: '',
            completionDate: '',
        };

        setRows([...rows, newRow]);
        setPreFilledRow(null); // Clear pre-filled data after use
    };

    const updateRow = (id, field, value) => {
        setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const deleteRow = (id) => {
        setRows(rows.filter(r => r.id !== id));
    };

    const exportToCSV = () => {
        const headers = ['Unique Number', 'Caller Number', 'Received By', 'Mention Name', 'Received Time & Date',
            'Contents of Complaint', 'PS Jurisdiction', 'Type of Post', 'Sub Category', 'Informed To',
            'Action Time', 'Action Taken', 'Case Details', 'Action Informed To', 'Completion Date'];
        const csvContent = [
            headers.join(','),
            ...rows.map(r => [
                r.uniqueNumber, r.callerNumber, r.receivedBy, r.mentionName, r.receivedTime,
                r.contents, r.psJurisdiction, r.typeOfPost, r.subCategory, r.informedTo,
                r.actionTime, r.actionTaken, r.caseDetails, r.actionInformedTo, r.completionDate
            ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `grievance_records_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    if (!open) return null;

    return (
        <div
            ref={modalRef}
            className="fixed bg-white rounded-lg shadow-2xl border border-slate-200 flex flex-col z-50"
            style={{
                left: `${modalPos.x}px`,
                top: `${modalPos.y}px`,
                width: `${modalSize.width}px`,
                height: `${modalSize.height}px`,
            }}
        >
            {/* Title Bar - Draggable */}
            <div
                className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-100 to-slate-50 border-b border-slate-200 rounded-t-lg cursor-move hover:bg-slate-100 transition-colors select-none"
                onMouseDown={(e) => {
                    if (!modalRef.current) return;
                    const rect = modalRef.current.getBoundingClientRect();
                    setDragOffset({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                    });
                    setIsDragging(true);
                }}
            >
                <div>
                    <h2 className="font-semibold text-slate-900">Grievance Records - Excel Sheet</h2>
                    <p className="text-xs text-slate-500">Manage and export grievance complaint records</p>
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onOpenChange(false)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100">
                        <tr>
                            <th className="border p-2 text-left bg-slate-200 font-semibold w-16">Unique #</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-20">Caller #</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-20">Received By</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-20">Mention</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-24">Rcv Time</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-28">Contents</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">PS</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">Type</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">SubCat</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">Inform To</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-20">Action Time</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">Action</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-24">Details</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">Inf To</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">Complete</th>
                            <th className="border p-2 text-center bg-slate-200 font-semibold w-10">Del</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50">
                                <td className="border p-1"><span className="font-mono text-[10px]">{row.uniqueNumber}</span></td>
                                <td className="border p-1"><Input value={row.callerNumber} onChange={(e) => updateRow(row.id, 'callerNumber', e.target.value)} className="h-6 text-xs p-1" placeholder="+91..." /></td>
                                <td className="border p-1"><Input value={row.receivedBy} readOnly className="h-6 text-xs p-1 bg-slate-100" title="Auto-filled from login" /></td>
                                <td className="border p-1"><Input value={row.mentionName} onChange={(e) => updateRow(row.id, 'mentionName', e.target.value)} className="h-6 text-xs p-1" placeholder="Victim name" /></td>
                                <td className="border p-1"><Input type="datetime-local" value={row.receivedTime} readOnly className="h-6 text-xs p-1 bg-slate-100" title="Auto-filled" /></td>
                                <td className="border p-1"><textarea value={row.contents} readOnly className="w-full h-6 text-xs border rounded p-1 resize-none bg-slate-100" title="Auto-filled from post" /></td>
                                <td className="border p-1">
                                    <select value={row.psJurisdiction} onChange={(e) => updateRow(row.id, 'psJurisdiction', e.target.value)} className="h-6 text-xs w-full p-1 border rounded">
                                        <option value="">Select PS</option>
                                        {psJurisdictionOptions.map(ps => <option key={ps} value={ps}>{ps}</option>)}
                                        <option value="other">Other</option>
                                    </select>
                                </td>
                                <td className="border p-1">
                                    <select value={row.typeOfPost} onChange={(e) => updateRow(row.id, 'typeOfPost', e.target.value)} className="h-6 text-xs w-full p-1 border rounded">
                                        <option value="">Type</option>
                                        {typeOfPostOptions.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                </td>
                                <td className="border p-1">
                                    <select value={row.subCategory} onChange={(e) => updateRow(row.id, 'subCategory', e.target.value)} className="h-6 text-xs w-full p-1 border rounded">
                                        <option value="">SubCat</option>
                                        {subCategoryOptions.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                                    </select>
                                </td>
                                <td className="border p-1">
                                    <select value={row.informedTo} onChange={(e) => updateRow(row.id, 'informedTo', e.target.value)} className="h-6 text-xs w-full p-1 border rounded">
                                        <option value="">Select</option>
                                        {informedToOptions.map(opt => <option key={opt.phone} value={opt.phone}>{opt.label} ({opt.phone})</option>)}
                                    </select>
                                </td>
                                <td className="border p-1"><Input type="datetime-local" value={row.actionTime} onChange={(e) => updateRow(row.id, 'actionTime', e.target.value)} className="h-6 text-xs p-1" /></td>
                                <td className="border p-1">
                                    <select value={row.actionTaken} onChange={(e) => updateRow(row.id, 'actionTaken', e.target.value)} className="h-6 text-xs w-full p-1 border rounded">
                                        <option value="">Action</option>
                                        {actionTakenOptions.map(action => <option key={action} value={action}>{action}</option>)}
                                    </select>
                                </td>
                                <td className="border p-1"><textarea value={row.caseDetails} onChange={(e) => updateRow(row.id, 'caseDetails', e.target.value)} className="w-full h-6 text-xs border rounded p-1 resize-none" placeholder="Details..." /></td>
                                <td className="border p-1"><Input value={row.actionInformedTo} onChange={(e) => updateRow(row.id, 'actionInformedTo', e.target.value)} className="h-6 text-xs p-1" placeholder="Complainant" /></td>
                                <td className="border p-1"><Input type="date" value={row.completionDate} onChange={(e) => updateRow(row.id, 'completionDate', e.target.value)} className="h-6 text-xs p-1" /></td>
                                <td className="border p-1 text-center"><Button variant="destructive" size="sm" onClick={() => deleteRow(row.id)} className="h-5 w-5 p-0"><X className="h-3 w-3" /></Button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-3 bg-slate-50 border-t border-slate-200 rounded-b-lg gap-2">
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={addRow} className="gap-1 text-xs h-7"><Plus className="h-3 w-3" />Add Row</Button>
                    <Button variant="outline" size="sm" onClick={exportToCSV} className="gap-1 text-xs h-7"><Download className="h-3 w-3" />Export CSV</Button>
                </div>
                <span className="text-xs text-slate-500">Drag title to move, resize from corner</span>
            </div>

            {/* Resize Handle */}
            <div
                className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize bg-gradient-to-tl from-slate-300 to-transparent rounded-tl hover:from-slate-400 transition-colors"
                onMouseDown={() => setIsResizing(true)}
                title="Drag to resize"
            />
        </div>
    );
};
export default Grievances;
