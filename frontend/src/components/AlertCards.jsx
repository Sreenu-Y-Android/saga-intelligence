
import React, { useState, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Repeat, Heart, BarChart2, MoreHorizontal, Share, CheckCircle2, ThumbsUp, Eye, ExternalLink, MessageSquare, Zap, Info, X, AlertTriangle, Shield, ShieldCheck, Download, Loader2, FileText, Share2, Check, XCircle, AlertCircle, FilePlus, ChevronDown, Image, Video, Plus, Twitter, Instagram, Facebook, Users, Trash2, Clock, Globe } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { HoverCard, HoverCardTrigger, HoverCardContent } from './ui/hover-card';
import api from '../lib/api';
import ReactPlayer from 'react-player';
import { toast } from 'sonner';
import ReasonModal from './ReasonModal';
import ForensicResults from './ForensicResults';
import { useAuth } from '../contexts/AuthContext';

const SPECIAL_ACCESS_EMAIL = 'sreenu@gmail.com';
const RISK_TO_SENTIMENT = { low: 'positive', medium: 'neutral', high: 'negative', critical: 'negative' };

const WHATSAPP_GROUP_LINK = 'https://chat.whatsapp.com/HGGWZCyNXBmHfp4KvYxlXu';

const openWhatsAppGroupShare = async (text) => {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
    let finalText = text || '';
    if (finalText && !/^(Good\sMorning|Good\sAfternoon|Good\sEvening)/i.test(finalText.trim())) {
        finalText = `${greeting} sir,\n\n${finalText}`;
    }
    try {
        if (finalText && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(finalText);
        }
    } catch (error) {
        console.error('Clipboard copy failed:', error);
        toast.error('Unable to copy message. Please copy manually.');
    }

    window.open(WHATSAPP_GROUP_LINK, '_blank');

    if (finalText) {
        toast.success('Message copied. Paste it into the WhatsApp group.');
    }
};

const triggerBlobDownload = async (url, filename) => {
    try {
        // console.log(`Fetching blob from: ${url}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        return true;
    } catch (error) {
        console.error('Blob download failed:', error);
        return false;
    }
};

const VIDEO_URL_RE = /\.(mp4|webm|mkv|mov|avi|m3u8)(\?|$)/i;
const IMAGE_URL_RE = /\.(jpe?g|png|gif|webp)(\?|$)/i;

const normalizeMediaType = (value) => String(value ?? '').trim().toLowerCase();
const isVideoType = (value) => ['video', 'animated_gif', 'gifv', '2'].includes(normalizeMediaType(value));
const isImageType = (value) => ['photo', 'image', '1'].includes(normalizeMediaType(value));

const isLikelyVideoUrl = (url) => typeof url === 'string' && (
    url.includes('video.twimg.com') ||
    VIDEO_URL_RE.test(url)
);

const isLikelyImageUrl = (url) => typeof url === 'string' && IMAGE_URL_RE.test(url);

const isDownloadableSocialLink = (url) => typeof url === 'string' && /(?:twitter\.com|x\.com|instagram\.com\/(?:reels?|stories|p|tv)\/)/i.test(url);

const isVideoMediaItem = (item) => {
    const url = String(item?.url || item?.preview || '');
    return isVideoType(item?.type) || isVideoType(item?.media_type) || Boolean(item?.is_video) || isLikelyVideoUrl(url);
};

const isImageMediaItem = (item) => {
    const url = String(item?.url || item?.preview || '');
    if (isVideoMediaItem(item)) return false;
    return isImageType(item?.type) || isImageType(item?.media_type) || isLikelyImageUrl(url);
};

