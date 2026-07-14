import React from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
    Heart, MessageCircle, Repeat2, BarChart3, Bookmark,
    BadgeCheck, Play, Download, Loader2, Eye, Shield, Tag, MapPin, AlertTriangle, Trash2
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { normalizeMediaList } from '../AlertCards';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';

const SPECIAL_ACCESS_EMAIL = 'sreenu@gmail.com';
const GlobeIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={className}>
        <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.6 8a6.4 6.4 0 0 1 12.8 0 6.4 6.4 0 0 1-12.8 0z" />
        <path d="M8 1.5c-1.5 0-2.8 2.9-2.8 6.5s1.3 6.5 2.8 6.5 2.8-2.9 2.8-6.5S9.5 1.5 8 1.5z" />
        <path d="M1.5 8h13M2 5h12M2 11h12" stroke="currentColor" strokeWidth="0.8" fill="none" />
    </svg>
);
const ThumbsUpIcon = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
    </svg>
);
const ShareFBIcon = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
    </svg>
);

/* ─── Platform Logo Icons ─── */
const XPlatformLogo = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);
const FacebookPlatformLogo = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
);
const WhatsAppPlatformLogo = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);
const InstagramPlatformLogo = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
);
const YouTubePlatformLogo = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
);

const PlatformBadge = ({ platform }) => {
    const p = (platform || 'x').toLowerCase();
    if (p === 'x' || p === 'twitter') {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black text-white">
                <XPlatformLogo className="h-2.5 w-2.5" />
                X
            </span>
        );
    }
    if (p === 'facebook') {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#1877F2] text-white">
                <FacebookPlatformLogo className="h-2.5 w-2.5" />
                Facebook
            </span>
        );
    }
    if (p === 'whatsapp') {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#25D366] text-white">
                <WhatsAppPlatformLogo className="h-2.5 w-2.5" />
                WhatsApp
            </span>
        );
    }
    if (p === 'instagram') {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded text-white" style={{ background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}>
                <InstagramPlatformLogo className="h-2.5 w-2.5" />
                Instagram
            </span>
        );
    }
    if (p === 'youtube') {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FF0000] text-white">
                <YouTubePlatformLogo className="h-2.5 w-2.5" />
                YouTube
            </span>
        );
    }
    return null;
};

