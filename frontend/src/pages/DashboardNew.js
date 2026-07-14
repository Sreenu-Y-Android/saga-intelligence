import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// ...existing imports...
import ReactPlayer from 'react-player';
import { Link } from 'react-router-dom';
import { usePoliticianNavigation } from '../contexts/PoliticianNavigationContext';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import {
  Shield, AlertTriangle, Send,
  Users, ChevronDown, Loader2, Info, Clock, FileText, MessageSquare,
  ArrowRight, RefreshCw, X, Video, Pencil, Play, ExternalLink, Settings,
  BarChart3, Tag, MapPin, TrendingDown, Minus, TrendingUp, ShieldAlert, Building2, Landmark
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { useDashboard } from '../contexts/DashboardContext';
import { getMinisterInitials, getMinisterById } from '../data/telanganaMinistersData';
import { PARTY_WISE_MLA_DIRECTORY, TOTAL_MLA_DIRECTORY_COUNT } from '../data/telanganaMlaDirectory';
import api from '../lib/api';
import usePoliticianGrievances from '../hooks/usePoliticianGrievances';
import { buildKeywordList, getEntityKeywords, isGrievanceRelevant, scoreRelevance } from '../utils/keywordService';

import TelanganaMap from './TelanganaMap';

// Stable references so usePoliticianGrievances doesn't recreate its useCallback on every render
const MDP_FILTERS = {};
const MDP_OPTIONS = { searchLimit: 40, constituencyLimit: 20 };
const EMPTY_SENTIMENT_SUMMARY = Object.freeze({ total: 0, positive: 0, neutral: 0, negative: 0 });
const CARD_SUMMARY_SEARCH_LIMIT = 40;
const CARD_SUMMARY_CONSTITUENCY_LIMIT = 20;
const CARD_SUMMARY_MAX_KEYWORDS = 8;

// Platform configurations
const PLATFORMS = [
  { id: 'all', label: 'All sources' },
  { id: 'twitter', label: 'X (Twitter)' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'whatsapp', label: 'WhatsApp' }
];

// ─── Drone View Live Monitoring Strip ───────────────────────────────────────
const DRONE_API_KEY_STORAGE = 'blura_yt_api_key';
// Fallback levels: 0=ReactPlayer, 1=nocookie iframe, 2=standard embed, 3=thumbnail card
const FALLBACK_LABELS = ['Player (auto)', 'Embed (privacy)', 'Embed (standard)', 'Info card'];
const buildSentimentBreakdown = (summary) => {
  const positive = summary?.positive || 0;
  const neutral = summary?.neutral || 0;
  const negative = summary?.negative || 0;
  const total = summary?.total ?? (positive + neutral + negative);
  const rawSegments = [
    { key: 'positive', label: '+Ve', value: positive, color: '#10b981', bgClass: 'bg-emerald-500', textClass: 'text-emerald-600' },
    { key: 'neutral', label: 'Mixed', value: neutral, color: '#f59e0b', bgClass: 'bg-amber-400', textClass: 'text-amber-600' },
    { key: 'negative', label: '-Ve', value: negative, color: '#ef4444', bgClass: 'bg-red-500', textClass: 'text-red-600' },
  ];

  return {
    positive,
    neutral,
    negative,
    total,
    segments: rawSegments.map((segment) => ({
      ...segment,
      percentage: total ? Math.round((segment.value / total) * 100) : 0,
    })),
  };
};

const normalizeSentimentSummary = (summary) => ({
  total: Number(summary?.total || 0),
  positive: Number(summary?.positive || 0),
  neutral: Number(summary?.neutral || 0),
  negative: Number(summary?.negative || 0),
});

const summarizeGrievances = (grievances = []) => {
  const summary = { total: grievances.length, positive: 0, neutral: 0, negative: 0 };

  grievances.forEach((grievance) => {
    const sentiment = String(grievance?.sentiment || '').toLowerCase();
    if (sentiment === 'positive') summary.positive += 1;
    else if (sentiment === 'negative') summary.negative += 1;
    else summary.neutral += 1;
  });

  return summary;
};

const getGrievanceIdentity = (grievance) => (
  grievance?.id
  || grievance?.post_id
  || grievance?.content?.post_url
  || grievance?.url
  || [
    grievance?.posted_by?.handle,
    grievance?.post_date,
    grievance?.detected_date,
    grievance?.content?.full_text,
    grievance?.content?.text,
  ].filter(Boolean).join('::')
);

const getGrievanceSearchText = (grievance) => [
  grievance?.content?.full_text,
  grievance?.content?.text,
  grievance?.posted_by?.handle,
  grievance?.posted_by?.display_name,
  grievance?.tagged_account,
  grievance?.location_city,
].filter(Boolean).join(' ');

const fetchPoliticianSentimentSummary = async (entity) => {
  if (!entity) return EMPTY_SENTIMENT_SUMMARY;

  const constituency = entity.constituency?.trim().toLowerCase();

  if (constituency) {
    try {
      const response = await api.get('/grievances/location-summary', {
        params: { location_city: constituency },
      });
      const locationSummary = normalizeSentimentSummary(response.data);
      if (locationSummary.total > 0) return locationSummary;
    } catch {
      // Fall back to keyword and handle matching below.
    }
  }

  const keywordList = buildKeywordList(entity);
  const entityKeywords = getEntityKeywords(entity);
  const requests = [];

  // Every leader card used to fire up to CARD_SUMMARY_MAX_KEYWORDS+2 separate
  // full-collection-scan search requests, and this fetch runs once PER VISIBLE
  // LEADER in parallel — with a large party list that's hundreds of concurrent
  // regex scans on every page load. Handles and search terms are now each
  // batched into a single OR'd query (count=false since only the merged/scored
  // result set is used, not the backend total).
  const handles = entityKeywords.handles.slice(0, 2);
  if (handles.length) {
    requests.push(
      api.get('/grievances', {
        params: { posted_by_handle: handles, limit: CARD_SUMMARY_SEARCH_LIMIT, count: false },
      }).catch(() => ({ data: { grievances: [] } }))
    );
  }

  const handleSlots = handles.length * 2;
  const nameBudget = Math.max(1, CARD_SUMMARY_MAX_KEYWORDS - handleSlots);
  const nameTerms = keywordList
    .filter((keyword) => keyword.type === 'primary' || keyword.type === 'alias')
    .slice(0, nameBudget)
    .map((keyword) => keyword.term);
  const searchTerms = [...handles.map((h) => `@${h}`), ...nameTerms];

  if (searchTerms.length) {
    requests.push(
      api.get('/grievances', {
        params: { search: searchTerms, limit: CARD_SUMMARY_SEARCH_LIMIT * 2, count: false },
      }).catch(() => ({ data: { grievances: [] } }))
    );
  }

  if (constituency) {
    requests.push(
      api.get('/grievances', {
        params: {
          location_city: constituency,
          location: constituency,
          limit: CARD_SUMMARY_CONSTITUENCY_LIMIT,
          count: false,
        },
      }).catch(() => ({ data: { grievances: [] } }))
    );
  }

  if (!requests.length) return EMPTY_SENTIMENT_SUMMARY;

  try {
    const responses = await Promise.all(requests);
    const seen = new Set();
    const merged = [];

    responses.forEach((response) => {
      (response.data?.grievances || []).forEach((grievance) => {
        const identity = getGrievanceIdentity(grievance);
        if (!identity || seen.has(identity)) return;
        seen.add(identity);
        merged.push(grievance);
      });
    });

    const relevant = merged
      .map((grievance) => ({
        ...grievance,
        _relevanceScore: scoreRelevance(getGrievanceSearchText(grievance), keywordList),
      }))
      .filter((grievance) => grievance._relevanceScore > 0 && isGrievanceRelevant(grievance, entity));

    return summarizeGrievances(relevant);
  } catch {
    return EMPTY_SENTIMENT_SUMMARY;
  }
};

const CompactSentimentBar = ({ summary, accentColor, label }) => {
  const { positive, neutral, negative, total, segments } = buildSentimentBreakdown(summary);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="w-[104px] shrink-0 rounded-xl border bg-white/95 px-2.5 py-2 shadow-sm"
          style={{ borderColor: `${accentColor}30` }}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Sentiment
            </span>
            <span className="text-[9px] font-bold text-slate-800">{total}</span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
            {segments.map((segment) => (
              <div
                key={segment.key}
                className={segment.bgClass}
                style={{ width: `${segment.percentage}%` }}
                aria-hidden="true"
              />
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
            {segments.map((segment) => (
              <div key={segment.key} className="space-y-0.5">
                <p className="text-[7px] font-semibold uppercase tracking-wide text-slate-500">{segment.label}</p>
                <p className={`text-[9px] font-bold ${segment.textClass}`}>{segment.percentage}%</p>
              </div>
            ))}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 shadow-lg">
        <div className="space-y-1">
          <p className="font-semibold text-slate-900">{label}</p>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />+Ve</span>
            <span className="font-semibold">{positive} ({segments[0].percentage}%)</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Mod.</span>
            <span className="font-semibold">{neutral} ({segments[1].percentage}%)</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />-Ve</span>
            <span className="font-semibold">{negative} ({segments[2].percentage}%)</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-100 pt-1 text-slate-900">
            <span className="font-medium">Total</span>
            <span className="font-bold">{total}</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

const DroneViewStrip = () => {
  const [title, setTitle] = useState('Drone View');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('Drone View');
  const [linkInput, setLinkInput] = useState('');
  const [savedLink, setSavedLink] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [playerState, setPlayerState] = useState('idle'); // idle|loading|playing|error
  const [playerKey, setPlayerKey] = useState(0);
  const [fallbackLevel, setFallbackLevel] = useState(0); // 0-3

  // API key settings
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem(DRONE_API_KEY_STORAGE) || '');
  const [savedApiKey, setSavedApiKey] = useState(() => localStorage.getItem(DRONE_API_KEY_STORAGE) || '');
  const [apiKeySaved, setApiKeySaved] = useState(false);

  // Stream metadata from YouTube Data API
  const [streamMeta, setStreamMeta] = useState(null); // {title, thumbnail, viewers, isLive}
  const [metaLoading, setMetaLoading] = useState(false);

  const extractYouTubeId = (url) => {
    if (!url) return null;
    const patterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /\/(?:live|embed)\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const fetchStreamMeta = async (url, apiKey) => {
    const videoId = extractYouTubeId(url);
    if (!videoId || !apiKey) return null;
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails,statistics&id=${videoId}&key=${apiKey}`
      );
      const data = await res.json();
      if (data.error) return { error: data.error.message };
      const item = data.items?.[0];
      if (!item) return { error: 'Video not found — check the URL.' };
      const thumbs = item.snippet?.thumbnails;
      return {
        videoTitle: item.snippet?.title || '',
        thumbnail: thumbs?.maxres?.url || thumbs?.high?.url || thumbs?.medium?.url || thumbs?.default?.url || '',
        isLive: item.snippet?.liveBroadcastContent === 'live',
        isUpcoming: item.snippet?.liveBroadcastContent === 'upcoming',
        viewers: item.liveStreamingDetails?.concurrentViewers
          ? Number(item.liveStreamingDetails.concurrentViewers).toLocaleString()
          : null,
        channelTitle: item.snippet?.channelTitle || '',
      };
    } catch {
      return null; // silently ignore — still show player
    }
  };

  const handleSaveApiKey = () => {
    localStorage.setItem(DRONE_API_KEY_STORAGE, apiKeyInput.trim());
    setSavedApiKey(apiKeyInput.trim());
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  const isValidUrl = (url) => {
    try { new URL(url); return true; } catch { return false; }
  };

  const handleOpenModal = async () => {
    const url = linkInput.trim();
    if (!url) { setError('Please paste a stream URL'); return; }
    if (!isValidUrl(url)) { setError('Invalid URL — paste a full link starting with https://'); return; }
    setError('');
    setStreamMeta(null);
    setPlayerState('loading');
    setFallbackLevel(0);
    setPlayerKey(k => k + 1);
    setSavedLink(url);
    setShowModal(true);
    if (savedApiKey) {
      setMetaLoading(true);
      const meta = await fetchStreamMeta(url, savedApiKey);
      setStreamMeta(meta);
      setMetaLoading(false);
    }
  };

  const handleCloseModal = () => {
    setPlayerState('idle');
    setTimeout(() => { setShowModal(false); setStreamMeta(null); }, 50);
  };

  const handleTitleSave = () => {
    setTitle(titleInput.trim() || 'Drone View');
    setIsEditingTitle(false);
  };

  const handlePlayerReady = () => setPlayerState('playing');

  const handlePlayerError = () => {
    setFallbackLevel(prev => {
      const next = prev + 1;
      if (next >= 3) { setPlayerState('error'); }
      else { setPlayerKey(k => k + 1); setPlayerState('loading'); }
      return next;
    });
  };

  const videoId = extractYouTubeId(savedLink);
  const nocookieUrl = videoId ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1` : '';
  const standardEmbedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1` : '';

  return (
    <>
      {/* Strip */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl border border-sky-500/30 bg-gradient-to-r from-sky-500/10 via-sky-500/5 to-transparent shadow-sm">
        {/* Pulsing dot */}
        <div className="relative flex-shrink-0">
          <div className="h-2 w-2 rounded-full bg-sky-500" />
          <div className="absolute inset-0 h-2 w-2 rounded-full bg-sky-500 animate-ping opacity-75" />
        </div>

        <Video className="h-4 w-4 text-sky-500 flex-shrink-0" />

        {/* Editable title */}
        {isEditingTitle ? (
          <input
            value={titleInput}
            autoFocus
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSave();
              if (e.key === 'Escape') { setTitleInput(title); setIsEditingTitle(false); }
            }}
            className="text-sm font-semibold bg-transparent border-b border-sky-500/60 focus:outline-none focus:border-sky-500 w-32 text-sky-700 dark:text-sky-300"
          />
        ) : (
          <button onClick={() => { setTitleInput(title); setIsEditingTitle(true); }} className="flex items-center gap-1.5 group">
            <span className="text-sm font-semibold text-sky-700 dark:text-sky-300">{title}</span>
            <Pencil className="h-3 w-3 text-sky-400/50 group-hover:text-sky-500 transition-colors" />
          </button>
        )}

        <div className="h-4 w-px bg-border flex-shrink-0" />

        {/* URL input */}
        <div className="flex flex-1 min-w-0 items-center gap-2">
          <input
            value={linkInput}
            onChange={(e) => { setLinkInput(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleOpenModal()}
            placeholder="Paste live stream URL — YouTube, HLS (.m3u8), direct video..."
            className="flex-1 min-w-0 text-xs bg-background/60 border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500/40 focus:border-sky-500/50 placeholder:text-muted-foreground/50"
          />
          {error && <span className="text-[10px] text-rose-500 whitespace-nowrap hidden sm:inline">{error}</span>}
        </div>

        {/* Watch Live button */}
        <button
          onClick={handleOpenModal}
          disabled={!linkInput.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 shadow-sm"
        >
          <Play className="h-3 w-3 fill-current" />
          Watch Live
        </button>

        {/* Settings gear */}
        <button
          onClick={() => setShowSettings(s => !s)}
          className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${showSettings ? 'bg-sky-500/20 text-sky-600' : 'text-muted-foreground hover:text-sky-600 hover:bg-sky-500/10'
            }`}
          title="YouTube API Key settings"
        >
          <Settings className="h-4 w-4" />
        </button>

        {error && <span className="text-[10px] text-rose-500 sm:hidden w-full text-center">{error}</span>}

        {/* API Key settings panel */}
        {showSettings && (
          <div className="w-full flex items-center gap-2 pt-1 pb-0.5 border-t border-sky-500/20 mt-0.5">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">YouTube Data API v3 Key:</span>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
              placeholder="Paste your Google Console API key..."
              className="flex-1 text-xs bg-background/60 border border-border rounded-lg px-3 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500/40 focus:border-sky-500/50 placeholder:text-muted-foreground/40"
            />
            <button
              onClick={handleSaveApiKey}
              className="text-xs px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors whitespace-nowrap"
            >
              {apiKeySaved ? '✓ Saved' : 'Save Key'}
            </button>
            {savedApiKey && (
              <span className="text-[10px] text-emerald-600 whitespace-nowrap">✓ API key active</span>
            )}
          </div>
        )}
      </div>

      {/* Live Viewer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={handleCloseModal}>
          <div className="relative w-full max-w-4xl bg-card rounded-2xl shadow-2xl overflow-hidden border border-border/60" onClick={(e) => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-sky-500/15 to-transparent border-b border-border">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Thumbnail */}
                {streamMeta?.thumbnail && (
                  <img src={streamMeta.thumbnail} alt="" className="h-10 w-16 rounded object-cover flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {streamMeta?.isLive && (
                      <span className="flex items-center gap-1">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Live</span>
                      </span>
                    )}
                    {streamMeta?.isUpcoming && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Upcoming</span>
                    )}
                    {streamMeta?.viewers && (
                      <span className="text-[10px] text-white/60">{streamMeta.viewers} watching</span>
                    )}
                    {playerState === 'loading' && !streamMeta && (
                      <Loader2 className="h-3.5 w-3.5 text-sky-400 animate-spin" />
                    )}
                  </div>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {metaLoading
                      ? title
                      : (streamMeta?.videoTitle || title)}
                  </p>
                  {streamMeta?.channelTitle && (
                    <p className="text-[10px] text-muted-foreground truncate">{streamMeta.channelTitle}</p>
                  )}
                </div>
              </div>
              <button onClick={handleCloseModal} className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0 ml-2">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* API error notice (e.g. bad key) */}
            {streamMeta?.error && (
              <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[10px] text-amber-600">
                API: {streamMeta.error}
              </div>
            )}

            {/* Player — 16:9 */}
            <div className="relative w-full bg-black" style={{ paddingBottom: '56.25%' }}>
              <div className="absolute inset-0">

                {/* ── Level 0: ReactPlayer (uses nocookie URL for YouTube — recommended) ── */}
                {fallbackLevel === 0 && playerState !== 'error' && (
                  <ReactPlayer key={`rp-${playerKey}`}
                    url={nocookieUrl || savedLink}
                    playing={playerState === 'loading' || playerState === 'playing'}
                    controls width="100%" height="100%"
                    onReady={handlePlayerReady}
                    onError={handlePlayerError}
                    config={{
                      youtube: { playerVars: { autoplay: 1, rel: 0, modestbranding: 1, origin: window.location.origin } },
                      file: { forceHLS: savedLink.includes('.m3u8'), attributes: { autoPlay: true, controls: true } },
                    }}
                  />
                )}

                {/* ── Level 1: youtube-nocookie iframe ── */}
                {fallbackLevel === 1 && playerState !== 'error' && nocookieUrl && (
                  <iframe key={`nc-${playerKey}`}
                    src={nocookieUrl} title={title}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    onLoad={() => setPlayerState('playing')}
                    onError={handlePlayerError}
                  />
                )}

                {/* ── Level 2: standard YouTube embed iframe ── */}
                {fallbackLevel === 2 && playerState !== 'error' && standardEmbedUrl && (
                  <iframe key={`yt-${playerKey}`}
                    src={standardEmbedUrl} title={title}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    onLoad={() => setPlayerState('playing')}
                    onError={handlePlayerError}
                  />
                )}

                {/* ── Level 3 / final error: info card ── */}
                {(fallbackLevel >= 3 || playerState === 'error') && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black to-slate-900 gap-4 px-8 text-center">
                    {streamMeta?.thumbnail ? (
                      <div className="relative w-full max-w-sm">
                        <img src={streamMeta.thumbnail} alt="" className="w-full rounded-lg opacity-40" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="p-4 rounded-full bg-black/60 backdrop-blur-sm border border-white/10">
                            <Video className="h-10 w-10 text-white/60" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 rounded-full bg-slate-800 border border-white/10">
                        <Video className="h-12 w-12 text-white/30" />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <p className="text-base font-bold text-white">{streamMeta?.videoTitle || title}</p>
                      {streamMeta?.channelTitle && <p className="text-xs text-white/50">{streamMeta.channelTitle}</p>}
                      {streamMeta?.isLive && streamMeta?.viewers && (
                        <p className="text-xs text-red-400 font-medium">🔴 Live · {streamMeta.viewers} watching</p>
                      )}
                      <p className="text-[11px] text-white/30 mt-2 leading-relaxed">
                        Stream could not be embedded in-app.<br />
                        All 3 playback methods were attempted.
                      </p>
                    </div>
                    <button onClick={() => { setFallbackLevel(0); setPlayerState('loading'); setPlayerKey(k => k + 1); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <Play className="h-3 w-3 fill-current" /> Retry All
                    </button>
                  </div>
                )}

                {/* Loading overlay (levels 0–2) */}
                {playerState === 'loading' && fallbackLevel < 3 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 pointer-events-none gap-3">
                    <Loader2 className="h-10 w-10 text-sky-400 animate-spin" />
                    <span className="text-xs text-white/50">Trying method {fallbackLevel + 1} of 3…</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-2.5 bg-muted/30 border-t border-border flex items-center gap-3">
              <p className="text-[11px] text-muted-foreground truncate flex-1">{savedLink}</p>
              {fallbackLevel < 3 && playerState !== 'error' && (
                <div className="hidden sm:flex gap-1">
                  {[0, 1, 2].map(i => (
                    <button key={i}
                      onClick={() => { setFallbackLevel(i); setPlayerState('loading'); setPlayerKey(k => k + 1); }}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors ${fallbackLevel === i ? 'bg-sky-600 text-white' : 'bg-muted text-muted-foreground hover:bg-sky-500/10'}`}
                    >{['Auto', 'NoCookie', 'Embed'][i]}</button>
                  ))}
                </div>
              )}
              <button onClick={handleCloseModal} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors flex-shrink-0">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─── Ministers Panel ────────────────────────────────────────────────────────
const MinistersPanel = ({ selectedIds = new Set(), onToggle, onClearAll, selectedCount = 0 }) => {
  const { navigateToPoliticianGrievances } = usePoliticianNavigation();
  const { getMemberSentimentSummary, setMemberSentimentSummary } = useDashboard();
  const [activeParty, setActiveParty] = useState(PARTY_WISE_MLA_DIRECTORY[0]?.party || 'INC');
  // Seeded from the shared DashboardContext cache (which lives above the
  // router) so leaving Overview and coming back doesn't force every leader
  // card to refetch — only entries that are missing or stale get refetched.
  const [memberSentimentMap, setMemberSentimentMap] = useState(() => {
    const seeded = {};
    PARTY_WISE_MLA_DIRECTORY.forEach((group) => {
      group.members.forEach((member) => {
        const cached = getMemberSentimentSummary(member.id);
        if (cached != null) seeded[member.id] = cached;
      });
    });
    return seeded;
  });

  const activePartyGroup = useMemo(
    () => PARTY_WISE_MLA_DIRECTORY.find((group) => group.party === activeParty) || PARTY_WISE_MLA_DIRECTORY[0],
    [activeParty]
  );

  const selectableCount = activePartyGroup.members.filter((member) => member.selectable).length;
  const sortedMembers = useMemo(() => {
    const originalOrder = new Map(activePartyGroup.members.map((member, index) => [member.id, index]));

    return [...activePartyGroup.members].sort((a, b) => {
      const aPinned = (a.linkedProfile?.id || a.id) === 'revanth-reddy';
      const bPinned = (b.linkedProfile?.id || b.id) === 'revanth-reddy';
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      const aTotal = Number(memberSentimentMap[a.id]?.total || 0);
      const bTotal = Number(memberSentimentMap[b.id]?.total || 0);
      const aHasData = aTotal > 0;
      const bHasData = bTotal > 0;

      if (aHasData !== bHasData) return aHasData ? -1 : 1;
      if (aHasData && bHasData && aTotal !== bTotal) return bTotal - aTotal;

      return (originalOrder.get(a.id) || 0) - (originalOrder.get(b.id) || 0);
    });
  }, [activePartyGroup.members, memberSentimentMap]);

  useEffect(() => {
    const membersToFetch = activePartyGroup.members.filter((member) => (
      member.selectable &&
      member.constituency &&
      memberSentimentMap[member.id] == null
    ));

    if (!membersToFetch.length) return undefined;

    let cancelled = false;

    Promise.all(
      membersToFetch.map(async (member) => {
        const summary = await fetchPoliticianSentimentSummary(member);
        return [member.id, summary];
      })
    ).then((entries) => {
      if (cancelled) return;
      entries.forEach(([id, summary]) => setMemberSentimentSummary(id, summary));
      setMemberSentimentMap((prev) => {
        const next = { ...prev };
        entries.forEach(([id, summary]) => {
          next[id] = summary;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activePartyGroup, memberSentimentMap]);

  return (
    <Card className="border border-border/50 shadow-sm overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3 border-b border-border/30 bg-gradient-to-r ${activePartyGroup.accent}`}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ background: `${activePartyGroup.color}18` }}>
            <Users className="h-3.5 w-3.5" style={{ color: activePartyGroup.color }} />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">MLAs & Party Leaders</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                {selectedCount} selected
              </span>
              <button
                onClick={onClearAll}
                className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted transition-colors"
              >
                Clear all
              </button>
            </>
          )}
          <div className="flex items-center gap-1 rounded-full border px-2 py-0.5"
            style={{ borderColor: `${activePartyGroup.color}35`, background: `${activePartyGroup.color}10`, color: activePartyGroup.color }}>
            <span className="text-[10px] font-semibold">{activePartyGroup.label}</span>
            <span className="text-[10px] opacity-75">{activePartyGroup.members.length}</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-border/30 bg-muted/20">
        <div className="flex flex-wrap gap-2">
          {PARTY_WISE_MLA_DIRECTORY.map((group) => {
            const isActive = group.party === activeParty;
            return (
              <button
                key={group.party}
                onClick={() => setActiveParty(group.party)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-all ${isActive ? 'text-white shadow-sm' : 'text-muted-foreground hover:text-foreground bg-background'
                  }`}
                style={isActive ? { background: group.color, borderColor: group.color } : { borderColor: `${group.color}30` }}
              >
                {group.label} · {group.members.length}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 bg-background/70">
        <div>
          <p className="text-[11px] font-semibold text-foreground">{activePartyGroup.fullName}</p>
        </div>
        <span className="text-[10px] font-medium text-muted-foreground">
          {activePartyGroup.members.length} members
        </span>
      </div>

      {/* Party-wise MLA grid */}
      <div className="max-h-[380px] overflow-y-auto p-4 custom-scrollbar">
        <TooltipProvider delayDuration={100}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {sortedMembers.map((member) => {
              const isSelected = selectedIds.has(member.id);
              const isSelectable = member.selectable;
              const linkedProfile = member.linkedProfile;
              const sentimentSummary = memberSentimentMap[member.id] || { total: 0, positive: 0, neutral: 0, negative: 0 };
              const positionText = member.department
                || (member.role === 'Chief Minister' || member.role === 'Deputy Chief Minister' ? member.role : 'MLA');

              return (
                <button
                  key={member.id}
                  type="button"
                  disabled={!isSelectable}
                  onClick={() => isSelectable && onToggle(linkedProfile)}
                  className={`flex min-h-[220px] flex-col gap-3 rounded-xl border bg-card p-3 text-left transition-all duration-200 relative overflow-hidden ${isSelected
                    ? 'border-2 shadow-lg scale-[1.02] cursor-pointer'
                    : isSelectable
                      ? 'border-border/50 hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
                      : 'border-border/40 opacity-95 cursor-default'
                    }`}
                  style={isSelected ? { borderColor: member.color, boxShadow: `0 4px 20px ${member.color}25` } : undefined}
                >

                  <div className="flex items-start justify-between gap-2">
                    <div className="relative mt-1">
                      <div
                        className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-offset-2 transition-all"
                        style={{ ringColor: member.color, borderColor: member.color }}
                      >
                        <Avatar className="w-full h-full">
                          <AvatarImage
                            src={member.image}
                            alt={member.shortName}
                            className="object-cover object-top"
                          />
                          <AvatarFallback
                            className="text-white text-base font-bold"
                            style={{ background: member.color }}
                          >
                            {getMinisterInitials(member.shortName)}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </div>
                    <CompactSentimentBar
                      summary={sentimentSummary}
                      accentColor={member.color}
                      label={`${member.shortName} sentiment`}
                    />
                  </div>

                  {/* Name */}
                  <div className="w-full">
                    <p className="text-[11px] font-bold text-foreground leading-tight line-clamp-2 min-h-[28px]">
                      {member.shortName}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight line-clamp-1 min-h-[12px]">
                      {positionText || '\u00A0'}
                    </p>
                  </div>

                  {/* Role tag badge — Chief Minister / IT Minister etc. */}
                  {member.roleTag && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold text-white tracking-wide"
                      style={{ background: member.color }}
                    >
                      {member.roleTag}
                    </span>
                  )}

                  {/* Constituency / party chip */}
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-semibold w-full justify-center"
                    style={{ borderColor: `${member.color}40`, color: member.color, background: `${member.color}10` }}
                  >
                    <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                    <span className="truncate">{member.constituency || member.party}</span>
                  </div>

                  <div className="mt-auto w-full">
                    {member.district && (
                      <p className="text-[9px] text-muted-foreground text-center line-clamp-1 mb-1">
                        {member.district}
                      </p>
                    )}
                  </div>

                  {/* Selected indicator + View Grievances */}
                  {isSelected && (
                    <div className="w-full flex flex-col gap-1">
                      <div className="w-full text-[9px] font-semibold py-0.5 rounded-lg text-center text-white"
                        style={{ background: member.color }}>
                        Selected ✓
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToPoliticianGrievances(linkedProfile);
                        }}
                        className="w-full text-[9px] font-semibold py-0.5 rounded-lg text-center border transition-colors hover:opacity-80"
                        style={{ borderColor: member.color, color: member.color, background: `${member.color}10` }}
                      >
                        View Grievances →
                      </button>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </TooltipProvider>
      </div>

    </Card>
  );
};

// ─── Mini Sentiment Donut (for minister detail panel) ───────────────────────
const MiniSentimentPie = ({ positive = 0, negative = 0, neutral = 0 }) => {
  const total = positive + negative + neutral;
  if (total === 0) return <div className="text-xs text-muted-foreground italic text-center py-4">No data</div>;
  const data = [
    { name: 'Positive', value: positive, color: '#10b981' },
    { name: 'Neutral', value: neutral, color: '#f59e0b' },
    { name: 'Negative', value: negative, color: '#ef4444' },
  ].filter(d => d.value > 0);
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-[68px] w-[68px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius="58%" outerRadius="88%" paddingAngle={2} strokeWidth={0}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[13px] font-bold text-foreground leading-none">{total}</span>
          <span className="text-[7px] text-muted-foreground">total</span>
        </div>
      </div>
      <div className="flex-1 space-y-0.5">
        {[
          { label: '+Ve', value: positive, color: '#10b981' },
          { label: 'Mixed', value: neutral, color: '#f59e0b' },
          { label: '-Ve', value: negative, color: '#ef4444' },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between text-[9px]">
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: row.color }} />
              <span className="text-muted-foreground">{row.label}</span>
            </div>
            <span className="font-bold" style={{ color: row.color }}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Minister Detail Panel (shows in dashboard when minister is selected) ────
const MinisterDetailPanel = ({ minister }) => {
  // Uses the same keyword-based pipeline as the Grievances page so counts always match
  const { grievances, loading: grievancesLoading, total } = usePoliticianGrievances(
    minister || null,
    MDP_FILTERS,
    MDP_OPTIONS
  );

  const { sentiment, categories } = useMemo(() => {
    if (!grievances.length) return { sentiment: { positive: 0, neutral: 0, negative: 0 }, categories: [] };
    const sent = { positive: 0, neutral: 0, negative: 0 };
    const topicMap = {};
    grievances.forEach(g => {
      const s = (g.sentiment || '').toLowerCase();
      if (s === 'positive') sent.positive++;
      else if (s === 'negative') sent.negative++;
      else sent.neutral++;
      const cat = g.grievance_type || g.category;
      if (cat) topicMap[cat] = (topicMap[cat] || 0) + 1;
    });
    const cats = Object.entries(topicMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { sentiment: sent, categories: cats };
  }, [grievances]);

  if (!minister) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Minister identity card */}
      <Card className="overflow-hidden border-0 shadow-md">
        <div className="relative h-[200px]">
          <Avatar className="w-full h-full rounded-none">
            <AvatarImage src={minister.image} alt={minister.shortName} className="object-cover object-top w-full h-full rounded-none" />
            <AvatarFallback className="w-full h-full rounded-none text-5xl font-black text-white" style={{ background: minister.color }}>
              {getMinisterInitials(minister.shortName)}
            </AvatarFallback>
          </Avatar>
          <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${minister.color}ee 0%, ${minister.color}20 50%, transparent 100%)` }} />
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p className="text-base font-black text-white leading-tight drop-shadow">{minister.shortName}</p>
            <p className="text-white/80 text-[11px] mt-0.5">{minister.role}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-semibold border border-white/30">
                <MapPin className="h-2 w-2" />{minister.constituency}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Sentiment */}
      <Card className="p-3 border-0 shadow-sm">
        <p className="text-[11px] font-semibold text-foreground mb-2">Sentiment Analysis</p>
        {grievancesLoading ? (
          <div className="flex items-center justify-center h-12">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <MiniSentimentPie {...sentiment} />
        )}
      </Card>

      {/* Stats */}
      <Card className="p-3 border-0 shadow-sm">
        <p className="text-[11px] font-semibold text-foreground mb-2">Grievance Summary</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: 'Total', value: total, bg: 'bg-blue-50', text: 'text-blue-700' },
            { label: '+Ve', value: sentiment.positive, bg: 'bg-green-50', text: 'text-green-700' },
            { label: 'Mixed', value: sentiment.neutral, bg: 'bg-amber-50', text: 'text-amber-700' },
            { label: '-Ve', value: sentiment.negative, bg: 'bg-red-50', text: 'text-red-700' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-lg p-2 text-center`}>
              <div className={`text-base font-bold ${s.text}`}>{s.value}</div>
              <div className={`text-[9px] ${s.text} opacity-70 font-medium`}>{s.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Topics */}
      {!grievancesLoading && categories.length > 0 && (
        <Card className="p-3 border-0 shadow-sm">
          <p className="text-[11px] font-semibold text-foreground mb-2">Top Topics</p>
          <div className="space-y-1">
            {categories.map(([cat, cnt]) => (
              <div key={cat} className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground truncate flex-1">{cat}</span>
                <span className="font-bold text-foreground ml-2">{cnt}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

// ─── Public Opinion Highlights ──────────────────────────────────────────────
// Emerging Issues / Fake News / Department-wise Sentiment / Constituency-wise
// Analysis — every row is a count derived from existing grievance content and
// links through to the matching filtered view on the Grievances page.
const SentimentMiniBar = ({ positive = 0, neutral = 0, negative = 0 }) => {
  const total = positive + neutral + negative;
  if (total === 0) return null;
  return (
    <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-slate-100">
      {positive > 0 && <div className="bg-emerald-500" style={{ width: `${(positive / total) * 100}%` }} />}
      {neutral > 0 && <div className="bg-amber-400" style={{ width: `${(neutral / total) * 100}%` }} />}
      {negative > 0 && <div className="bg-red-500" style={{ width: `${(negative / total) * 100}%` }} />}
    </div>
  );
};

const PublicOpinionHighlights = ({ data }) => {
  if (!data) return null;

  const emergingIssues = data.emergingIssues || [];
  const departmentSentiment = data.departmentSentiment || [];
  const constituencySentiment = data.constituencySentiment || [];
  const fakeNewsCount = data.fakeNews?.count || 0;

  return (
    <Card className="border border-border/50 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-gradient-to-r from-indigo-500/10 to-transparent">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-100 rounded-lg">
            <TrendingUp className="h-3.5 w-3.5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">Public Opinion</h3>
            <p className="text-[10px] text-muted-foreground">Click any item to see the matching posts</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border/30">
        {/* Emerging Issues */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <TrendingUp className="h-3.5 w-3.5 text-violet-600" />
            <h4 className="text-[12px] font-semibold text-foreground">Emerging Issues</h4>
            <span className="text-[9px] text-muted-foreground">(last 7 days)</span>
          </div>
          {emergingIssues.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No topic activity this week</p>
          ) : (
            <div className="space-y-1.5">
              {emergingIssues.map((issue) => (
                <Link
                  key={issue.type}
                  to={`/grievances?grievance_type=${encodeURIComponent(issue.type)}`}
                  className="flex items-center justify-between gap-2 group rounded-md px-1.5 py-1 -mx-1.5 hover:bg-violet-50 transition-colors"
                >
                  <span className="text-[11px] text-foreground truncate group-hover:text-violet-700">{issue.type}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] font-bold text-foreground tabular-nums">{issue.count}</span>
                    {issue.growthPct > 0 && (
                      <span className="text-[9px] font-semibold text-emerald-600">+{issue.growthPct}%</span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Fake News */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
            <h4 className="text-[12px] font-semibold text-foreground">Fake News</h4>
          </div>
          <Link
            to="/grievances?flag=fake_news"
            className="flex flex-col items-start gap-1 group rounded-md px-1.5 py-1 -mx-1.5 hover:bg-red-50 transition-colors"
          >
            <span className="text-2xl font-bold text-red-600 tabular-nums">{fakeNewsCount}</span>
            <span className="text-[10px] text-muted-foreground group-hover:text-red-600">
              posts flagged &middot; view all
            </span>
          </Link>
          <p className="text-[9px] text-muted-foreground/70 mt-3">Keyword-based signal, not verified fact-checking</p>
        </div>

        {/* Department-wise Sentiment */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Building2 className="h-3.5 w-3.5 text-blue-600" />
            <h4 className="text-[12px] font-semibold text-foreground">Department-wise Sentiment</h4>
          </div>
          {departmentSentiment.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No department data yet</p>
          ) : (
            <div className="space-y-2">
              {departmentSentiment.map((row) => (
                <Link
                  key={row.department}
                  to={`/grievances?department=${encodeURIComponent(row.department)}`}
                  className="block group rounded-md px-1.5 py-1 -mx-1.5 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[11px] text-foreground truncate group-hover:text-blue-700">{row.department}</span>
                    <span className="text-[11px] font-bold text-foreground tabular-nums shrink-0">{row.total}</span>
                  </div>
                  <SentimentMiniBar positive={row.positive} neutral={row.neutral} negative={row.negative} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Constituency-wise Analysis */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Landmark className="h-3.5 w-3.5 text-amber-600" />
            <h4 className="text-[12px] font-semibold text-foreground">Constituency-wise Analysis</h4>
          </div>
          {constituencySentiment.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No constituency data yet</p>
          ) : (
            <div className="space-y-2">
              {constituencySentiment.slice(0, 6).map((row) => (
                <Link
                  key={row.constituency}
                  to={`/grievances?location_constituency=${encodeURIComponent(row.constituency)}`}
                  className="block group rounded-md px-1.5 py-1 -mx-1.5 hover:bg-amber-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[11px] text-foreground truncate group-hover:text-amber-700">{row.constituency}</span>
                    <span className="text-[11px] font-bold text-foreground tabular-nums shrink-0">{row.total}</span>
                  </div>
                  <SentimentMiniBar positive={row.positive} neutral={row.neutral} negative={row.negative} />
                </Link>
              ))}
            </div>
          )}
          <p className="text-[9px] text-muted-foreground/70 mt-2">{data.meta?.constituencyCoverageNote}</p>
        </div>
      </div>
    </Card>
  );
};

const Dashboard = () => {
  const { dashboardData, loading, fetchDashboardData, refreshDashboard, hasCachedData } = useDashboard();
  const { navigateToPoliticianGrievances } = usePoliticianNavigation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Revanth Reddy is selected by default every time the Overview tab loads.
  const [selectedMinister, setSelectedMinister] = useState(() => getMinisterById('revanth-reddy'));

  const toggleMinister = useCallback((minister) => {
    setSelectedMinister((prev) => (prev?.id === minister.id ? null : minister));
  }, []);

  const [alertType, setAlertType] = useState('active');
  const [alertPlatform, setAlertPlatform] = useState('all');
  const [reportPlatform, setReportPlatform] = useState('all');
  const [reportStatus, setReportStatus] = useState('all');
  const [grievancePlatform, setGrievancePlatform] = useState('all');
  const [grievanceStatus, setGrievanceStatus] = useState('all');

  // Extract data from context
  const alertData = dashboardData?.alertData || {};
  const reportData = dashboardData?.reportData || {};
  const grievanceData = dashboardData?.grievanceData || {};
  const alertPendingReportData = dashboardData?.alertPendingReportData || {};
  const sentimentAnalytics = dashboardData?.sentimentAnalytics || null;
  const categoryAnalytics = dashboardData?.categoryAnalytics || null;
  const publicOpinion = dashboardData?.publicOpinion || null;

  useEffect(() => {
    fetchDashboardData();
    const timer = setInterval(() => {
      refreshDashboard();
    }, 15000);
    return () => clearInterval(timer);
  }, [fetchDashboardData, refreshDashboard]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshDashboard();
    setIsRefreshing(false);
  };

  if (loading && !hasCachedData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-violet-500/20 border-t-violet-600"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Shield className="h-5 w-5 text-violet-600 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const ALERT_TYPES = [
    { id: 'active', label: 'Active Alerts' },
    { id: 'acknowledged', label: 'Acknowledged Alerts' },
    { id: 'false_positive', label: 'False Positive Alerts' },
    { id: 'escalated', label: 'Escalated Alerts' },
  ];

  const getAlertCount = () => {
    const typeData = alertData?.[alertType] || alertData?.active || {};
    return typeData[alertPlatform] ?? typeData.all ?? 0;
  };

  const getEscalatedPendingCount = () => alertPendingReportData?.[alertPlatform] ?? alertPendingReportData?.all ?? 0;
  const getEscalatedGeneratedCount = () => {
    const total = alertData?.escalated?.[alertPlatform] ?? alertData?.escalated?.all ?? 0;
    return Math.max(0, total - getEscalatedPendingCount());
  };

  const getGrievanceCount = () => {
    const data = grievanceData?.[grievancePlatform] || grievanceData?.all || {};
    if (grievanceStatus === 'pending') return data.pending ?? 0;
    if (grievanceStatus === 'resolved') return data.resolved ?? 0;
    return data.total ?? 0;
  };

  const getReportCount = () => {
    const data = reportData?.[reportPlatform] || reportData?.all || {};
    if (reportStatus === 'sent_to_intermediary') return data.sent_to_intermediary || 0;
    if (reportStatus === 'closed') return data.closed || 0;
    return data.total || 0;
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300" data-testid="dashboard">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Ministers Panel */}
      <MinistersPanel
        selectedIds={new Set(selectedMinister ? [selectedMinister.id] : [])}
        onToggle={toggleMinister}
        onClearAll={() => setSelectedMinister(null)}
        selectedCount={selectedMinister ? 1 : 0}
      />

      {/* Grievance Sentiment Analytics */}
      {sentimentAnalytics && (() => {
        const dist = sentimentAnalytics.distribution || {};
        const total = (dist.positive || 0) + (dist.neutral || 0) + (dist.negative || 0);
        const profiles = sentimentAnalytics.topNegative || [];
        const maxCount = profiles.length > 0 ? profiles[0].count : 1;
        if (total === 0 && profiles.length === 0) return null;

        const pieData = [
          { name: 'Positive', value: dist.positive || 0, color: '#10b981' },
          { name: 'Moderate', value: dist.neutral || 0, color: '#f59e0b' },
          { name: 'Negative', value: dist.negative || 0, color: '#ef4444' }
        ].filter(d => d.value > 0);

        const sentimentRows = [
          { key: 'positive', label: '+Ve', value: dist.positive || 0, color: '#10b981', barBg: 'bg-emerald-500', trackBg: 'bg-emerald-100', sentiment: 'positive' },
          { key: 'medium', label: 'Mixed', value: dist.neutral || 0, color: '#f59e0b', barBg: 'bg-amber-400', trackBg: 'bg-amber-100', sentiment: 'neutral' },
          { key: 'negative', label: '-Ve', value: dist.negative || 0, color: '#ef4444', barBg: 'bg-red-500', trackBg: 'bg-red-100', sentiment: 'negative' }
        ];

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* ── Tile 1: Sentiment Distribution ── */}
            <Card className="border border-border/50 shadow-sm hover:shadow-md transition-all overflow-hidden lg:col-span-4 lg:order-2">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-violet-100 rounded-lg">
                    <Shield className="h-3.5 w-3.5 text-violet-600" />
                  </div>
                  <h3 className="text-[13px] font-semibold text-foreground">Sentiment Analysis</h3>
                </div>
                <Link to="/grievances" className="text-[11px] text-violet-600 hover:text-violet-700 font-medium flex items-center gap-0.5 transition-colors">
                  View All <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="p-4 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-5">
                {/* Donut — large */}
                <div className="relative shrink-0 w-[160px] h-[160px] sm:w-[190px] sm:h-[190px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" paddingAngle={3} strokeWidth={0}>
                        {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value, name) => [`${value} (${total ? Math.round(value / total * 100) : 0}%)`, name]}
                        contentStyle={{ fontSize: '11px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '6px 10px' }}
                        wrapperStyle={{ zIndex: 1000 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
                    <p className="text-2xl sm:text-3xl font-bold text-foreground leading-none">{total}</p>
                    <p className="text-[8px] sm:text-[9px] text-muted-foreground uppercase tracking-widest mt-1">Analyzed</p>
                  </div>
                </div>
                {/* Breakdown */}
                <div className="w-full sm:w-[190px] space-y-2">
                  {sentimentRows.map(row => {
                    const pct = total ? Math.round(row.value / total * 100) : 0;
                    return (
                      <Link key={row.key} to={`/grievances?sentiment=${row.sentiment}`} className="block group">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                            <span className="text-[12px] font-medium text-foreground">{row.label}</span>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm font-bold tabular-nums" style={{ color: row.color }}>{row.value}</span>
                            <span className="text-[10px] text-muted-foreground font-medium">({pct}%)</span>
                          </div>
                        </div>
                        <div className={`h-1.5 sm:h-2 rounded-full overflow-hidden ${row.trackBg} group-hover:opacity-80 transition-opacity`}>
                          <div className={`h-full rounded-full transition-all duration-700 ease-out ${row.barBg}`} style={{ width: `${pct}%` }} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Constituency Map / Minister Detail */}
            {selectedMinister ? (
              /* ── One or more MLAs selected ── */
              <div className="lg:col-span-8 lg:order-1 border border-border/50 rounded-xl overflow-hidden shadow-sm"
                style={{ borderColor: `${selectedMinister.color}40` }}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30"
                  style={{ background: `linear-gradient(to right, ${selectedMinister.color}12, transparent)` }}>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg" style={{ background: `${selectedMinister.color}20` }}>
                      <BarChart3 className="h-3.5 w-3.5" style={{ color: selectedMinister.color }} />
                    </div>
                    <h3 className="text-[13px] font-semibold text-foreground">
                      {selectedMinister.constituency} Constituency
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigateToPoliticianGrievances(selectedMinister)}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded hover:opacity-80 transition-opacity text-white"
                      style={{ background: selectedMinister.color }}
                    >
                      View Grievances →
                    </button>
                    <button onClick={() => setSelectedMinister(null)} className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted transition-colors">✕ Clear</button>
                  </div>
                </div>
                <div className="flex gap-0 bg-white dark:bg-background" style={{ height: '480px' }}>
                  {/* Left: detail panel */}
                  <div className="w-[190px] flex-shrink-0 overflow-y-auto p-2.5 border-r border-border/30 custom-scrollbar">
                    <MinisterDetailPanel minister={selectedMinister} />
                  </div>
                  {/* Right: map */}
                  <div className="flex-1 min-w-0">
                    <TelanganaMap embedded highlightMinister={selectedMinister} />
                  </div>
                </div>
              </div>
            ) : (
              /* ── Default: neutral constituency map ── */
              <Card className="border border-border/50 shadow-sm hover:shadow-md transition-all overflow-hidden lg:col-span-8 lg:order-1">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-slate-100 rounded-lg">
                      <BarChart3 className="h-3.5 w-3.5 text-slate-500" />
                    </div>
                    <h3 className="text-[13px] font-semibold text-foreground">Telangana Constituencies</h3>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">Select a mapped MLA to view constituency</span>
                </div>
                <div className="flex items-center justify-center bg-white dark:bg-slate-950/20">
                  <div className="w-full h-[480px]">
                    <TelanganaMap embedded />
                  </div>
                </div>
              </Card>
            )}
          </div>
        );
      })()}

      {/* Public Opinion Highlights */}
      <PublicOpinionHighlights data={publicOpinion} />

      {/* Combined Analytics & Alerts Grid */}
      <TooltipProvider>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[280px] overflow-hidden">

          {/* Col 1-2: Grievance Analytics (Pie) */}
          <div className={`${categoryAnalytics ? 'lg:col-span-2' : 'hidden'} h-[280px] overflow-hidden`}>
            {categoryAnalytics && (() => {
              const rawTopics = categoryAnalytics.topics || [];
              const canonicalizeTopicName = (name) => {
                const original = String(name || '').trim();
                if (!original) return '';
                const normalized = original
                  .replace(/[_-]+/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .toLowerCase();

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

              const mergedTopicMap = rawTopics.reduce((acc, topic) => {
                const normalizedName = canonicalizeTopicName(topic?.name);
                const count = Number(topic?.count) || 0;
                if (!normalizedName || count <= 0) return acc;
                acc[normalizedName] = (acc[normalizedName] || 0) + count;
                return acc;
              }, {});
              const topics = Object.entries(mergedTopicMap)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);
              const total = topics.reduce((s, t) => s + t.count, 0);

              if (topics.length === 0) return null;

              const TOPIC_COLORS = {
                'Political Criticism': '#8b5cf6', 'Hate Speech': '#ef4444', 'Public Complaint': '#3b82f6',
                'Corruption Complaint': '#f97316', 'General Complaint': '#10b981', 'Traffic Complaint': '#f59e0b',
                'Public Nuisance': '#f43f5e', 'Road & Infrastructure': '#eab308', 'Law & Order': '#6366f1'
              };

              const pieData = topics.map(t => ({
                name: t.name, value: t.count, color: TOPIC_COLORS[t.name] || '#6b7280'
              }));

              return (
                <Card className="border border-border/50 shadow-sm hover:shadow-md transition-all overflow-hidden h-full flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-violet-100 rounded-lg">
                        <BarChart3 className="h-3.5 w-3.5 text-violet-600" />
                      </div>
                      <h3 className="text-[13px] font-semibold text-foreground">Grievance Analytics</h3>
                      <span className="text-[10px] text-muted-foreground ml-1">({total} total)</span>
                    </div>
                    <Link to="/grievances" className="text-[11px] text-violet-600 hover:text-violet-700 font-medium flex items-center gap-0.5 transition-colors">
                      View <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  <div className="p-2 flex flex-row items-center gap-2 flex-1 min-h-0">
                    {/* Left Half: Big Pie Chart */}
                    <div className="relative w-1/2 h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius="50%" outerRadius="80%" paddingAngle={2} strokeWidth={0}>
                            {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <RechartsTooltip
                            formatter={(value, name) => [`${value} (${total ? Math.round(value / total * 100) : 0}%)`, name]}
                            contentStyle={{ fontSize: '11px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '6px 10px' }}
                            wrapperStyle={{ zIndex: 1000 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <p className="text-2xl font-bold text-foreground leading-none">{total}</p>
                        <p className="text-[8px] text-muted-foreground uppercase tracking-widest mt-1">Grievances</p>
                      </div>
                    </div>

                    {/* Right Half: Category list */}
                    <div className="w-1/2 space-y-1 h-full overflow-y-auto pl-1 pr-1 custom-scrollbar">
                      {topics.map((topic) => {
                        const pct = total ? Math.round(topic.count / total * 100) : 0;
                        const color = TOPIC_COLORS[topic.name] || '#6b7280';
                        return (
                          <Link
                            key={topic.name}
                            to={`/grievances?grievance_type=${encodeURIComponent(topic.name)}`}
                            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-violet-50 dark:hover:bg-violet-500/5 transition-colors group cursor-pointer"
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-[11px] font-medium text-foreground flex-1 truncate group-hover:text-violet-700 transition-colors">
                              {topic.name}
                            </span>
                            <span className="text-[10px] font-bold tabular-nums text-right" style={{ color }}>{pct}%</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              );
            })()}
          </div>

          {/* Col 3: Alerts Card */}
          <div className={`${categoryAnalytics ? 'lg:col-span-1' : 'lg:col-span-3'} h-[280px] overflow-hidden`}>
            <Card className="bg-gradient-to-br from-card via-card to-rose-500/5 border border-border/50 shadow-sm hover:shadow-lg transition-all overflow-hidden h-full flex flex-col">
              <div className="p-4 border-b border-border/50 bg-gradient-to-r from-rose-500/10 to-transparent shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-rose-500/10 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    </div>
                    <Link to={`/alerts?status=${alertType}`} className="text-xs font-semibold hover:underline">
                      Alerts
                    </Link>
                  </div>
                  <div className="relative">
                    <select
                      value={alertType}
                      onChange={(e) => setAlertType(e.target.value)}
                      className="appearance-none bg-transparent text-[11px] font-medium text-muted-foreground cursor-pointer focus:outline-none text-right pr-4"
                    >
                      {ALERT_TYPES.map((type) => (
                        <option key={type.id} value={type.id}>{type.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-4xl font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent leading-none">{getAlertCount()}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Total {alertType.replace('_', ' ')}</p>
                  </div>
                  {alertType === 'escalated' && (
                    <div className="text-[10px] text-right text-muted-foreground">
                      <p>Gen: {getEscalatedGeneratedCount()}</p>
                      <p>Pend: {getEscalatedPendingCount()}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-2 border-b border-border/50 shrink-0">
                <div className="flex items-center gap-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Platform</p>
                  <div className="relative flex-1">
                    <select
                      value={alertPlatform}
                      onChange={(e) => setAlertPlatform(e.target.value)}
                      className="appearance-none bg-transparent text-xs font-medium text-foreground cursor-pointer focus:outline-none w-full pr-5"
                    >
                      {PLATFORMS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="p-2 flex gap-2 flex-1 items-stretch min-h-0">
                {ALERT_TYPES.filter(t => t.id !== alertType).slice(0, 3).map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setAlertType(type.id)}
                    className="flex-1 flex flex-col items-center justify-center text-center py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors hover:bg-rose-500/5 rounded border border-transparent hover:border-rose-100"
                  >
                    <span className="block text-sm font-bold text-foreground">{alertData[type.id]?.all || 0}</span>
                    <span className="scale-90 opacity-80 leading-tight">{type.label.replace(' Alerts', '').replace(' Posts', '')}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </TooltipProvider>

    </div >
  );
};

export default Dashboard;