// Download Menu Dropdown Component
export const DownloadMenu = ({
    mediaItems = [],
    mediaUrl,
    contentId,
    onDownloadStart,
    onDownloadComplete,
    onDownloadError,
    downloading = false,
    downloadProgress = 0,
    downloadStatus = '',
    downloadError = null,
    showLabel = true
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [downloadType, setDownloadType] = useState(null); // 'images' | 'videos' | 'generic'
    const menuRef = useRef(null);

    // Detect media types
    const validItems = Array.isArray(mediaItems) ? mediaItems : [];
    const hasImages = validItems.some((m) => isImageMediaItem(m));
    const hasVideos = validItems.some((m) => isVideoMediaItem(m));

    // Allow download if:
    // 1. Explicit media items exist
    // 2. OR it's a Twitter/X link (we can try scraping it for media even if frontend didn't detect it yet)
    const isLink = mediaUrl && (mediaUrl.includes('twitter.com') || mediaUrl.includes('x.com'));
    const hasMedia = hasImages || hasVideos || isLink;

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);



    const handleDownloadImages = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        setDownloadType('images');
        onDownloadStart?.();

        try {
            // Filter image items
            const imageItems = validItems.filter((m) => isImageMediaItem(m));

            if (imageItems.length === 0) {
                onDownloadError?.('No images found to download');
                return;
            }

            // console.log('Found image items:', imageItems);

            // Prepare image URLs with twitter high quality
            const imageUrls = imageItems.map(m => {
                let url = m.s3_url || m.url || m.preview;
                // For Twitter images, get highest quality (only for non-S3 URLs)
                if (url && !url.includes('amazonaws.com') && url.includes('pbs.twimg.com') && !url.includes('name=')) {
                    url = `${url}${url.includes('?') ? '&' : '?'}name=orig`;
                }
                return url;
            }).filter(Boolean);

            // console.log('Sending image URLs to backend:', imageUrls);

            // Call backend to download images
            const response = await api.post('/media/download-images', {
                image_urls: imageUrls,
                content_id: contentId
            });

            // console.log('Backend response:', response.data);

            if (response.data.items && response.data.items.length > 0) {
                // Download each image file sequentially
                for (let i = 0; i < response.data.items.length; i++) {
                    const item = response.data.items[i];
                    const downloadUrl = item.download_url;
                    const filename = item.filename || `image_${i + 1}.jpg`;

                    // console.log(`Triggering download for ${filename} from ${downloadUrl}`);

                    const result = await triggerBlobDownload(downloadUrl, filename);
                    if (!result) console.error(`Failed to download ${filename}`);
                    // Small delay between downloads to prevent browser blocking
                    if (i < response.data.items.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
                onDownloadComplete?.();
            } else {
                onDownloadError?.('No images returned from server');
            }
        } catch (error) {
            // console.error('Image download failed:', error);
            onDownloadError?.(error.response?.data?.error || 'Image download failed');
        }
    };

    const handleDownloadVideos = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        setDownloadType('videos');
        onDownloadStart?.();

        try {
            // Filter video items
            const videoItems = validItems.filter((m) => isVideoMediaItem(m));

            // Call backend video download endpoint
            // If explicit video items exist, send them. 
            // If not, but we have a link (isLink=true), send the mediaUrl and let backend find videos.
            const response = await api.post('/media/download-video', {
                media_url: mediaUrl || videoItems[0]?.url,
                video_urls: videoItems.map(v => v.url).filter(Boolean),
                content_id: contentId
            });

            if (response.data.items && response.data.items.length > 0) {
                // Download each video file
                for (let i = 0; i < response.data.items.length; i++) {
                    const item = response.data.items[i];
                    const downloadUrl = item.download_url;
                    const filename = item.filename || `video_${i + 1}.mp4`;

                    await triggerBlobDownload(downloadUrl, filename);
                    if (i < response.data.items.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
                onDownloadComplete?.();
            } else if (response.data.download_url) {
                // Single video
                const downloadUrl = response.data.download_url;
                const filename = response.data.filename || 'video.mp4';
                await triggerBlobDownload(downloadUrl, filename);
                onDownloadComplete?.();
            } else {
                onDownloadError?.('No videos returned from server');
            }
        } catch (error) {
            // console.error('Video download failed:', error);
            onDownloadError?.(error.response?.data?.error || 'Video download failed');
        }
    };

    const handleDownloadGenericMedia = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        setDownloadType('generic');
        onDownloadStart?.();

        const runItemDownloads = async (items = []) => {
            for (let i = 0; i < items.length; i++) {
                const item = items[i] || {};
                const downloadUrl = item.download_url || item.s3_url || item.url;
                if (!downloadUrl) continue;
                const fallbackExt = isVideoMediaItem(item) ? 'mp4' : 'jpg';
                const filename = item.filename || `media_${i + 1}.${fallbackExt}`;
                await triggerBlobDownload(downloadUrl, filename);
                if (i < items.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        };

        try {
            const payload = {
                media_url: mediaUrl,
                content_id: contentId
            };
            if (validItems.length > 0) {
                payload.media_items = validItems;
            }

            const response = await api.post('/media/download', payload);
            const data = response.data || {};

            if (Array.isArray(data.items) && data.items.length > 0) {
                await runItemDownloads(data.items);
                onDownloadComplete?.();
                return;
            }

            if (Array.isArray(data.download_urls) && data.download_urls.length > 0) {
                const syntheticItems = data.download_urls.map((downloadUrl, idx) => ({
                    download_url: downloadUrl,
                    filename: `media_${idx + 1}${isLikelyVideoUrl(downloadUrl) ? '.mp4' : '.jpg'}`
                }));
                await runItemDownloads(syntheticItems);
                onDownloadComplete?.();
                return;
            }

            if (data.download_url) {
                const filename = data.filename || (isLikelyVideoUrl(data.download_url) ? 'media.mp4' : 'media.jpg');
                await triggerBlobDownload(data.download_url, filename);
                onDownloadComplete?.();
                return;
            }

            onDownloadError?.('No media returned from server');
        } catch (error) {
            onDownloadError?.(error.response?.data?.error || 'Media download failed');
        }
    };

    if (!hasMedia) return null;

    const imageLabel = hasImages && (!hasVideos)
        ? (validItems.filter((m) => isImageMediaItem(m)).length > 1 ? 'Download Images' : 'Download Image')
        : 'Download';

    const videoLabel = hasVideos && (!hasImages)
        ? (validItems.filter((m) => isVideoMediaItem(m)).length > 1 ? 'Download Videos' : 'Download Video')
        : 'Download';

    // If only link (no explicit items detected/passed yet), label as "Download Media"
    const simpleMode = !hasImages && !hasVideos && isLink;

    return (
        <div className="relative" ref={menuRef}>
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Direct action logic
                    if (simpleMode) {
                        handleDownloadGenericMedia(e);
                        return;
                    }
                    if (hasImages && !hasVideos) {
                        handleDownloadImages(e);
                        return;
                    }
                    if (hasVideos && !hasImages) {
                        handleDownloadVideos(e);
                        return;
                    }
                    setIsOpen(!isOpen);
                }}
                disabled={downloading}
                className={`flex items-center gap-1 text-xs font-medium z-20 ${downloading ? 'text-gray-400 cursor-wait' :
                    downloadError ? 'text-red-600' :
                        'text-green-600 hover:text-green-700 hover:underline'
                    }`}
                title={downloadError || (simpleMode ? 'Download' :
                    (hasImages && !hasVideos ? imageLabel :
                        (hasVideos && !hasImages ? videoLabel : 'Download')))}
            >
                {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Download className="h-4 w-4" />
                )}
                <span className={showLabel ? 'hidden sm:inline' : 'hidden'}>
                    {downloading ? 'Downloading...' : downloadError ? 'Failed' :
                        (simpleMode ? 'Download' :
                            (hasImages && !hasVideos ? imageLabel :
                                (hasVideos && !hasImages ? videoLabel : 'Download')))}
                </span>
                {!downloading && !simpleMode && hasImages && hasVideos && <ChevronDown className="h-3 w-3" />}
            </button>

            {isOpen && !downloading && hasImages && hasVideos && (
                <div className="absolute top-full right-0 mt-1 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
                    {hasImages && (
                        <button
                            type="button"
                            onClick={handleDownloadImages}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                        >
                            <Image className="h-4 w-4 text-blue-500" />
                            {imageLabel}
                        </button>
                    )}
                    {hasVideos && (
                        <button
                            type="button"
                            onClick={handleDownloadVideos}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                        >
                            <Video className="h-4 w-4 text-purple-500" />
                            {videoLabel}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

// Helper for formatting numbers (e.g., 1.2k)
const formatMetric = (num) => {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
};

// Helper for highlighting text matches
const HighlightText = ({ text, highlight }) => {
    if (!highlight || !text || typeof text !== 'string') return <span>{text}</span>;
    // Escape regex characters in highlight string
    const safeHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${safeHighlight})`, 'gi'));
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <span key={i} className="bg-yellow-200 dark:bg-yellow-800/30 text-gray-900 dark:text-gray-100 rounded px-0.5 font-medium border border-yellow-300 dark:border-yellow-700/50">{part}</span>
                ) : (
                    part
                )
            )}
        </span>
    );
};




export const normalizeMediaItem = (item) => {
    if (!item) return null;

    if (typeof item === 'string') {
        return { type: 'photo', url: item, preview: item };
    }

    // S3-first media selection. If S3 is not ready yet, gracefully fall back to originals.
    const url = item.s3_url || item.video_url || item.url || item.original_video_url || item.original_url || item.media_url_https || item.media_url || item.s3_preview || item.preview || item.preview_url || item.original_preview_url || item.preview_image_url || item.thumbnail_url || item.image_url || item.image?.url;
    const preview = item.s3_preview || item.preview || item.preview_url || item.original_preview || item.original_preview_url || item.thumbnail_url || item.media_url_https || item.media_url || item.image_url || item.image?.url || item.s3_url || item.url || item.original_url || url;
    let type = item.type || item.media_type;
    if (!type && item.video_info) type = 'video';
    if (!type && (item.is_video || isLikelyVideoUrl(url || ''))) type = 'video';
    if (String(type).trim() === '2') type = 'video';
    if (String(type).trim() === '1') type = 'photo';
    if (!type) type = isLikelyVideoUrl(url || '') ? 'video' : 'photo';

    if (!url) return null;
    return { type, url, preview: preview || url };
};

export const normalizeMediaList = (media) => {
    if (!Array.isArray(media)) return [];
    return media.map(normalizeMediaItem).filter(Boolean);
};

const normalizeText = (text) => {
    if (text === null || text === undefined) return '';
    try {
        return text
            .toString()
            .normalize('NFKC')
            .replace(/[\u200B-\u200D\u2060\uFE0F]/g, '')
            .replace(/\s+/g, ' ')
            .toLowerCase()
            .trim();
    } catch (e) {
        return '';
    }
};

const filterRiskFactors = (content) => {
    if (!content?.risk_factors || !Array.isArray(content.risk_factors)) return [];
    const textNormalized = normalizeText(content.text || '');
    return content.risk_factors.filter((factor) => {
        const keyword = (factor.keyword || '').toString();
        if (!keyword) return false;
        if (keyword.toLowerCase().startsWith('[ai]')) return true;
        if (!textNormalized) return true;
        return textNormalized.includes(normalizeText(keyword));
    });
};

// Report Status Tracker Component - Delivery-style tracking UI
const ReportStatusTracker = ({ report }) => {
    if (!report) return null;

    const statuses = [
        { key: 'generated', label: 'Report Generated', icon: FilePlus },
        { key: 'sent_to_intermediary', label: 'Sent to Intermediary', icon: Share },
        { key: 'closed', label: 'Closed', icon: CheckCircle2 }
    ];

    const getStatusIndex = (status) => {
        const statusMap = {
            'generated': 0,
            'sent_to_intermediary': 1,
            'closed': 2,
            'resolved': 2
        };
        return statusMap[status] ?? 0;
    };

    const currentIndex = getStatusIndex(report.status);

    return (
        <div className="p-4 space-y-4">
            {/* Report Header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-3">
                <div>
                    <div className="text-xs text-gray-500 uppercase font-medium">Report ID</div>
                    <div className="text-sm font-mono font-bold text-blue-600">{report.serial_number}</div>
                </div>
                <div className="text-right">
                    <div className="text-xs text-gray-500 uppercase font-medium">Generated</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                        {report.generated_at ? new Date(report.generated_at).toLocaleDateString() : 'N/A'}
                    </div>
                </div>
            </div>

            {/* Status Tracker - Delivery Style */}
            <div className="relative">
                {statuses.map((status, index) => {
                    const isCompleted = index <= currentIndex;
                    const isCurrent = index === currentIndex;
                    const Icon = status.icon;

                    return (
                        <div key={status.key} className="flex items-start gap-3 relative">
                            {/* Vertical Line */}
                            {index < statuses.length - 1 && (
                                <div className={`absolute left-[11px] top-6 w-0.5 h-8 ${index < currentIndex ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                                    }`} />
                            )}

                            {/* Status Icon */}
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${isCompleted
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                                } ${isCurrent ? 'ring-2 ring-green-300 dark:ring-green-700' : ''}`}>
                                {isCompleted ? (
                                    <Check className="h-3.5 w-3.5" />
                                ) : (
                                    <Icon className="h-3 w-3" />
                                )}
                            </div>

                            {/* Status Label */}
                            <div className={`pb-8 ${index === statuses.length - 1 ? 'pb-0' : ''}`}>
                                <div className={`text-sm font-medium ${isCompleted ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
                                    }`}>
                                    {status.label}
                                </div>
                                {isCurrent && (
                                    <div className="text-xs text-green-600 dark:text-green-400 font-medium mt-0.5">
                                        Current Status
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* View Report Link */}
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <a
                    href={`/reports/generate/${report.alert_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                    <ExternalLink className="h-3 w-3" />
                    View Full Report
                </a>
            </div>
        </div>
    );
};


const WhatsAppShareModal = ({ isOpen, onClose, initialText }) => {
    const [text, setText] = React.useState(initialText);

    React.useEffect(() => {
        setText(initialText);
    }, [initialText]);

    const handleShare = async () => {
        await openWhatsAppGroupShare(text);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px] bg-white dark:bg-[#0f0f0f] border-gray-200 dark:border-gray-800">
                <DialogHeader>
                    <DialogTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Share2 className="h-5 w-5 text-green-500" />
                        Format & Share to WhatsApp
                    </DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="min-h-[300px] bg-gray-50 dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 resize-none focus-visible:ring-1 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-700 text-sm"
                        placeholder="Edit share message..."
                    />
                </div>
                <DialogFooter className="flex gap-2 sm:justify-end">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleShare}
                        className="bg-green-500 hover:bg-green-600 text-white gap-2"
                    >
                        <Share2 className="h-4 w-4" />
                        Share
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export const VideoPlayer = ({ url, preview, type, autoPlay = false, onError }) => {
    const videoRef = React.useRef(null);

    React.useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Use HLS.js if strictly needed or if browser doesn't support native HLS
        // Note: For proxied MP4s, isHLS will likely be false
        const isHLS = url.includes('.m3u8') || type === 'application/x-mpegURL';
        const Hls = require('hls.js'); // Require inside effect to avoid SSR issues if any, though here it's CRA

        // Use finalUrl instead of url for loading
        if (isHLS && Hls.isSupported()) {
            const hls = new Hls({
                xhrSetup: function (xhr, url) {
                    xhr.withCredentials = false; // Ensure no cookies sent
                }
            });
            hls.loadSource(url); // Use finalUrl
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function () {
                if (autoPlay) {
                    video.play().catch(() => { });
                }
            });
            return () => {
                hls.destroy();
            };
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            video.src = url;
        } else {
            // Standard MP4
            video.src = url;
        }
    }, [url, type, autoPlay]); // Depend on finalUrl

    return (
        <div className="w-full h-full relative flex items-center justify-center bg-black" onClick={(e) => e.stopPropagation()}>
            <video
                ref={videoRef}
                poster={preview}
                controls={!autoPlay}
                autoPlay={autoPlay}
                loop={autoPlay}
                muted={autoPlay}
                playsInline
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
                onError={onError}
                onClick={(e) => {
                    if (autoPlay) e.stopPropagation();
                }}
            />
        </div>
    );
};

// URL Card Component for link previews
const URLCard = ({ card }) => {
    if (!card || !card.expanded_url) return null;

    // Extract domain for display
    const getDomain = (url) => {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch {
            return card.display_url || url;
        }
    };

    return (
        <a
            href={card.expanded_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block mb-3 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
        >
            {card.image && (
                <div className="w-full aspect-[2/1] bg-gray-100 dark:bg-gray-800">
                    <img
                        src={card.image}
                        alt={card.title || 'Link preview'}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                </div>
            )}
            <div className="p-3">
                <div className="text-[13px] text-gray-500 dark:text-gray-400 mb-1">
                    {getDomain(card.expanded_url)}
                </div>
                {card.title && (
                    <div className="text-[15px] font-medium text-gray-900 dark:text-gray-100 line-clamp-2 mb-1">
                        {card.title}
                    </div>
                )}
                {card.description && (
                    <div className="text-[14px] text-gray-500 dark:text-gray-400 line-clamp-2">
                        {card.description}
                    </div>
                )}
            </div>
        </a>
    );
};

export const TwitterAlertCard = ({ alert, content, source, onResolve, onAddSource, onDelete, onEditSentiment, enableSpecialActions = false, monitoredHandles = [], viewMode = 'list', searchQuery, hideActions = false, report = null, isInvestigatedResult = false, customClass = '' }) => {
    const { user } = useAuth();
    const canEditDelete = enableSpecialActions && user?.email === SPECIAL_ACCESS_EMAIL;
    const [showReasonModal, setShowReasonModal] = useState(false);
    const [showFullTextModal, setShowFullTextModal] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadStatus, setDownloadStatus] = useState('');
    const [downloadError, setDownloadError] = useState(null);
    const [isMonitored, setIsMonitored] = useState(alert?.is_monitored || false);
    const navigate = useNavigate();

    // Sync isMonitored state when alert prop changes
    useEffect(() => {
        setIsMonitored(alert?.is_monitored || false);
    }, [alert?.is_monitored, alert?.id]);

    const handleDownloadStart = () => {
        setDownloading(true);
        setDownloadError(null);
        setDownloadProgress(0);
        setDownloadStatus('Downloading...');
    };

    const handleDownloadComplete = () => {
        setDownloadProgress(100);
        setDownloadStatus('Complete!');
        setTimeout(() => {
            setDownloading(false);
            setDownloadProgress(0);
            setDownloadStatus('');
        }, 1000);
    };

    const handleDownloadError = (error) => {
        setDownloadError(error);
        setDownloading(false);
        setDownloadProgress(0);
        setDownloadStatus('');
        setTimeout(() => setDownloadError(null), 3000);
    };

    // Helper to check if a handle is already monitored
    const isMonitoredHandle = (handle) => {
        if (!handle || !Array.isArray(monitoredHandles) || monitoredHandles.length === 0) return false;

        const cleanHandle = String(handle).replace(/^@/, '').toLowerCase().trim();
        return monitoredHandles.some(h => {
            if (!h) return false;
            return String(h).replace(/^@/, '').toLowerCase().trim() === cleanHandle;
        });
    };

    // Parsing date
    const dateObj = content?.published_at ? new Date(content.published_at) : null;
    const timeStr = dateObj ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const dateStr = dateObj ? dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

    const mediaItems = normalizeMediaList(content?.media);
    const quotedMediaItems = normalizeMediaList(content?.quoted_content?.media);

    // Gather additional media references (retweets, reposts, attachments, etc.) so downloads remain exhaustive
    const extraMediaSources = [
        content?.original_media,
        content?.reposted_content?.media,
        content?.retweeted_content?.media,
        content?.retweeted_content?.quoted_content?.media,
        content?.referenced_tweet?.media,
        content?.parent?.media,
        content?.extended_entities?.media,
        content?.media_entities,
        content?.attachments?.media,
        content?.cards_media
    ];
    const extraMediaItems = extraMediaSources.flatMap((m) => normalizeMediaList(m));

    const aggregatedMediaItems = [...mediaItems, ...quotedMediaItems, ...extraMediaItems];
    const uniqueMediaItems = [];
    const seenMediaUrls = new Set();
    for (const item of aggregatedMediaItems) {
        if (!item || !item.url) continue;
        if (seenMediaUrls.has(item.url)) continue;
        seenMediaUrls.add(item.url);
        uniqueMediaItems.push(item);
    }

    // Engagement
    const metrics = content?.engagement || {};
    const contentText = content?.text || alert.description || '';
    const shouldShowReadMore = contentText.length > 150 || (contentText.match(/\n/g) || []).length >= 2;
    const quotedContentText = content?.quoted_content?.text || '';
    const shouldShowQuotedReadMore = quotedContentText.length > 130 || (quotedContentText.match(/\n/g) || []).length >= 2;

    const [showActionDropdown, setShowActionDropdown] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [isTranslated, setIsTranslated] = useState(false);
    const [translatedText, setTranslatedText] = useState('');
    const [translatedQuotedText, setTranslatedQuotedText] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isQuotedExpanded, setIsQuotedExpanded] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowActionDropdown(false);
            }
        };

        if (showActionDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showActionDropdown]);

    const handleUpdateStatus = async (status) => {
        setActionLoading(true);
        try {
            if (status === 'escalated') {
                await api.put(`/alerts/${alert.id}`, { status: 'escalated' });
            } else {
                await api.put(`/alerts/${alert.id}`, { status });
            }
            if (onResolve) onResolve({ ...alert, status });
            setShowActionDropdown(false);
        } catch (error) {
            console.error('Failed to update status:', error);
            toast.error('Failed to update status: ' + (error.response?.data?.error || error.message));
        } finally {
            setActionLoading(false);
        }
    };

    const handleEditSentiment = async (sentiment) => {
        try {
            const res = await api.put(`/alerts/${alert.id}/sentiment`, { sentiment });
            onEditSentiment?.(alert.id, res.data.risk_level);
            toast.success('Sentiment updated');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update sentiment');
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/alerts/${alert.id}`);
            onDelete?.(alert.id);
            toast.success('Alert deleted');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete alert');
        }
    };

    const analysis = content?.analysis || {};
    const intentLabel = alert.threat_details?.intent || analysis.intent || analysis.topic || '';
    const reasons = alert.threat_details?.reasons || analysis.reasons || analysis.threat_model?.reasons || [];
    const highlights = alert.threat_details?.highlights || analysis.highlights || analysis.threat_model?.highlighted_phrases || [];
    const hasReasons = true;
    const mediaUrl = alert?.content_url || content?.url || content?.link || content?.content_url;
    const isDownloadableLink = isDownloadableSocialLink(mediaUrl);
    const canDownload = uniqueMediaItems.length > 0 || isDownloadableLink;



    // Share Modal State
    const [isShareModalOpen, setIsShareModalOpen] = React.useState(false);
    const [shareText, setShareText] = React.useState('');

    const generateShareText = () => {
        // Dynamic greeting
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

        // Data extraction
        const name = content?.is_repost ? (content.original_author_name || content.original_author) : (source?.name || alert.author || 'Unknown');
        const handle = content?.is_repost ? (content.original_author) : (content?.author_handle || source?.handle || 'unknown');
        const description = content?.text || alert.description || '';
        const link = alert.content_url || '';
        const views = metrics.views || 0;
        const reposts = metrics.retweets || 0;

        // Extract detected content
        let riskInfo = '';
        const visibleRiskFactors = filterRiskFactors(content);
        if (visibleRiskFactors.length > 0) {
            const risks = visibleRiskFactors.map(r => r.keyword || r.context).filter(Boolean);
            if (risks.length > 0) {
                riskInfo = `\n\nDetected Content: ${risks.join(', ')}`;
            }
        }

        // Construct message - simplified format without media links
        return {
            text: `${greeting} sir,\n\n*Posted by:* ${name} (@${handle.replace('@', '')})\n\n*Description:*\n${description}${riskInfo}\n\n*Tweet URL:* ${link}\n\n*Engagement:*\nViews: ${views} | Reposts: ${reposts}`
        };
    };

    const handleFormatClick = (e) => {
        e.stopPropagation();
        const { text } = generateShareText();
        setShareText(text);
        setIsShareModalOpen(true);
    };

    const handleQuickShare = async (e) => {
        e.stopPropagation();
        const { text } = generateShareText();
        await openWhatsAppGroupShare(text);
    };

    const handleProfileClick = (e) => {
        e.stopPropagation();
        const handle = content?.is_repost
            ? (content.original_author || content.author_handle)
            : (content?.author_handle || source?.handle || alert.author_handle);
        if (!handle) return;

        const sanitizedHandle = handle.replace(/^@/, '');
        const isUrl = /^https?:\/\//i.test(handle);
        const platform = alert?.platform || 'x';

        if (platform === 'instagram') {
            const profileUrl = isUrl ? handle : `https://www.instagram.com/${sanitizedHandle}/`;
            window.open(profileUrl, '_blank');
            return;
        }

        if (platform === 'facebook') {
            const profileUrl = isUrl ? handle : `https://www.facebook.com/${sanitizedHandle}`;
            window.open(profileUrl, '_blank');
            return;
        }

        navigate(`/x-monitor?handle=${sanitizedHandle}`);
    };

    const handleTranslate = async (e) => {
        e.stopPropagation();
        if (isTranslated) {
            setIsTranslated(false);
            return;
        }

        if (translatedText || translatedQuotedText) {
            setIsTranslated(true);
            return;
        }

        setIsTranslating(true);
        try {
            const promises = [api.post('/alerts/translate', { text: contentText })];
            const hasQuoted = content?.quoted_content?.text;

            if (hasQuoted) {
                promises.push(api.post('/alerts/translate', { text: content.quoted_content.text }));
            }

            const results = await Promise.all(promises);
            setTranslatedText(results[0].data.translatedText);

            if (hasQuoted && results[1]) {
                setTranslatedQuotedText(results[1].data.translatedText);
            }

            setIsTranslated(true);
        } catch (error) {
            console.error('Translation failed:', error);
            toast.error('Translation failed. Please try again.');
        } finally {
            setIsTranslating(false);
        }
    };

    const handleCardClick = (e) => {
        // Prevent navigation if clicking on interactive elements
        if (e.target.closest('button') || e.target.closest('a') || (e.target.tagName === 'IMG' && !e.target.closest('.grid'))) {
            // We allow IMG clicks in the media grid (handled there), but avatar IMG is handled by handleProfileClick.
            // Actually, providing specific handlers ensures control.
            return;
        }
        if (alert.content_url) {
            window.open(alert.content_url, '_blank');
        }
    };

    const timeAgo = dateObj ? formatDistanceToNow(dateObj, { addSuffix: true }) : '';

    return (
        <>
            <ReasonModal
                open={showReasonModal}
                onClose={() => setShowReasonModal(false)}
                alert={alert}
                content={content}
                analysis={analysis}
            />
            <Dialog open={showFullTextModal} onOpenChange={setShowFullTextModal}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Alert Content</DialogTitle>
                    </DialogHeader>
                    <div className="text-sm text-foreground whitespace-pre-wrap break-words">
                        {contentText || 'No content available.'}
                    </div>
                </DialogContent>
            </Dialog>
            <div className={`bg-card dark:bg-[#0d1117] border border-border rounded-md hover:shadow-md transition-shadow duration-200 font-sans relative flex flex-col overflow-hidden ${viewMode === 'list' ? 'max-w-md w-full self-start shadow-sm' : 'w-full h-full shadow-sm'} ${isInvestigatedResult ? 'ring-1 ring-amber-300/50' : ''} ${customClass}`}>
                {/* Risk Level Left Border Indicator */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${(alert.risk_level === 'high' || alert.risk_level === 'critical') ? 'bg-red-500' :
                    (alert.risk_level === 'medium') ? 'bg-amber-500' :
                        'bg-emerald-500'
                    }`} />

                <div className="p-4 pl-5">
                    {/* Risk & Viral Badges (same row, absolute positioned) */}
                    <div className="absolute left-0 top-2.5 z-10 flex items-center gap-1.5">
                        <div className={`rounded-r-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm ${(alert.risk_level === 'high' || alert.risk_level === 'critical') ? 'bg-red-600 text-white' :
                            (alert.risk_level === 'medium') ? 'bg-amber-500 text-black' :
                                'bg-emerald-500 text-white'
                            }`}>
                            {(alert.risk_level === 'high' || alert.risk_level === 'critical') ? 'negative' : alert.risk_level === 'medium' ? 'moderate' : 'positive'}
                        </div>
                        {alert.alert_type === 'velocity' && (
                            <div className="rounded-r-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm bg-white text-blue-900">
                                Viral
                            </div>
                        )}
                        {/* Content availability status */}
                        {content?.is_deleted && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-red-600 px-2 py-0.5 rounded-full">
                                <Trash2 className="h-2.5 w-2.5" />
                                Deleted{content.deleted_at ? ` · ${new Date(content.deleted_at).toLocaleDateString()}` : ''}
                            </span>
                        )}
                        {content?.is_expired && !content?.is_deleted && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-amber-500 px-2 py-0.5 rounded-full">
                                <Clock className="h-2.5 w-2.5" />
                                Expired
                            </span>
                        )}
                    </div>
                    {/* Action Controls - right-aligned, wraps left on smaller screens */}
                    <div className="flex items-center gap-2 flex-wrap justify-end mt-3 mb-2">

                        {canEditDelete && (
                            <select
                                className="h-7 text-[11px] font-semibold rounded ring-1 ring-slate-200 bg-slate-100 text-slate-700 px-1"
                                title="Edit sentiment"
                                value={RISK_TO_SENTIMENT[alert.risk_level] || 'neutral'}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => { e.stopPropagation(); handleEditSentiment(e.target.value); }}
                            >
                                <option value="positive">Positive</option>
                                <option value="neutral">Moderate</option>
                                <option value="negative">Negative</option>
                            </select>
                        )}
                        {canEditDelete && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                                className="h-7 w-7 flex items-center justify-center text-red-700 bg-red-100 hover:bg-red-200 ring-1 ring-red-200 rounded-md transition-colors"
                                title="Delete"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        )}

                        {/* Action Button */}
                        {!hideActions && alert.status === 'active' && (
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowActionDropdown(!showActionDropdown);
                                    }}
                                    className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 z-20 p-1.5 rounded-md hover:bg-accent transition-colors"
                                >
                                    <Zap className="h-3.5 w-3.5" />
                                    <span>Action</span>
                                </button>

                                {showActionDropdown && (
                                    <div className="absolute top-full left-0 mt-1 w-40 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-top-1">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus('acknowledged'); }}
                                            disabled={actionLoading}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-foreground hover:bg-accent flex items-center gap-2 transition-colors"
                                        >
                                            <Check className="h-3 w-3 text-primary" />
                                            Acknowledge
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus('escalated'); }}
                                            disabled={actionLoading}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-2 transition-colors"
                                        >
                                            <AlertCircle className="h-3 w-3" />
                                            Escalate
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus('false_positive'); }}
                                            disabled={actionLoading}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent flex items-center gap-2 transition-colors"
                                        >
                                            <XCircle className="h-3 w-3" />
                                            False Positive
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {!hideActions && alert.status === 'escalated' && (
                            <div className="flex items-center gap-1.5">
                                <div className="relative" ref={dropdownRef}>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setShowActionDropdown(!showActionDropdown);
                                        }}
                                        className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 z-20 p-1.5 rounded-md hover:bg-accent transition-colors"
                                    >
                                        <Zap className="h-3.5 w-3.5" />
                                        <span>Action</span>
                                    </button>

                                    {showActionDropdown && (
                                        <div className="absolute top-full left-0 mt-1 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl z-50 overflow-hidden py-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus('acknowledged'); }}
                                                disabled={actionLoading}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-foreground hover:bg-accent flex items-center gap-2 transition-colors"
                                            >
                                                <Check className="h-3 w-3 text-primary" />
                                                Move to Acknowledged
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus('false_positive'); }}
                                                disabled={actionLoading}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent flex items-center gap-2 transition-colors"
                                            >
                                                <XCircle className="h-3 w-3" />
                                                Move to False Positive
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {report ? (
                                    <HoverCard>
                                        <HoverCardTrigger asChild>
                                            <button
                                                className="text-xs font-medium text-emerald-600 flex items-center gap-1 z-20 cursor-default p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-900/20"
                                            >
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                Generated
                                            </button>
                                        </HoverCardTrigger>
                                        <HoverCardContent
                                            className="w-[320px] p-0 bg-popover border border-border shadow-lg"
                                            side="bottom"
                                            align="end"
                                        >
                                            <ReportStatusTracker report={report} />
                                        </HoverCardContent>
                                    </HoverCard>
                                ) : (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            window.open(`/reports/generate/${alert.id}`, '_blank');
                                        }}
                                        className="text-xs font-medium text-destructive hover:text-destructive/80 flex items-center gap-1 z-20 p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                                    >
                                        <FilePlus className="h-3.5 w-3.5" />
                                        Generate
                                    </button>
                                )}
                            </div>
                        )}

                        {!hideActions && (alert.status === 'acknowledged' || alert.status === 'false_positive') && (
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowActionDropdown(!showActionDropdown);
                                    }}
                                    className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 z-20 p-1.5 rounded-md hover:bg-accent transition-colors"
                                >
                                    <Zap className="h-3.5 w-3.5" />
                                    <span>Action</span>
                                </button>

                                {showActionDropdown && (
                                    <div className="absolute top-full left-0 mt-1 w-44 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-top-1">

                                        {/* Show Acknowledge option only if currently false_positive */}
                                        {alert.status === 'false_positive' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus('acknowledged'); }}
                                                disabled={actionLoading}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-foreground hover:bg-accent flex items-center gap-2 transition-colors"
                                            >
                                                <Check className="h-3 w-3 text-primary" />
                                                Move to Acknowledged
                                            </button>
                                        )}

                                        {/* Show False Positive option only if currently acknowledged */}
                                        {alert.status === 'acknowledged' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus('false_positive'); }}
                                                disabled={actionLoading}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent flex items-center gap-2 transition-colors"
                                            >
                                                <XCircle className="h-3 w-3" />
                                                Move to False Positive
                                            </button>
                                        )}

                                        {/* Escalate - always available */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus('escalated'); }}
                                            disabled={actionLoading}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-2 transition-colors"
                                        >
                                            <AlertCircle className="h-3 w-3" />
                                            Escalate
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={handleFormatClick}
                            className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 z-20 px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
                            title="Format & Share"
                        >
                            <FileText className="h-3.5 w-3.5" />
                            {alert.status !== 'escalated' && <span>Format & Share</span>}
                        </button>

                        {canDownload && (
                            <DownloadMenu
                                mediaItems={uniqueMediaItems}
                                mediaUrl={mediaUrl}
                                contentId={content?.id}
                                onDownloadStart={handleDownloadStart}
                                onDownloadComplete={handleDownloadComplete}
                                onDownloadError={handleDownloadError}
                                downloading={downloading}
                                downloadProgress={downloadProgress}
                                downloadStatus={downloadStatus}
                                downloadError={downloadError}
                                showLabel={false}
                            />
                        )}

                        {/* Engager Analysis button — queues a Frequent Engagers analysis
                            for this card's handle; view results from the Frequent
                            Engagers dialog on the Alerts toolbar. */}
                        <button
                            onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (alert?.platform !== 'x') {
                                    toast.info('Frequent Engagers is only available for X/Twitter posts');
                                    return;
                                }
                                const tweetHandle = content?.is_repost
                                    ? content.original_author
                                    : (content?.author_handle || source?.handle);
                                const cleanHandle = tweetHandle ? String(tweetHandle).replace(/^@/, '').trim() : null;
                                if (!cleanHandle || cleanHandle === 'unknown') {
                                    toast.error('No X handle found for this alert');
                                    return;
                                }
                                try {
                                    const res = await api.post('/engager/engager-analysis', { handle: cleanHandle, period_days: 30 });
                                    const status = res.data?.status;
                                    if (status === 'already_processing') {
                                        toast.warning(`Analysis for @${cleanHandle} is already in progress`);
                                    } else if (status === 'blocked') {
                                        toast.warning('Another analysis is processing. Please wait.');
                                    } else {
                                        toast.success(`Engager analysis started for @${cleanHandle}`);
                                    }
                                } catch {
                                    toast.error('Failed to start engager analysis');
                                }
                            }}
                            className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors z-20"
                            title="Analyze Engagers"
                        >
                            <Users className="h-4 w-4" />
                        </button>

                        {/* View Details button - always visible */}
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowReasonModal(true);
                            }}
                            className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors z-20"
                            title="View Details"
                        >
                            <Eye className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Alert Title/Reason Removed to save space */}

                    {/* Repost Header */}
                    {content?.is_repost && (
                        <div className="flex items-center gap-2 mb-2 text-[13px] text-muted-foreground font-medium pl-10">
                            <Repeat className="h-4 w-4" />
                            <span
                                className="hover:underline cursor-pointer"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const repostHandle = content?.author_handle || source?.handle || alert.author_handle;
                                    if (repostHandle) navigate(`/x-monitor?handle=${repostHandle.replace('@', '')}`);
                                }}
                            >
                                <HighlightText text={source?.name || alert.author} highlight={searchQuery} /> reposted
                            </span>
                        </div>
                    )}

                    {/* Header: Avatar | Name/Handle | Platform */}
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex gap-2.5">
                            <div
                                className="flex-shrink-0 cursor-pointer"
                                onClick={handleProfileClick}
                            >
                                <div className="h-9 w-9 rounded-full bg-muted overflow-hidden ring-1 ring-border">
                                    <img
                                        src={content?.is_repost
                                            ? (content.original_author_avatar || `https://unavatar.io/twitter/${content.original_author}`)
                                            : (source?.profile_image_url || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png')}
                                        alt={content?.is_repost ? (content.original_author_name || content.original_author) : source?.name}
                                        className="h-full w-full object-cover"
                                        onError={(e) => { e.target.src = 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'; }}
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col min-w-0 cursor-pointer" onClick={handleProfileClick}>
                                <div className="flex items-center gap-1 group">
                                    <span className="font-semibold text-sm text-foreground leading-5 hover:underline truncate">
                                        <HighlightText text={content?.is_repost
                                            ? (content.original_author_name || content.original_author || 'Unknown User')
                                            : (source?.name || alert.author)} highlight={searchQuery} />
                                    </span>
                                    {!content?.is_repost && source?.is_verified && <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 fill-blue-500 flex-shrink-0" />}
                                </div>
                                <div className="text-xs text-muted-foreground leading-5 truncate">
                                    <HighlightText text={(content?.is_repost
                                        ? (content.original_author || 'unknown')
                                        : (content?.author_handle || source?.handle || 'user')).replace(/^@?/, '@')} highlight={searchQuery} />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0 pl-16 flex-wrap justify-end ml-auto">
                            {(() => {
                                const targetHandle = content?.is_repost
                                    ? (content.original_author || content.original_author_handle)
                                    : (content?.author_handle || source?.handle || alert.author_handle);

                                const reposterHandle = content?.author_handle || source?.handle || alert.author_handle;
                                const isSelfRepost = content?.is_repost &&
                                    targetHandle?.replace(/^@/, '').toLowerCase() === reposterHandle?.replace(/^@/, '').toLowerCase();

                                if (onAddSource && !isMonitoredHandle(targetHandle) && !isSelfRepost) {
                                    return (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 w-7 p-0 border-primary/30 text-primary hover:bg-primary/5 rounded-md flex-shrink-0"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const sourceData = {
                                                    platform: alert.platform || 'x',
                                                    identifier: targetHandle,
                                                    display_name: content?.is_repost
                                                        ? (content.original_author_name || content.original_author)
                                                        : (source?.name || alert.author),
                                                    category: 'unknown'
                                                };
                                                onAddSource(sourceData);
                                            }}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    );
                                }
                                return null;
                            })()}
                            <div className="p-1 rounded-md bg-muted/50">
                                {alert.platform === 'instagram' ? (
                                    <Instagram className="h-3.5 w-3.5 text-[#E4405F]" />
                                ) : alert.platform === 'facebook' ? (
                                    <Facebook className="h-3.5 w-3.5 text-[#1877F2]" />
                                ) : (
                                    <Twitter className="h-3.5 w-3.5 text-[#1DA1F2]" />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className={`text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words mb-2 ${!isExpanded ? 'line-clamp-3' : ''}`}>
                        <HighlightText text={isTranslated ? translatedText : contentText} highlight={searchQuery} />
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                        {shouldShowReadMore && (
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsExpanded(!isExpanded);
                                }}
                                className="text-[11px] font-medium text-primary hover:text-primary/80"
                            >
                                {isExpanded ? 'Read less' : 'Read more'}
                            </button>
                        )}
                        <button
                            onClick={handleTranslate}
                            disabled={isTranslating}
                            className="text-[11px] font-medium text-primary hover:text-primary/80 flex items-center gap-1"
                        >
                            {isTranslating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <Globe className="h-3 w-3" />
                            )}
                            <span>{isTranslated ? 'Show Original' : (isTranslating ? 'Translating...' : 'Translate')}</span>
                        </button>
                    </div>

                    {/* Media Grid */}
                    {mediaItems.length > 0 && (
                        <div className={`mb-3 grid gap-0.5 rounded-md overflow-hidden border border-border ${mediaItems.length === 1 ? 'grid-cols-1' :
                            mediaItems.length === 2 ? 'grid-cols-2' :
                                mediaItems.length === 3 ? 'grid-cols-2' :
                                    'grid-cols-2'
                            } ${viewMode === 'list' ? 'max-w-md' : ''}`}>
                            {mediaItems.slice(0, 4).map((item, idx) => {
                                const { url, type, preview } = item;
                                const isInstagramReel = alert?.platform === 'instagram'
                                    && mediaItems.length === 1
                                    && (type === 'video' || type === 'animated_gif');
                                const mediaAspectClass = mediaItems.length > 1
                                    ? 'aspect-[4/3]'
                                    : (isInstagramReel
                                        ? 'aspect-[9/16]'
                                        : (type === 'video' || type === 'animated_gif' ? 'aspect-video' : 'max-h-[500px]'));
                                return (
                                    <div key={idx} className={`relative bg-muted ${mediaItems.length === 3 && idx === 0 ? 'row-span-2' : ''
                                        } ${mediaAspectClass}`}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {type === 'video' || type === 'animated_gif' ? (
                                            <VideoPlayer url={url} preview={preview} type={type} autoPlay={type === 'animated_gif'} />
                                        ) : (
                                            <img
                                                src={url}
                                                alt={`Media ${idx + 1}`}
                                                className="w-full h-full object-cover hover:opacity-95 transition-opacity"
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* URL Cards (Link Previews) */}
                    {content?.url_cards && Array.isArray(content.url_cards) && content.url_cards.length > 0 && (
                        <div className="space-y-2">
                            {content.url_cards.slice(0, 1).map((card, idx) => (
                                <URLCard key={idx} card={card} />
                            ))}
                        </div>
                    )}

                    {/* Quoted Tweet */}
                    {content?.quoted_content && (
                        <div className="mb-3 rounded-md border border-border overflow-hidden hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); window.open(`https://x.com/${content.quoted_content.author_handle}`, '_blank'); }}>

                            <div className="p-3">
                                <div className="flex items-center gap-1 mb-1">
                                    <div className="h-5 w-5 rounded-full bg-muted overflow-hidden mr-1">
                                        <img src={content.quoted_content.profile_image_url || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'}
                                            className="h-full w-full object-cover" />
                                    </div>
                                    <span className="font-semibold text-sm text-foreground truncate">{content.quoted_content.author_name}</span>
                                    <span className="text-xs text-muted-foreground truncate">@{content.quoted_content.author_handle}</span>
                                    {(() => {
                                        const quotedHandle = content.quoted_content.author_handle;
                                        const mainAuthorHandle = content?.author_handle || source?.handle || alert.author_handle;
                                        const isSameUser = quotedHandle?.replace(/^@/, '').toLowerCase() === mainAuthorHandle?.replace(/^@/, '').toLowerCase();

                                        if (onAddSource && !isMonitoredHandle(quotedHandle) && !isSameUser) {
                                            return (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-5 px-1.5 text-[9px] gap-1 text-primary hover:bg-primary/5 ml-1"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const sourceData = {
                                                            platform: 'x',
                                                            identifier: quotedHandle,
                                                            display_name: content.quoted_content.author_name,
                                                            category: 'others'
                                                        };
                                                        onAddSource(sourceData);
                                                    }}
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </Button>
                                            );
                                        }
                                        return null;
                                    })()}
                                    <span className="text-xs text-muted-foreground">·</span>
                                    <span className="text-xs text-muted-foreground">{content.quoted_content.created_at ? new Date(content.quoted_content.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>
                                </div>
                                <div className={`text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words ${!isQuotedExpanded ? 'line-clamp-3' : ''}`}>
                                    {isTranslated ? translatedQuotedText : content.quoted_content.text}
                                </div>
                                {shouldShowQuotedReadMore && (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setIsQuotedExpanded(!isQuotedExpanded);
                                        }}
                                        className="text-[11px] font-medium text-primary hover:text-primary/80 mt-1"
                                    >
                                        {isQuotedExpanded ? 'Read less' : 'Read more'}
                                    </button>
                                )}
                                <button
                                    onClick={handleTranslate}
                                    disabled={isTranslating}
                                    className="text-[11px] font-medium text-primary hover:text-primary/80 flex items-center gap-1 mt-1"
                                >
                                    {isTranslating ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <Globe className="h-3 w-3" />
                                    )}
                                    <span>{isTranslated ? 'Show Original' : (isTranslating ? 'Translating...' : 'Translate')}</span>
                                </button>
                            </div>

                            {/* Quoted Media */}
                            {quotedMediaItems.length > 0 && (
                                <div className={`mt-0 grid gap-0.5 border-t border-border ${quotedMediaItems.length === 1 ? 'grid-cols-1' :
                                    quotedMediaItems.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                                    {quotedMediaItems.slice(0, 4).map((item, idx) => {
                                        const { url, type, preview } = item;
                                        return (
                                            <div key={idx} className={`relative bg-muted ${quotedMediaItems.length > 1 ? 'aspect-[4/3]' : (type === 'video' || type === 'animated_gif' ? 'aspect-video' : 'max-h-[300px]')}`}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {type === 'video' || type === 'animated_gif' ? (
                                                    <VideoPlayer url={url} preview={preview} type={type} autoPlay={type === 'animated_gif'} />
                                                ) : (
                                                    <img src={url} className="w-full h-full object-cover" onError={(e) => e.target.style.display = 'none'} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Metadata Line */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-2.5 border-y border-border/50">
                        <span>{timeStr}</span>
                        <span className="text-border">·</span>
                        <span>{dateStr}</span>
                        <span className="text-border">·</span>
                        <span className="font-semibold text-foreground">{formatMetric(metrics.views || 0)}</span>
                        <span className="ml-0.5">Views</span>
                    </div>

                    {/* Engagement Stats Bar */}
                    <div className="flex justify-between items-center py-1.5 px-1">
                        <div className="group flex items-center gap-1 cursor-pointer text-muted-foreground hover:text-blue-500 transition-colors p-1.5">
                            <div className="p-1 rounded-full group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors">
                                <MessageCircle className="h-4 w-4" />
                            </div>
                            <span className="text-[11px] group-hover:text-blue-500">{metrics.replies > 0 ? formatMetric(metrics.replies) : ''}</span>
                        </div>

                        <div className="group flex items-center gap-1 cursor-pointer text-muted-foreground hover:text-emerald-500 transition-colors p-1.5">
                            <div className="p-1 rounded-full group-hover:bg-emerald-50 dark:group-hover:bg-emerald-900/20 transition-colors">
                                <Repeat className="h-4 w-4" />
                            </div>
                            <span className="text-[11px] group-hover:text-emerald-500">{metrics.retweets > 0 ? formatMetric(metrics.retweets) : ''}</span>
                        </div>

                        <div className="group flex items-center gap-1 cursor-pointer text-muted-foreground hover:text-pink-600 transition-colors p-1.5">
                            <div className="p-1 rounded-full group-hover:bg-pink-50 dark:group-hover:bg-pink-900/20 transition-colors">
                                <Heart className="h-4 w-4" />
                            </div>
                            <span className="text-[11px] group-hover:text-pink-600">{metrics.likes > 0 ? formatMetric(metrics.likes) : ''}</span>
                        </div>

                        <div className="group flex items-center gap-1 cursor-pointer text-muted-foreground hover:text-blue-500 transition-colors p-1.5">
                            <div className="p-1 rounded-full group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors">
                                <Share className="h-4 w-4" />
                            </div>
                        </div>
                    </div>
                </div>{/* End of p-4 pl-5 content wrapper */}

                <WhatsAppShareModal
                    isOpen={isShareModalOpen}
                    onClose={() => setIsShareModalOpen(false)}
                    initialText={shareText}
                />
            </div>
        </>
    );
};
TwitterAlertCard.displayName = 'TwitterAlertCard';

export const YoutubeAlertCard = ({ alert, content, source, onResolve, onAddSource, onDelete, onEditSentiment, enableSpecialActions = false, monitoredHandles = [], viewMode = 'list', hideActions = false, report = null, isInvestigatedResult = false, customClass = '' }) => {
    const { user } = useAuth();
    const canEditDelete = enableSpecialActions && user?.email === SPECIAL_ACCESS_EMAIL;
    const [showReasonModal, setShowReasonModal] = useState(false);
    const [showFullTextModal, setShowFullTextModal] = useState(false);
    const [showActionDropdown, setShowActionDropdown] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [isMonitored, setIsMonitored] = useState(alert?.is_monitored || false);
    const [isTranslated, setIsTranslated] = useState(false);
    const [translatedText, setTranslatedText] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const dropdownRef = useRef(null);

    // Sync isMonitored state when alert prop changes
    useEffect(() => {
        setIsMonitored(alert?.is_monitored || false);
    }, [alert?.is_monitored, alert?.id]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowActionDropdown(false);
            }
        };

        if (showActionDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showActionDropdown]);

    const handleUpdateStatus = async (status) => {
        setActionLoading(true);
        try {
            await api.put(`/alerts/${alert.id}`, { status });
            if (onResolve) onResolve({ ...alert, status });
            setShowActionDropdown(false);
        } catch (error) {
            console.error('Failed to update status:', error);
            toast.error('Failed to update status: ' + (error.response?.data?.error || error.message));
        } finally {
            setActionLoading(false);
        }
    };

    const handleEditSentiment = async (sentiment) => {
        try {
            const res = await api.put(`/alerts/${alert.id}/sentiment`, { sentiment });
            onEditSentiment?.(alert.id, res.data.risk_level);
            toast.success('Sentiment updated');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update sentiment');
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/alerts/${alert.id}`);
            onDelete?.(alert.id);
            toast.success('Alert deleted');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete alert');
        }
    };

    const [downloading, setDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadStatus, setDownloadStatus] = useState('');
    const [downloadError, setDownloadError] = useState(null);

    const handleDownloadStart = () => {
        setDownloading(true);
        setDownloadError(null);
        setDownloadProgress(0);
        setDownloadStatus('Downloading...');
    };

    const handleDownloadComplete = () => {
        setDownloadProgress(100);
        setDownloadStatus('Complete!');
        setTimeout(() => {
            setDownloading(false);
            setDownloadProgress(0);
            setDownloadStatus('');
        }, 1000);
    };

    const handleDownloadError = (error) => {
        setDownloadError(error);
        setDownloading(false);
        setDownloadProgress(0);
        setDownloadStatus('');
        setTimeout(() => setDownloadError(null), 3000);
    };

    // Helper to check if a handle is already monitored
    const isMonitoredHandle = (handle) => {
        if (!handle || !Array.isArray(monitoredHandles) || monitoredHandles.length === 0) return false;
        const cleanHandle = String(handle).toLowerCase().trim();
        return monitoredHandles.some(h => {
            if (!h) return false;
            return String(h).toLowerCase().trim() === cleanHandle;
        });
    };

    const metrics = content?.engagement || {};
    const date = content?.published_at ? new Date(content.published_at).toLocaleDateString() : '';
    const thumbnailUrl = content?.thumbnails?.medium?.url || content?.thumbnails?.default?.url || 'https://img.youtube.com/vi/placeholder/mqdefault.jpg';
    const isGrid = viewMode === 'grid';
    const contentText = content?.text || alert.description || '';
    const shouldShowReadMore = contentText.length > 150 || (contentText.match(/\n/g) || []).length >= 2;
    const analysis = content?.analysis || {};
    const intentLabel = alert.threat_details?.intent || analysis.intent || analysis.topic || '';
    const reasons = alert.threat_details?.reasons || analysis.reasons || analysis.threat_model?.reasons || [];
    const highlights = alert.threat_details?.highlights || analysis.highlights || analysis.threat_model?.highlighted_phrases || [];
    const hasReasons = intentLabel || reasons.length > 0 || highlights.length > 0;
    const mediaUrl = alert?.content_url || content?.url || content?.link || content?.content_url;
    // Share Modal State
    const [isShareModalOpen, setIsShareModalOpen] = React.useState(false);
    const [shareText, setShareText] = React.useState('');

    const generateShareText = () => {
        // Dynamic greeting
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

        // Data extraction
        const name = source?.name || alert.author || 'Unknown';
        const description = content?.text || alert.description || '';
        const link = alert.content_url || '';
        const views = metrics.views || 0;

        // Extract detected content
        let riskInfo = '';
        const visibleRiskFactors = filterRiskFactors(content);
        if (visibleRiskFactors.length > 0) {
            const risks = visibleRiskFactors.map(r => r.keyword || r.context).filter(Boolean);
            if (risks.length > 0) {
                riskInfo = `\n\nDetected Content: ${risks.join(', ')}`;
            }
        }

        // Construct message for YouTube
        return {
            text: `${greeting} sir,\n\nThis was posted by ${name} YouTube channel\n\nDescription: ${description}${riskInfo}\n\nLink: ${link}\n\nViews:${views}`
        };
    };

    const handleTranslate = async (e) => {
        e.stopPropagation();
        if (isTranslated) {
            setIsTranslated(false);
            return;
        }

        if (translatedText) {
            setIsTranslated(true);
            return;
        }

        setIsTranslating(true);
        try {
            const response = await api.post('/alerts/translate', { text: contentText });
            setTranslatedText(response.data.translatedText);
            setIsTranslated(true);
        } catch (error) {
            console.error('Translation failed:', error);
            toast.error('Translation failed. Please try again.');
        } finally {
            setIsTranslating(false);
        }
    };

    const handleFormatClick = (e) => {
        e.stopPropagation();
        const { text } = generateShareText();
        setShareText(text);
        setIsShareModalOpen(true);
    };

    const handleQuickShare = async (e) => {
        e.stopPropagation();
        const { text } = generateShareText();
        await openWhatsAppGroupShare(text);
    };

    return (
        <>
            <ReasonModal
                open={showReasonModal}
                onClose={() => setShowReasonModal(false)}
                alert={alert}
                content={content}
                analysis={analysis}
            />
            <Dialog open={showFullTextModal} onOpenChange={setShowFullTextModal}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Alert Content</DialogTitle>
                    </DialogHeader>
                    <div className="text-sm text-foreground whitespace-pre-wrap break-words">
                        {contentText || 'No content available.'}
                    </div>
                </DialogContent>
            </Dialog>
            <div className={`flex flex-col bg-card dark:bg-[#0d1117] border border-border rounded-md hover:shadow-md transition-shadow duration-200 group relative overflow-hidden ${isGrid ? 'w-full h-full' : 'max-w-md w-full self-start shadow-sm'} ${customClass}`}>
                {/* Risk Level Left Border Indicator */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${(alert.risk_level === 'high' || alert.risk_level === 'critical') ? 'bg-red-500' :
                    (alert.risk_level === 'medium') ? 'bg-amber-500' :
                        (alert.risk_level === 'low') ? 'bg-emerald-500' :
                            'bg-slate-300 dark:bg-slate-700'
                    }`} />

                <div className="px-4 pl-5 pt-3 pb-1.5">
                    {/* Risk & Viral Badges (same row, absolute positioned) */}
                    <div className="absolute left-0 top-2.5 z-10 flex items-center gap-1.5">
                        <div className={`rounded-r-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm ${(alert.risk_level === 'high' || alert.risk_level === 'critical') ? 'bg-red-600 text-white' :
                            (alert.risk_level === 'medium') ? 'bg-amber-500 text-black' :
                                (alert.risk_level === 'low') ? 'bg-emerald-500 text-white' :
                                    'bg-slate-400 text-white'
                            }`}>
                            {(alert.risk_level === 'high' || alert.risk_level === 'critical') ? 'negative' : alert.risk_level === 'medium' ? 'moderate' : 'positive'}
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {/* Content availability status */}
                        {content?.is_deleted && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-red-600 px-2 py-0.5 rounded-full">
                                <Trash2 className="h-2.5 w-2.5" />
                                Deleted{content.deleted_at ? ` · ${new Date(content.deleted_at).toLocaleDateString()}` : ''}
                            </span>
                        )}
                        {content?.is_expired && !content?.is_deleted && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-amber-500 px-2 py-0.5 rounded-full">
                                <Clock className="h-2.5 w-2.5" />
                                Expired
                            </span>
                        )}
                        {isInvestigatedResult && onAddSource && !isMonitored && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] gap-1 border-primary/30 text-primary hover:bg-primary/5"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const sourceData = {
                                        platform: 'youtube',
                                        identifier: content?.author_handle || alert.content_details?.author_handle || alert.author,
                                        display_name: source?.name || alert.author,
                                        category: 'unknown'
                                    };
                                    onAddSource(sourceData);
                                }}
                            >
                                <FilePlus className="h-3 w-3" />
                                Monitor
                            </Button>
                        )}
                    </div>
                    {/* Action Controls - right-aligned, wraps left on smaller screens */}
                    <div className="flex items-center gap-2 flex-wrap justify-end mt-3">
                        {canEditDelete && (
                            <select
                                className="h-7 text-[11px] font-semibold rounded ring-1 ring-slate-200 bg-slate-100 text-slate-700 px-1"
                                title="Edit sentiment"
                                value={RISK_TO_SENTIMENT[alert.risk_level] || 'neutral'}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => { e.stopPropagation(); handleEditSentiment(e.target.value); }}
                            >
                                <option value="positive">Positive</option>
                                <option value="neutral">Moderate</option>
                                <option value="negative">Negative</option>
                            </select>
                        )}
                        {canEditDelete && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                                className="h-7 w-7 flex items-center justify-center text-red-700 bg-red-100 hover:bg-red-200 ring-1 ring-red-200 rounded-md transition-colors"
                                title="Delete"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        )}
                        {(() => {
                            const targetHandle = content?.channelId || alert.author_handle;
                            if (onAddSource && targetHandle && !isMonitoredHandle(targetHandle)) {
                                return (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 w-7 p-0 border-primary/30 text-primary hover:bg-primary/5 rounded-md flex-shrink-0"
                                        title="Monitor Profile"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const sourceData = {
                                                platform: 'youtube',
                                                identifier: targetHandle,
                                                display_name: content?.author_name || alert.author,
                                                category: 'others'
                                            };
                                            onAddSource(sourceData);
                                        }}
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                );
                            }
                            return null;
                        })()}
                        {mediaUrl && (
                            <DownloadMenu
                                mediaItems={[{ type: 'video', url: mediaUrl }]}
                                mediaUrl={mediaUrl}
                                contentId={content?.id}
                                onDownloadStart={handleDownloadStart}
                                onDownloadComplete={handleDownloadComplete}
                                onDownloadError={handleDownloadError}
                                downloading={downloading}
                                downloadProgress={downloadProgress}
                                downloadStatus={downloadStatus}
                                downloadError={downloadError}
                                showLabel={false}
                            />
                        )}
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
                            title="Relation"
                        >
                            <Users className="h-4 w-4" />
                        </button>
                        {/* Resolve Button */}
                        {onResolve && alert.status === 'active' && (
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    onResolve(alert);
                                }}
                                className="bg-white/90 dark:bg-black/80 px-2 py-0.5 rounded text-xs font-medium text-blue-600 hover:text-blue-700 shadow-sm border border-gray-100 dark:border-gray-700 backdrop-blur-sm"
                            >
                                Take Action
                            </button>
                        )}
                        {hasReasons && (
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowReasonModal(true);
                                }}
                                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
                                title="View Details"
                            >
                                <Eye className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Thumbnail */}
                <a
                    href={alert.content_url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`relative flex-shrink-0 w-full ${isGrid ? 'aspect-video' : 'md:w-[240px] aspect-video'} overflow-hidden bg-muted block mx-4 ml-5 rounded-md`}
                    style={{ width: 'calc(100% - 2.25rem)' }}
                >
                    <img
                        src={thumbnailUrl}
                        alt={alert.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            if (alert.content_url && alert.content_url.includes('v=')) {
                                const vid = alert.content_url.split('v=')[1]?.split('&')[0];
                                if (vid) e.target.src = `https://img.youtube.com/vi/${vid}/mqdefault.jpg`;
                            }
                        }}
                    />
                    {/* Download Progress Overlay */}
                    {downloading && (
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 backdrop-blur-sm rounded-md">
                            <Download className="h-8 w-8 text-white animate-bounce" />
                            <div className="w-3/4">
                                <div className="flex justify-between text-xs text-white mb-1">
                                    <span>{downloadStatus}</span>
                                    <span>{Math.round(downloadProgress)}%</span>
                                </div>
                                <div className="w-full bg-gray-600 rounded-full h-2 overflow-hidden">
                                    <div
                                        className="bg-green-500 h-full rounded-full transition-all duration-300 ease-out"
                                        style={{ width: `${downloadProgress}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs font-medium px-1.5 py-0.5 rounded">
                        {content?.duration || '0:00'}
                    </div>
                </a>

                {/* Info Section */}
                <div className="flex flex-col flex-grow min-w-0 px-4 pl-5 pb-4">
                    <a
                        href={alert.content_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mb-1.5"
                    >
                        <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                            {alert.title}
                        </h3>
                    </a>

                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
                        <span className="font-medium text-foreground/80 hover:underline">{source?.name || alert.author}</span>
                        <span className="text-border">•</span>
                        <span>{formatMetric(metrics.views || 0)} views</span>
                        <span className="text-border">•</span>
                        <span>{date}</span>
                    </div>

                    <div className={`text-xs text-muted-foreground mb-2 ${!isExpanded ? 'line-clamp-3' : ''} leading-relaxed`}>
                        {isTranslated ? translatedText : contentText}
                    </div>
                    <div className="flex items-center gap-3">
                        {shouldShowReadMore && (
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsExpanded(!isExpanded);
                                }}
                                className="text-[11px] font-medium text-primary hover:text-primary/80"
                            >
                                {isExpanded ? 'Read less' : 'Read more'}
                            </button>
                        )}
                        <button
                            onClick={handleTranslate}
                            disabled={isTranslating}
                            className="text-[11px] font-medium text-primary hover:text-primary/80 flex items-center gap-1"
                        >
                            {isTranslating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <Globe className="h-3 w-3" />
                            )}
                            <span>{isTranslated ? 'Show Original' : (isTranslating ? 'Translating...' : 'Translate')}</span>
                        </button>
                    </div>

                    {/* Risk Factors */}
                    {filterRiskFactors(content).length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-1.5">
                            {filterRiskFactors(content).map((factor, idx) => (
                                <div key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-[10px] font-medium text-red-700 dark:text-red-400">
                                    <Zap className="h-2.5 w-2.5 fill-red-700 dark:fill-red-400" />
                                    <span>
                                        {factor.keyword ? `Matched: "${factor.keyword}"` : factor.context || 'Risk Detected'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Threat Summary */}
                    {hasReasons && (
                        <div className="mb-3 flex items-center justify-between p-2 rounded-md bg-muted/50 border border-border">
                            <div className="flex items-center gap-2 flex-wrap">
                                {intentLabel && (
                                    <span className={`px-2 py-0.5 rounded-full font-medium text-[10px] ${intentLabel.toLowerCase().includes('violence') ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                        intentLabel.toLowerCase().includes('political') ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                                            intentLabel.toLowerCase().includes('communal') ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                                                'bg-muted text-muted-foreground'
                                        }`}>
                                        {intentLabel}
                                    </span>
                                )}
                                {highlights.length > 0 && (
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-muted-foreground">Flagged:</span>
                                        {highlights.slice(0, 2).map((phrase, idx) => (
                                            <span key={idx} className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded-full text-[10px] font-medium">
                                                {phrase}
                                            </span>
                                        ))}
                                        {highlights.length > 2 && (
                                            <span className="text-[10px] text-muted-foreground">+{highlights.length - 2}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    setShowReasonModal(true);
                                }}
                                className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 px-2 py-1 rounded-md hover:bg-accent transition-colors shrink-0"
                                title="View Details"
                            >
                                <Info className="h-3 w-3" />
                            </button>
                        </div>
                    )}

                    <div className="mt-auto flex items-center justify-between text-muted-foreground pt-2 border-t border-border/50">
                        <div className="flex gap-4">
                            <div className="flex items-center gap-1 text-[11px]">
                                <ThumbsUp className="h-3 w-3" />
                                <span>{formatMetric(metrics.likes || 0)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px]">
                                <MessageSquare className="h-3 w-3" />
                                <span>{formatMetric(metrics.comments || 0)}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] font-medium">
                            <AlertTriangleIcon level={alert.risk_level} />
                            <span className={`${alert.risk_level === 'high' || alert.risk_level === 'critical' ? 'text-red-500' : alert.risk_level === 'low' ? 'text-emerald-500' : 'text-amber-500'}`}>Risk: {content?.risk_score || alert.threat_details?.risk_score || 0}%</span>
                        </div>
                    </div>

                    {/* Action Bar */}
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/50">
                        {!hideActions && alert.status === 'active' && (
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowActionDropdown(!showActionDropdown);
                                    }}
                                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-primary/10 hover:bg-primary/15 text-primary font-medium text-xs transition-all"
                                >
                                    <Zap className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Action</span>
                                </button>

                                {showActionDropdown && (
                                    <div className="absolute top-full left-0 mt-1 w-44 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden py-1">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus('acknowledged'); }}
                                            disabled={actionLoading}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-foreground hover:bg-accent flex items-center gap-2 transition-colors"
                                        >
                                            <Check className="h-3 w-3 text-primary" />
                                            Acknowledge
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus('escalated'); }}
                                            disabled={actionLoading}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-2 transition-colors"
                                        >
                                            <AlertCircle className="h-3 w-3" />
                                            Escalate
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus('false_positive'); }}
                                            disabled={actionLoading}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent flex items-center gap-2 transition-colors"
                                        >
                                            <XCircle className="h-3 w-3" />
                                            False Positive
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {!hideActions && alert.status === 'escalated' && (
                            <div className="relative" ref={dropdownRef}>
                                {report ? (
                                    <HoverCard>
                                        <HoverCardTrigger asChild>
                                            <button className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md bg-emerald-50 text-emerald-600 font-medium text-xs border border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800">
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                <span className="hidden sm:inline">Report</span>
                                            </button>
                                        </HoverCardTrigger>
                                        <HoverCardContent className="w-[320px] p-0 shadow-lg" align="start">
                                            <ReportStatusTracker report={report} />
                                        </HoverCardContent>
                                    </HoverCard>
                                ) : (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            window.open(`/reports/generate/${alert.id}`, '_blank');
                                        }}
                                        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md bg-red-50 text-destructive font-medium text-xs border border-red-100 dark:bg-red-900/20 dark:border-red-800"
                                    >
                                        <FilePlus className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">Report</span>
                                    </button>
                                )}
                                <button
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowActionDropdown(!showActionDropdown); }}
                                    className="absolute top-1 right-1 p-0.5 hover:bg-black/5 rounded"
                                >
                                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                </button>
                                {showActionDropdown && (
                                    <div className="absolute top-full left-0 mt-1 w-44 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden py-1">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus('acknowledged'); }}
                                            disabled={actionLoading}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-foreground hover:bg-accent flex items-center gap-2 transition-colors"
                                        >
                                            <Check className="h-3 w-3 text-primary" />
                                            Move to Acknowledged
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus('false_positive'); }}
                                            disabled={actionLoading}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent flex items-center gap-2 transition-colors"
                                        >
                                            <XCircle className="h-3 w-3" />
                                            Move to False Positive
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {!hideActions && (alert.status === 'acknowledged' || alert.status === 'false_positive') && (
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowActionDropdown(!showActionDropdown); }}
                                    className={`w-full flex items-center justify-center gap-1 py-1 px-1 rounded-md font-semibold uppercase text-[10px] transition-all border ${alert.status === 'acknowledged' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-border'}`}
                                >
                                    {alert.status === 'acknowledged' ? 'Acknowledged' : 'False Positive'}
                                    <ChevronDown className="h-3 w-3" />
                                </button>

                                {showActionDropdown && (
                                    <div className="absolute top-full left-0 mt-1 w-44 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden py-1">
                                        {alert.status === 'false_positive' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus('acknowledged'); }}
                                                disabled={actionLoading}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-foreground hover:bg-accent flex items-center gap-2 transition-colors"
                                            >
                                                <Check className="h-3 w-3 text-primary" />
                                                Move to Acknowledged
                                            </button>
                                        )}
                                        {alert.status === 'acknowledged' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus('false_positive'); }}
                                                disabled={actionLoading}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent flex items-center gap-2 transition-colors"
                                            >
                                                <XCircle className="h-3 w-3" />
                                                Move to False Positive
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus('escalated'); }}
                                            disabled={actionLoading}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-2 transition-colors"
                                        >
                                            <AlertCircle className="h-3 w-3" />
                                            Escalate
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {!(alert.status === 'active' || alert.status === 'escalated' || alert.status === 'acknowledged' || alert.status === 'false_positive') && (
                            <div className="col-span-1"></div>
                        )}

                        <button className="col-span-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-muted hover:bg-accent text-muted-foreground font-medium text-xs transition-all"
                            onClick={handleFormatClick}
                        >
                            <FileText className="h-3.5 w-3.5" />
                            {alert.status !== 'escalated' && <span className="hidden sm:inline">Format</span>}
                        </button>

                        <button
                            className="col-span-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 dark:text-emerald-400 font-medium text-xs transition-all"
                            onClick={handleQuickShare}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z" />
                            </svg>
                            <span className={`${alert.status === 'escalated' ? 'hidden' : 'hidden sm:inline'}`}>Share</span>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};
YoutubeAlertCard.displayName = 'YoutubeAlertCard';

const AlertTriangleIcon = ({ level }) => {
    const color = level === 'high' || level === 'critical' ? '#ef4444' : '#f59e0b';
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
        </svg>
    )
}