/* ─── Helpers ─── */
const formatCount = (n) => {
    if (!n || n === 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
};
const timeAgo = (date) => {
    if (!date) return '';
    try { return formatDistanceToNowStrict(new Date(date), { addSuffix: false }); } catch { return ''; }
};
const formatFullDate = (date) => {
    if (!date) return '';
    try { return format(new Date(date), "h:mm a · MMM d, yyyy"); } catch { return ''; }
};
const highlightMentions = (text) => {
    if (!text) return null;
    return text.split(/([@#]\w+)/g).map((part, i) =>
        part.startsWith('@') || part.startsWith('#')
            ? <span key={i} className="text-[#1d9bf0] hover:underline cursor-pointer">{part}</span>
            : <span key={i}>{part}</span>
    );
};

const ActionButtons = ({ grievance, onAction, isDownloading = false, enableSpecialActions = false }) => {
    const { user } = useAuth();
    const canEditDelete = enableSpecialActions && user?.email === SPECIAL_ACCESS_EMAIL;

    return (
        <div className="flex items-center gap-1 shrink-0">
            {canEditDelete && (
                <select
                    className="h-7 text-[11px] font-semibold rounded ring-1 ring-slate-200 bg-slate-100 text-slate-700 px-1 transition-all duration-150"
                    title="Edit sentiment"
                    value={(grievance.analysis?.sentiment || 'neutral')}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                        e.stopPropagation();
                        onAction?.('edit_sentiment', { grievance, sentiment: e.target.value });
                    }}
                >
                    <option value="positive">Positive</option>
                    <option value="neutral">Moderate</option>
                    <option value="negative">Negative</option>
                </select>
            )}
            {canEditDelete && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-700 bg-red-100 hover:bg-red-200 ring-1 ring-red-200 transition-all duration-150 active:scale-95 active:translate-y-[1px]"
                    title="Delete"
                    onClick={(e) => {
                        e.stopPropagation();
                        onAction?.('delete', { grievance });
                    }}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            )}
            <Button
                variant="ghost"
                size="icon"
                disabled={isDownloading}
                className="h-7 w-7 text-blue-700 bg-blue-100 hover:bg-blue-200 ring-1 ring-blue-200 disabled:opacity-70 transition-all duration-150 active:scale-95 active:translate-y-[1px]"
                title={isDownloading ? 'Video is downloading...' : 'Download'}
                onClick={(e) => {
                    e.stopPropagation();
                    onAction?.('download', { grievance });
                }}
            >
                {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </Button>

            {/*
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-sky-800 bg-sky-100 hover:bg-sky-200 ring-1 ring-sky-200 font-extrabold text-[11px] transition-all duration-150 active:scale-95 active:translate-y-[1px]"
                title="Query"
                onClick={(e) => {
                    e.stopPropagation();
                    onAction?.('classify_query', { grievance });
                }}
            >
                Q
            </Button> 
            */}
        </div>
    );
};

const SentimentBadge = ({ analysis }) => {
    if (!analysis?.analyzed_at) return null;
    const sentiment = (analysis.sentiment || 'neutral').toLowerCase();
    const badgeConfig = {
        positive: { bg: 'bg-green-100', text: 'text-green-700', ring: 'ring-green-200', label: 'Positive' },
        negative: { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-200', label: 'Negative' },
        neutral: { bg: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-200', label: 'Moderate' }
    };
    const config = badgeConfig[sentiment] || badgeConfig.neutral;
    return (
        <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1', config.bg, config.text, config.ring)}>
            <Shield className="h-2.5 w-2.5" />
            {config.label}
        </span>
    );
};

const LocationBadge = ({ detectedLocation }) => {
    if (!detectedLocation?.city) return null;
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 bg-cyan-50 text-cyan-700 ring-cyan-200">
            <MapPin className="h-2.5 w-2.5" />
            {detectedLocation.city}
        </span>
    );
};

const TOPIC_STYLES = {
    'Political Criticism': 'bg-purple-50 text-purple-700 ring-purple-200',
    'Hate Speech': 'bg-red-50 text-red-700 ring-red-200',
    'Public Complaint': 'bg-blue-50 text-blue-700 ring-blue-200',
    'Corruption Complaint': 'bg-orange-50 text-orange-700 ring-orange-200',
    'Government Praise': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    'General Complaint': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    'Traffic Complaint': 'bg-amber-50 text-amber-700 ring-amber-200',
    'Public Nuisance': 'bg-rose-50 text-rose-700 ring-rose-200',
    'Road & Infrastructure': 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    'Law & Order': 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    'Normal': 'bg-gray-50 text-gray-600 ring-gray-200',
};

const GrievanceTopicBadge = ({ analysis }) => {
    const rawTopic = analysis?.grievance_type;
    if (!rawTopic || rawTopic === 'Normal') return null;
    const normalized = String(rawTopic).trim().toLowerCase();
    const displayTopic = (normalized === 'government praise' || normalized === 'govt praise' || normalized === 'general praise')
        ? 'General Complaint'
        : rawTopic;
    const style = TOPIC_STYLES[displayTopic] || TOPIC_STYLES[rawTopic] || 'bg-teal-50 text-teal-700 ring-teal-200';
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 ${style}`}>
            <Tag className="h-2.5 w-2.5" />
            {displayTopic}
        </span>
    );
};

const RiskLevelBadge = ({ analysis }) => {
    if (!analysis?.analyzed_at || !analysis?.risk_level) return null;
    const level = (analysis.risk_level || 'low').toLowerCase();
    if (level === 'low') return null;
    const config = {
        critical: { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-300', label: 'Critical Risk' },
        high: { bg: 'bg-orange-100', text: 'text-orange-700', ring: 'ring-orange-300', label: 'High Risk' },
        medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', ring: 'ring-yellow-300', label: 'Medium Risk' },
    };
    const c = config[level] || config.medium;
    return (
        <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1', c.bg, c.text, c.ring)}>
            <AlertTriangle className="h-2.5 w-2.5" />
            {c.label}
        </span>
    );
};

const CategoryBadge = ({ analysis }) => {
    if (!analysis?.analyzed_at || !analysis?.category) return null;
    const cat = analysis.category;
    if (cat === 'Normal' || cat === 'normal') return null;
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 bg-violet-50 text-violet-700 ring-violet-200">
            {cat.replace(/_/g, ' ')}
        </span>
    );
};

// Top-right analysis row: sentiment label + eye icon
const AnalysisRow = ({ grievance, onAction }) => {
    if (!grievance.analysis?.analyzed_at) return null;
    return (
        <div className="flex items-center gap-1.5 justify-end mb-1">
            <SentimentBadge analysis={grievance.analysis} />
            <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-600 bg-slate-100 hover:bg-slate-200 ring-1 ring-slate-200 transition-all duration-150 active:scale-95"
                title="View Analysis Details"
                onClick={(e) => {
                    e.stopPropagation();
                    onAction?.('view_analysis', { grievance });
                }}
            >
                <Eye className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
};

const WorkflowMeta = ({ grievance, onAction }) => {
    const gWorkflow = grievance?.grievance_workflow || {};
    const hasGrievanceWorkflow = !!gWorkflow?.unique_code;
    const currentStatus = ['PENDING', 'ESCALATED', 'CLOSED'].includes(gWorkflow?.status)
        ? gWorkflow.status
        : 'PENDING';

    const hasCriticismCode = grievance?.criticism?.shared_at && grievance?.criticism?.unique_code;

    const qWorkflow = grievance?.query_workflow || {};
    const hasQueryWorkflow = !!qWorkflow?.unique_code;
    const queryStatus = ['PENDING', 'CLOSED'].includes(qWorkflow?.status) ? qWorkflow.status : 'PENDING';

    const suggestion = grievance?.suggestion || {};
    const hasSuggestion = !!suggestion?.unique_code;

    if (!hasGrievanceWorkflow && !hasCriticismCode && !hasQueryWorkflow && !hasSuggestion) return null;

    return (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {hasGrievanceWorkflow && (
                <>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onAction?.('open_g_report', {
                                grievance,
                                uniqueCode: gWorkflow.unique_code
                            });
                        }}
                        className="inline-flex text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                        title="Open grievance report"
                    >
                        {gWorkflow.unique_code}
                    </button>
                    <select
                        value={currentStatus}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                            e.stopPropagation();
                            onAction?.('update_g_workflow_status', {
                                grievance,
                                status: e.target.value
                            });
                        }}
                        className="h-6 px-2 rounded border border-amber-200 bg-amber-50 text-[10px] font-semibold text-amber-800 outline-none focus:ring-2 focus:ring-amber-300"
                    >
                        <option value="PENDING">PENDING</option>
                        <option value="ESCALATED">ESCALATED</option>
                        <option value="CLOSED">CLOSED</option>
                    </select>
                </>
            )}

            {hasQueryWorkflow && (
                <>
                    <span className="inline-flex text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-sky-600 text-white">
                        {qWorkflow.unique_code}
                    </span>
                    <span className={cn(
                        "inline-flex text-[9px] font-semibold px-1.5 py-0.5 rounded",
                        queryStatus === 'CLOSED' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                    )}>
                        {queryStatus}
                    </span>
                </>
            )}

            {hasSuggestion && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onAction?.('open_s_report', {
                            grievance,
                            uniqueCode: suggestion.unique_code
                        });
                    }}
                    className="inline-flex text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                    title="Open suggestion report"
                >
                    {suggestion.unique_code}
                </button>
            )}

            {!hasGrievanceWorkflow && !hasQueryWorkflow && !hasSuggestion && hasCriticismCode && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onAction?.('open_c_report', {
                            grievance,
                            uniqueCode: grievance.criticism.unique_code
                        });
                    }}
                    className="inline-flex text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-white hover:bg-slate-900 transition-colors"
                    title="Open criticism report"
                >
                    {grievance.criticism.unique_code}
                </button>
            )}
        </div>
    );
};

/* ─── Media Grid (Twitter style — rounded) ─── */
const MediaGrid = ({ media, getProxiedMediaUrl, onAction, grievance }) => {
    const normalized = normalizeMediaList(media);
    if (!normalized.length) return null;
    const count = normalized.length;

    const renderItem = (item, index, className = '') => {
        const isVideo = item.type === 'video' || item.type === 'animated_gif';
        const src = getProxiedMediaUrl?.(item.s3_url || item.url || item.preview) || item.url || item.preview;
        const poster = getProxiedMediaUrl?.(item.s3_preview || item.preview || item.url) || item.preview || item.url;
        return (
            <div key={index} className={cn('relative overflow-hidden cursor-pointer bg-slate-100', className)}
                onClick={(e) => { e.stopPropagation(); onAction?.('view_media', { grievance, media: { type: item.type, url: item.url, video_url: item.url, preview_url: item.preview } }); }}>
                {isVideo ? (
                    <>
                        <img src={poster} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" onError={(e) => { e.target.src = ''; e.target.className = 'hidden'; }} />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="bg-black/60 rounded-full p-3 backdrop-blur-sm border border-white/30"><Play className="h-5 w-5 text-white fill-white" /></div>
                        </div>
                        {item.type === 'animated_gif' && <span className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">GIF</span>}
                    </>
                ) : (
                    <img src={src} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" onError={(e) => {
                        // Show a placeholder instead of hiding
                        e.target.onerror = null;
                        e.target.style.objectFit = 'contain';
                        e.target.style.background = '#f1f5f9';
                        e.target.style.padding = '2rem';
                        e.target.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>');
                    }} />
                )}
            </div>
        );
    };

    if (count === 1) return <div className="rounded-2xl overflow-hidden border border-slate-200 mt-3">{renderItem(normalized[0], 0, 'aspect-video')}</div>;
    if (count === 2) return <div className="grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-slate-200 mt-3">{normalized.slice(0, 2).map((m, i) => renderItem(m, i, 'aspect-[4/5]'))}</div>;
    if (count === 3) return (
        <div className="grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-slate-200 mt-3 h-[280px]">
            {renderItem(normalized[0], 0, 'row-span-2 h-full')}
            <div className="flex flex-col gap-0.5">{renderItem(normalized[1], 1, 'h-1/2')}{renderItem(normalized[2], 2, 'h-1/2')}</div>
        </div>
    );
    return (
        <div className="grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-slate-200 mt-3">
            {normalized.slice(0, 4).map((m, i) => (
                <div key={i} className="relative">{renderItem(m, i, 'aspect-video')}{i === 3 && count > 4 && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><span className="text-white text-xl font-bold">+{count - 4}</span></div>}</div>
            ))}
        </div>
    );
};

/* ─── Quoted Tweet ─── */
const QuotedTweet = ({ context, getProxiedMediaUrl, onAction, grievance }) => {
    if (!context?.tweet_id) return null;
    const text = context.content?.full_text || context.content?.text;
    return (
        <div className="mt-3 border border-slate-200 rounded-2xl p-3 hover:bg-slate-50/50 cursor-pointer transition-colors"
            onClick={() => context.tweet_url && window.open(context.tweet_url, '_blank')}>
            <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5"><AvatarImage src={context.posted_by?.profile_image_url} /><AvatarFallback className="text-[8px]">{(context.posted_by?.display_name || '?')[0]}</AvatarFallback></Avatar>
                <span className="text-[13px] font-bold text-[#0f1419] truncate">{context.posted_by?.display_name}</span>
                {context.posted_by?.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[#1d9bf0] shrink-0" />}
                <span className="text-[13px] text-[#536471] truncate">@{(context.posted_by?.handle || '').replace('@', '')}</span>
            </div>
            {text && <p className="text-[13px] text-[#0f1419] mt-1 whitespace-pre-wrap break-words line-clamp-3">{highlightMentions(text)}</p>}
            {context.content?.media?.length > 0 && <MediaGrid media={context.content.media} getProxiedMediaUrl={getProxiedMediaUrl} onAction={onAction} grievance={grievance} />}
        </div>
    );
};

/* ─── Parent Tweet (For Threaded View) ─── */
const ParentTweet = ({ context, getProxiedMediaUrl, onAction, grievance }) => {
    // If no data, render nothing
    if (!context?.tweet_id) return null;

    const user = context.posted_by || {};
    const handle = (user.handle || '').replace('@', '');
    const text = context.content?.full_text || context.content?.text || '';
    const media = context.content?.media || [];

    return (
        <div className="flex gap-3 relative pb-2 group">
            {/* Connection Line - Extended to connect with child */}
            <div className="absolute left-[20px] top-[40px] bottom-[-16px] w-[2px] bg-[#cfd9de] group-hover:bg-[#ccd6dd]" />

            <div className="shrink-0 pt-0.5 z-10">
                <Avatar className="h-10 w-10 ring-4 ring-white">
                    <AvatarImage src={user.profile_image_url} />
                    <AvatarFallback className="text-sm bg-[#1d9bf0] text-white">
                        {(user.display_name || handle || '?')[0]?.toUpperCase()}
                    </AvatarFallback>
                </Avatar>
            </div>
            <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-1 flex-wrap">
                    <span className="font-bold text-[15px] text-[#0f1419] truncate max-w-[180px]">
                        {user.display_name || handle}
                    </span>
                    {user.is_verified && <BadgeCheck className="h-4 w-4 text-[#1d9bf0] shrink-0" />}
                    <span className="text-[15px] text-[#536471] truncate">@{handle}</span>
                    <span className="text-[#536471]">·</span>
                    <span className="text-[15px] text-[#536471]">
                        {context.post_date ? timeAgo(context.post_date) : 'Original Post'}
                    </span>
                </div>
                {text && (
                    <div className="text-[15px] text-[#0f1419] leading-5 mt-1 whitespace-pre-wrap break-words">
                        {highlightMentions(text)}
                    </div>
                )}
                {media.length > 0 && (
                    <MediaGrid
                        media={media}
                        getProxiedMediaUrl={getProxiedMediaUrl}
                        onAction={onAction}
                        grievance={grievance}
                    />
                )}
            </div>
        </div>
    );
};

/* ─── Parent Post (For Facebook Threaded View) ─── */
const ParentFacebookPost = ({ context, getProxiedMediaUrl, onAction, grievance }) => {
    if (!context?.tweet_id) return null;

    const user = context.posted_by || {};
    const text = context.content?.full_text || context.content?.text || '';
    const media = context.content?.media || [];

    return (
        <div className="mb-4 pb-4 border-b border-gray-100 relative">
            <div className="absolute left-5 top-12 bottom-0 w-[2px] bg-slate-200" />

            <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 ring-1 ring-slate-200">
                    <AvatarImage src={user.profile_image_url} />
                    <AvatarFallback className="text-sm bg-[#1877F2] text-white">{(user.display_name || '?')[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[15px] text-[#050505]">{user.display_name || user.handle}</span>
                        {user.is_verified && <BadgeCheck className="h-4 w-4 text-[#1877F2] shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5 text-[13px] text-[#65676b]">
                        <span>{context.post_date ? timeAgo(context.post_date) : 'Original Post'}</span>
                        <span>·</span><GlobeIcon className="h-3 w-3" />
                    </div>
                </div>
            </div>
            {text && <div className="mt-3 text-[15px] text-[#050505] leading-5 whitespace-pre-wrap break-words">{highlightMentions(text)}</div>}
            {media.length > 0 && <div className="mt-3 -mx-4 opacity-80"><FacebookMediaGrid media={media} getProxiedMediaUrl={getProxiedMediaUrl} onAction={onAction} grievance={grievance} /></div>}
        </div>
    );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*                  X (TWITTER) LAYOUT                     */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const XLayout = ({ grievance, getProxiedMediaUrl, onAction, downloadState = {}, enableSpecialActions = false }) => {
    const user = grievance.posted_by || {};
    const handle = (user.handle || '').replace('@', '');
    const text = grievance.content?.full_text || grievance.content?.text || '';
    const media = grievance.content?.media || [];
    const engagement = grievance.engagement || {};
    const ctx = grievance.context || {};
    const openDetails = () => onAction?.('view', { grievance });
    const openOriginal = () => {
        const url = grievance.tweet_url || grievance.url;
        if (url) window.open(url, '_blank');
        else openDetails();
    };

    // Check if we have a parent tweet to display in a thread
    const parentTweet = ctx.in_reply_to?.tweet_id ? ctx.in_reply_to : ctx.thread_parent;

    return (
        <div className="flex flex-col">
            {/* THREAD: Parent Tweet (if available) */}
            {parentTweet && parentTweet.tweet_id && (
                <ParentTweet
                    context={parentTweet}
                    getProxiedMediaUrl={getProxiedMediaUrl}
                    onAction={onAction}
                    grievance={grievance}
                />
            )}

            {/* MAIN TWEET */}
            <div className="flex gap-3">
                <div className="shrink-0 pt-0.5 z-10">
                    <Avatar className="h-10 w-10 ring-4 ring-white">
                        <AvatarImage src={user.profile_image_url} />
                        <AvatarFallback className="text-sm bg-[#1d9bf0] text-white">{(user.display_name || handle || '?')[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                </div>
                <div className="flex-1 min-w-0">
                    {ctx.reposted_from?.tweet_id && (
                        <div className="flex items-center gap-1 text-[13px] text-[#536471] mb-1 -mt-1">
                            <Repeat2 className="h-3.5 w-3.5" />
                            <span className="font-bold">{ctx.reposted_from.posted_by?.display_name || 'Someone'} reposted</span>
                        </div>
                    )}
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <div className="flex items-center gap-1 flex-wrap">
                                <span className="font-bold text-[15px] text-[#0f1419] truncate max-w-[180px]">{user.display_name || handle}</span>
                                {user.is_verified && <BadgeCheck className="h-4 w-4 text-[#1d9bf0] shrink-0" />}
                                <span className="text-[15px] text-[#536471] truncate">@{handle}</span>
                                <span className="text-[#536471]">·</span>
                                <span className="text-[15px] text-[#536471] hover:underline cursor-pointer" title={formatFullDate(grievance.post_date)}>{timeAgo(grievance.post_date)}</span>
                            </div>
                            <WorkflowMeta grievance={grievance} onAction={onAction} />
                        </div>
                        <ActionButtons grievance={grievance} onAction={onAction} isDownloading={!!downloadState?.downloading} enableSpecialActions={enableSpecialActions} />
                    </div>
                    {/* Only show "Replying to" if we DON'T show the parent thread above (fallback) */}
                    {(!parentTweet?.tweet_id) && ctx.in_reply_to?.posted_by?.handle && (
                        <div className="flex items-center gap-1 text-[13px] text-[#536471] mt-0.5">
                            <span>Replying to</span>
                            <span className="text-[#1d9bf0] hover:underline cursor-pointer">@{(ctx.in_reply_to.posted_by.handle || '').replace('@', '')}</span>
                        </div>
                    )}
                    {text && <div className="text-[15px] text-[#0f1419] leading-5 mt-1 whitespace-pre-wrap break-words">{highlightMentions(text)}</div>}
                    {media.length > 0 && <MediaGrid media={media} getProxiedMediaUrl={getProxiedMediaUrl} onAction={onAction} grievance={grievance} />}
                    <QuotedTweet context={ctx.quoted} getProxiedMediaUrl={getProxiedMediaUrl} onAction={onAction} grievance={grievance} />
                    <div className="flex items-center justify-between mt-3 max-w-[425px] -ml-2">
                        {[
                            { icon: MessageCircle, count: engagement.replies, hoverColor: 'hover:bg-[#1d9bf0]/10', textHover: 'group-hover:text-[#1d9bf0]', isComment: true },
                            { icon: Repeat2, count: engagement.retweets, hoverColor: 'hover:bg-[#00ba7c]/10', textHover: 'group-hover:text-[#00ba7c]' },
                            { icon: Heart, count: engagement.likes, hoverColor: 'hover:bg-[#f91880]/10', textHover: 'group-hover:text-[#f91880]' },
                            { icon: BarChart3, count: engagement.views, hoverColor: 'hover:bg-[#1d9bf0]/10', textHover: 'group-hover:text-[#1d9bf0]' },
                        ].map(({ icon: Icon, count, hoverColor, textHover, isComment }, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={openDetails}
                                data-comment-btn={isComment ? "true" : undefined}
                                className={cn('flex items-center gap-1.5 group p-2 rounded-full transition-all duration-150 active:scale-95 active:translate-y-[1px]', hoverColor)}
                            >
                                <Icon className={cn('h-[18px] w-[18px] text-[#536471]', textHover)} />
                                <span className={cn('text-[13px] text-[#536471]', textHover)}>{formatCount(count)}</span>
                            </button>
                        ))}
                        <button type="button" onClick={openOriginal} className="flex items-center gap-1.5 group p-2 rounded-full hover:bg-[#1d9bf0]/10 transition-all duration-150 active:scale-95 active:translate-y-[1px]">
                            <Bookmark className="h-[18px] w-[18px] text-[#536471] group-hover:text-[#1d9bf0]" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*                   FACEBOOK LAYOUT                       */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const FacebookMediaGrid = ({ media, getProxiedMediaUrl, onAction, grievance }) => {
    const normalized = normalizeMediaList(media);
    if (!normalized.length) return null;
    const count = normalized.length;
    const renderFBItem = (item, index, className = '') => {
        const isVideo = item.type === 'video' || item.type === 'animated_gif';
        const src = getProxiedMediaUrl?.(item.s3_url || item.url || item.preview) || item.url || item.preview;
        const poster = getProxiedMediaUrl?.(item.s3_preview || item.preview || item.url) || item.preview || item.url;
        return (
            <div key={index} className={cn('relative overflow-hidden cursor-pointer bg-slate-100', className)}
                onClick={(e) => { e.stopPropagation(); onAction?.('view_media', { grievance, media: { type: item.type, url: item.url, video_url: item.url, preview_url: item.preview } }); }}>
                {isVideo ? (
                    <>
                        <img src={poster} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" onError={(e) => { e.target.src = ''; e.target.className = 'hidden'; }} />
                        <div className="absolute inset-0 flex items-center justify-center"><div className="bg-black/50 rounded-full p-4"><Play className="h-6 w-6 text-white fill-white" /></div></div>
                    </>
                ) : (
                    <img src={src} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" onError={(e) => {
                        e.target.onerror = null;
                        e.target.style.objectFit = 'contain';
                        e.target.style.background = '#f1f5f9';
                        e.target.style.padding = '2rem';
                        e.target.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>');
                    }} />
                )}
            </div>
        );
    };
    if (count === 1) return renderFBItem(normalized[0], 0, 'w-full max-h-[500px]');
    if (count === 2) return <div className="grid grid-cols-2 gap-[2px]">{normalized.slice(0, 2).map((m, i) => renderFBItem(m, i, 'aspect-square'))}</div>;
    if (count === 3) return <div className="grid grid-cols-2 gap-[2px]"><div className="col-span-2">{renderFBItem(normalized[0], 0, 'aspect-video')}</div>{normalized.slice(1, 3).map((m, i) => renderFBItem(m, i + 1, 'aspect-square'))}</div>;
    return (
        <div className="grid grid-cols-2 gap-[2px]">
            <div className="col-span-2">{renderFBItem(normalized[0], 0, 'aspect-video')}</div>
            {normalized.slice(1, 4).map((m, i) => (
                <div key={i + 1} className="relative">{renderFBItem(m, i + 1, 'aspect-square')}{i === 2 && count > 4 && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><span className="text-white text-2xl font-bold">+{count - 4}</span></div>}</div>
            ))}
        </div>
    );
};

const FacebookLayout = ({ grievance, getProxiedMediaUrl, onAction, downloadState = {}, enableSpecialActions = false }) => {
    const user = grievance.posted_by || {};
    const text = grievance.content?.full_text || grievance.content?.text || '';
    const media = grievance.content?.media || [];
    const engagement = grievance.engagement || {};
    const totalReactions = (engagement.likes || 0);
    const openDetails = () => onAction?.('view', { grievance });

    // Parent post from context (for comment threads)
    const ctx = grievance.context || {};
    const parentPost = ctx.in_reply_to?.tweet_id ? ctx.in_reply_to : ctx.thread_parent;

    return (
        <div>
            {/* THREAD: Show original post if this is a comment */}
            {parentPost && parentPost.tweet_id && (
                <ParentFacebookPost
                    context={parentPost}
                    getProxiedMediaUrl={getProxiedMediaUrl}
                    onAction={onAction}
                    grievance={grievance}
                />
            )}

            <div className={cn(parentPost?.tweet_id ? "pl-4" : "")}>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-10 w-10 ring-1 ring-slate-200">
                            <AvatarImage src={user.profile_image_url} />
                            <AvatarFallback className="text-sm bg-[#1877F2] text-white">{(user.display_name || '?')[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-[15px] text-[#050505]">{user.display_name || user.handle}</span>
                                {user.is_verified && <BadgeCheck className="h-4 w-4 text-[#1877F2] shrink-0" />}
                            </div>
                            <div className="flex items-center gap-1.5 text-[13px] text-[#65676b]">
                                <span>{timeAgo(grievance.post_date)}</span><span>·</span><GlobeIcon className="h-3 w-3" />
                            </div>
                            <WorkflowMeta grievance={grievance} onAction={onAction} />
                        </div>
                    </div>
                    <ActionButtons grievance={grievance} onAction={onAction} isDownloading={!!downloadState?.downloading} enableSpecialActions={enableSpecialActions} />
                </div>
                {text && <div className="mt-3 text-[15px] text-[#050505] leading-5 whitespace-pre-wrap break-words">{highlightMentions(text)}</div>}
                {media.length > 0 && <div className="mt-3 -mx-4"><FacebookMediaGrid media={media} getProxiedMediaUrl={getProxiedMediaUrl} onAction={onAction} grievance={grievance} /></div>}
                {totalReactions > 0 && (
                    <div className="flex items-center justify-between px-1 py-2.5 border-b border-[#ced0d4]">
                        <div className="flex items-center gap-1">
                            <div className="flex -space-x-1">
                                <span className="inline-flex items-center justify-center h-[18px] w-[18px] rounded-full bg-[#1877F2] border-2 border-white"><ThumbsUpIcon className="h-2.5 w-2.5 text-white" /></span>
                                <span className="inline-flex items-center justify-center h-[18px] w-[18px] rounded-full bg-red-500 border-2 border-white"><Heart className="h-2.5 w-2.5 text-white fill-white" /></span>
                            </div>
                            <span className="text-[15px] text-[#65676b]">{formatCount(totalReactions)}</span>
                        </div>
                        <div className="flex items-center gap-4 text-[15px] text-[#65676b]">
                            {(engagement.replies || 0) > 0 && <span>{formatCount(engagement.replies)} comments</span>}
                            {(engagement.retweets || 0) > 0 && <span>{formatCount(engagement.retweets)} shares</span>}
                        </div>
                    </div>
                )}
                <div className="flex items-center justify-around pt-1">
                    {[{ icon: ThumbsUpIcon, label: 'Like' }, { icon: MessageCircle, label: 'Comment' }, { icon: ShareFBIcon, label: 'Share' }].map(({ icon: Icon, label }) => (
                        <button
                            type="button"
                            key={label}
                            onClick={openDetails}
                            data-comment-btn={label === 'Comment' ? "true" : undefined}
                            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg hover:bg-[#f0f2f5] transition-all duration-150 active:scale-[0.98] active:translate-y-[1px] text-[#65676b]"
                        >
                            <Icon className="h-5 w-5" /><span className="text-[15px] font-semibold">{label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*                   WHATSAPP LAYOUT                       */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const WhatsAppLayout = ({ grievance, getProxiedMediaUrl, onAction, downloadState = {}, enableSpecialActions = false }) => {
    const user = grievance.posted_by || {};
    const text = grievance.content?.full_text || grievance.content?.text || '';
    const media = grievance.content?.media || [];
    const displayName = user.display_name || grievance.complainant_phone || 'Unknown';
    const phone = grievance.complainant_phone || user.handle || '';

    return (
        <div className="bg-[#efeae2] rounded-xl p-3 relative" style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'p\' width=\'40\' height=\'40\' patternUnits=\'userSpaceOnUse\' patternTransform=\'rotate(30)\'%3E%3Ccircle cx=\'20\' cy=\'20\' r=\'1\' fill=\'%23d4cfc4\' opacity=\'.3\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'200\' height=\'200\' fill=\'url(%23p)\'/%3E%3C/svg%3E")',
        }}>
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-[#0f172a] truncate">{displayName}</p>
                    <WorkflowMeta grievance={grievance} onAction={onAction} />
                </div>
                <ActionButtons grievance={grievance} onAction={onAction} isDownloading={!!downloadState?.downloading} enableSpecialActions={enableSpecialActions} />
            </div>
            <div className="flex justify-center mb-3">
                <span className="bg-[#e1f3fb] text-[#54656f] text-[11px] font-medium px-3 py-1 rounded-lg shadow-sm">
                    {grievance.post_date ? format(new Date(grievance.post_date), 'MMMM d, yyyy') : 'Today'}
                </span>
            </div>
            <div className="max-w-[85%]">
                <div className="bg-white rounded-xl rounded-tl-sm p-2.5 shadow-sm relative">
                    <div className="absolute -left-2 top-0 w-0 h-0 border-t-[8px] border-t-white border-l-[8px] border-l-transparent" />
                    <p className="text-[12.5px] font-semibold text-[#00a884] mb-0.5">
                        {displayName}
                        {phone && phone !== displayName && <span className="text-[11px] font-normal text-[#667781] ml-2">~{phone}</span>}
                    </p>
                    {media.length > 0 && (
                        <div className="mb-1.5 rounded-lg overflow-hidden">
                            {media.map((item, i) => {
                                const normalized = normalizeMediaList([item]);
                                if (!normalized.length) return null;
                                const n = normalized[0];
                                const isVideo = n.type === 'video' || n.type === 'animated_gif';
                                const src = getProxiedMediaUrl?.(n.url || n.preview) || n.url;
                                const poster = getProxiedMediaUrl?.(n.preview || n.url) || n.preview;
                                return (
                                    <div key={i} className="relative cursor-pointer rounded-lg overflow-hidden mb-1"
                                        onClick={(e) => { e.stopPropagation(); onAction?.('view_media', { grievance, media: { type: n.type, url: n.url, video_url: n.url, preview_url: n.preview } }); }}>
                                        {isVideo ? (
                                            <>
                                                <img src={poster} alt="" className="w-full max-h-52 object-cover rounded-lg" referrerPolicy="no-referrer" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
                                                <div className="absolute inset-0 flex items-center justify-center"><div className="bg-[#00a884]/80 rounded-full p-2.5"><Play className="h-5 w-5 text-white fill-white" /></div></div>
                                            </>
                                        ) : (
                                            <img src={src} alt="" className="w-full max-h-52 object-cover rounded-lg" referrerPolicy="no-referrer" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {text && <p className="text-[14.2px] text-[#111b21] leading-[19px] whitespace-pre-wrap break-words">{text}</p>}
                    <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[11px] text-[#667781]">{grievance.post_date ? format(new Date(grievance.post_date), 'h:mm a') : ''}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*                 MAIN GRIEVANCE CARD                     */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export const GrievanceCard = ({ grievance, onAction, getProxiedMediaUrl, downloadState = {}, isActioned = false, isSelected = false, compact = false, enableSpecialActions = false }) => {
    const platform = (grievance.platform || 'x').toLowerCase();
    const isX = platform === 'x' || platform === 'twitter';
    const isFB = platform === 'facebook';
    const isWA = platform === 'whatsapp';
    const isIG = platform === 'instagram';
    const isYT = platform === 'youtube';
    const isDownloading = !!downloadState?.downloading;
    const downloadProgress = Math.max(0, Math.min(100, Math.round(downloadState?.progress || 0)));

    const sentiment = (grievance.analysis?.sentiment || '').toLowerCase();
    const sentimentBorderColor = sentiment === 'negative' ? 'border-l-red-500' :
        sentiment === 'positive' ? 'border-l-green-500' :
            sentiment === 'neutral' ? 'border-l-amber-500' : '';

    return (
        <Card id={`grievance-card-${grievance.id}`} className={cn(
            "relative overflow-hidden shadow-sm border transition-shadow",
            sentimentBorderColor && `border-l-[3px] ${sentimentBorderColor}`,
            isActioned ? "animate-card-action-blink border-green-400 z-10" : "border-slate-200 hover:shadow-md"
        )}>
            {(isDownloading || downloadState?.error) && (
                <div className="px-4 py-2 border-b border-slate-100 bg-blue-50/40">
                    {isDownloading && (
                        <>
                            <div className="flex items-center justify-between text-[11px] font-semibold text-blue-700 mb-1">
                                <span>{downloadState?.status || 'Video is downloading...'}</span>
                                <span>{downloadProgress}%</span>
                            </div>
                            <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${downloadProgress}%` }} />
                            </div>
                        </>
                    )}
                    {!isDownloading && downloadState?.error && (
                        <div className="text-[11px] font-semibold text-red-600">{downloadState.error}</div>
                    )}
                </div>
            )}

            {/* Platform-native Content */}
            <CardContent className={cn('p-3', isWA && 'p-2')}>
                {isX && <XLayout grievance={grievance} getProxiedMediaUrl={getProxiedMediaUrl} onAction={onAction} downloadState={downloadState} enableSpecialActions={enableSpecialActions} />}
                {isFB && <FacebookLayout grievance={grievance} getProxiedMediaUrl={getProxiedMediaUrl} onAction={onAction} downloadState={downloadState} enableSpecialActions={enableSpecialActions} />}
                {isWA && <WhatsAppLayout grievance={grievance} getProxiedMediaUrl={getProxiedMediaUrl} onAction={onAction} downloadState={downloadState} enableSpecialActions={enableSpecialActions} />}
                {isIG && <XLayout grievance={grievance} getProxiedMediaUrl={getProxiedMediaUrl} onAction={onAction} downloadState={downloadState} enableSpecialActions={enableSpecialActions} />}
                {isYT && <XLayout grievance={grievance} getProxiedMediaUrl={getProxiedMediaUrl} onAction={onAction} downloadState={downloadState} enableSpecialActions={enableSpecialActions} />}
            </CardContent>

            {/* Footer */}
            <div className="bg-slate-50/80 border-t border-slate-100 px-4 py-1.5 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-2 flex-wrap">
                    <PlatformBadge platform={platform} />
                    <SentimentBadge analysis={grievance.analysis} />
                    <GrievanceTopicBadge analysis={grievance.analysis} />
                    <LocationBadge detectedLocation={grievance.detected_location} />
                    <span>Detected {timeAgo(grievance.detected_date || grievance.created_at)} ago</span>
                </div>
                <div className="flex items-center gap-3">
                    {grievance.analysis?.analyzed_at && (
                        <button type="button" className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium transition-all duration-150 active:scale-95 active:translate-y-[1px]" onClick={() => onAction?.('view_analysis', { grievance })}>
                            <Eye className="h-3 w-3" /> Analysis
                        </button>
                    )}
                    <button type="button" className="text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-all duration-150 active:scale-95 active:translate-y-[1px]" onClick={() => onAction?.('view', { grievance })}>
                        Details <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="m9 18 6-6-6-6" /></svg>
                    </button>
                </div>
            </div>
        </Card>
    );
};
//added comment
export default GrievanceCard;
