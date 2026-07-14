import React from 'react';
import { Network } from 'lucide-react';
import { getNodeColor } from './engagerFrequency';

/**
 * Hub-and-spoke SVG visualization: the analyzed handle in the center, its
 * top 8 engagers orbiting around it. Edge thickness communicates how many
 * of the source's tweets each engager has retweeted; node color communicates
 * their overall frequency tier.
 */
export const RetweetTree = ({ sourceHandle, sourceName, sourceAvatar, topRetweeters, totalRetweeters, onNodeClick, isMonitored }) => {
    const W = 580, H = 440;
    const cx = W / 2, cy = H / 2 - 10;
    const SRC_R = 34, NODE_R = 28, ORBIT = 155;
    const items = (topRetweeters || []).slice(0, 8);
    const n = items.length;

    if (n === 0) {
        return (
            <div className="h-56 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Network className="h-10 w-10 opacity-25" />
                <span className="text-sm">No retweet data for this period.</span>
                <span className="text-xs">Try a wider date range.</span>
            </div>
        );
    }

    const step = (Math.PI * 2) / n;
    const startA = -Math.PI / 2;
    const maxT = Math.max(1, ...items.map(r => r.tweet_count || 1));

    return (
        <div className="flex justify-center w-full overflow-hidden">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[540px]" style={{ maxHeight: 420 }}>
                <defs>
                    <filter id="nShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" /></filter>
                    <filter id="srcGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="4" result="b" /><feFlood floodColor="#3b82f6" floodOpacity="0.12" /><feComposite in2="b" operator="in" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                {/* orbit ring */}
                <circle cx={cx} cy={cy} r={ORBIT} fill="none" stroke="#3b82f6" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="5 5" />

                {/* edges */}
                {items.map((rt, i) => {
                    const a = startA + step * i;
                    const nx = cx + ORBIT * Math.cos(a), ny = cy + ORBIT * Math.sin(a);
                    const mx = cx + ORBIT * 0.45 * Math.cos(a), my = cy + ORBIT * 0.45 * Math.sin(a);
                    const w = Math.max(1.5, (rt.tweet_count / maxT) * 4.5);
                    const c = getNodeColor(rt.frequency);
                    const path = `M ${cx} ${cy} Q ${mx + (ny - cy) * 0.12} ${my - (nx - cx) * 0.12} ${nx} ${ny}`;
                    return (
                        <g key={`e-${i}`}>
                            <path d={path} fill="none" stroke={c} strokeWidth={w} strokeOpacity="0.3" strokeLinecap="round" />
                            <circle r="2" fill={c} opacity="0.5"><animateMotion path={path} dur={`${2.8 + i * 0.3}s`} repeatCount="indefinite" /></circle>
                        </g>
                    );
                })}

                {/* retweeter nodes */}
                {items.map((rt, i) => {
                    const a = startA + step * i;
                    const nx = cx + ORBIT * Math.cos(a), ny = cy + ORBIT * Math.sin(a);
                    const c = getNodeColor(rt.frequency);
                    const monitored = isMonitored(rt.handle);
                    const init = (rt.name || rt.handle || '?')[0].toUpperCase();
                    const lblY = ny < cy - 30 ? ny - NODE_R - 8 : ny + NODE_R + 14;
                    return (
                        <g key={`n-${i}`} className="cursor-pointer" onClick={() => onNodeClick(rt)}>
                            {/* outer ring */}
                            <circle cx={nx} cy={ny} r={NODE_R + 3} fill="none" stroke={c} strokeWidth="2.5" strokeOpacity="0.45" />
                            {/* bg */}
                            <circle cx={nx} cy={ny} r={NODE_R} fill="white" stroke="#e5e7eb" strokeWidth="1" filter="url(#nShadow)" />
                            {/* avatar / initial */}
                            {rt.avatar ? (
                                <>
                                    <clipPath id={`cr-${i}`}><circle cx={nx} cy={ny} r={NODE_R - 1} /></clipPath>
                                    <image href={rt.avatar} x={nx - NODE_R + 1} y={ny - NODE_R + 1} width={(NODE_R - 1) * 2} height={(NODE_R - 1) * 2} clipPath={`url(#cr-${i})`} />
                                </>
                            ) : (
                                <text x={nx} y={ny + 1} textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="700" fill="#374151">{init}</text>
                            )}
                            {/* tweet count badge top-right */}
                            <circle cx={nx + NODE_R - 3} cy={ny - NODE_R + 3} r="10" fill={c} stroke="white" strokeWidth="1.5" />
                            <text x={nx + NODE_R - 3} y={ny - NODE_R + 4} textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight="700" fill="white">{rt.tweet_count}</text>
                            {/* verified */}
                            {rt.verified && <>
                                <circle cx={nx + NODE_R - 3} cy={ny + NODE_R - 3} r="7" fill="#3b82f6" stroke="white" strokeWidth="1" />
                                <text x={nx + NODE_R - 3} y={ny + NODE_R - 2} textAnchor="middle" dominantBaseline="central" fontSize="7" fill="white">✓</text>
                            </>}
                            {/* redirect to X profile top-left */}
                            <g className="cursor-pointer" onClick={(e) => { e.stopPropagation(); window.open(`https://x.com/${rt.handle}`, '_blank', 'noopener,noreferrer'); }}>
                                <circle cx={nx - NODE_R + 3} cy={ny - NODE_R + 3} r="9" fill="#6b7280" stroke="white" strokeWidth="1.5" />
                                <g transform={`translate(${nx - NODE_R + 3},${ny - NODE_R + 3}) scale(0.55)`}>
                                    <path d="M-5,1 L-5,5 a1,1,0,0,0,1,1 L0,6 a1,1,0,0,0,1,-1 L1,1 a1,1,0,0,0,-1,-1 L-4,0" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <line x1="-2" y1="4" x2="5" y2="-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                                    <polyline points="1,-3 5,-3 5,1" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </g>
                            </g>
                            {/* label */}
                            <text x={nx} y={lblY} textAnchor="middle" fontSize="9" fontWeight="600" fill="#374151">@{rt.handle.length > 13 ? rt.handle.slice(0, 11) + '…' : rt.handle}</text>
                        </g>
                    );
                })}

                {/* center source */}
                <g filter="url(#srcGlow)">
                    <circle cx={cx} cy={cy} r={SRC_R + 3} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeOpacity="0.35" />
                    <circle cx={cx} cy={cy} r={SRC_R} fill="#2563eb" stroke="white" strokeWidth="2" />
                    {sourceAvatar ? (
                        <><clipPath id="cSrc"><circle cx={cx} cy={cy} r={SRC_R - 2} /></clipPath><image href={sourceAvatar} x={cx - SRC_R + 2} y={cy - SRC_R + 2} width={(SRC_R - 2) * 2} height={(SRC_R - 2) * 2} clipPath="url(#cSrc)" /></>
                    ) : (
                        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="700" fill="white">{(sourceName || sourceHandle || 'S')[0].toUpperCase()}</text>
                    )}
                </g>
                <text x={cx} y={cy + SRC_R + 16} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1e40af">@{sourceHandle}</text>
                <text x={cx} y={cy + SRC_R + 29} textAnchor="middle" fontSize="9" fill="#6b7280">{totalRetweeters} unique retweeters</text>
            </svg>
        </div>
    );
};

export default RetweetTree;
