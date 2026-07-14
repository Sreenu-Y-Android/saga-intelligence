/**
 * Presentation layer for the backend's frequency tiers
 * (classifyFrequency() in engagerAnalysisService.js: super-active / regular /
 * occasional / one-time). Shared by FrequentEngagersDialog, RetweetTree and
 * PostEngagersDialog so the whole feature uses one consistent color system.
 */
export const FREQUENCY_ORDER = { 'super-active': 0, regular: 1, occasional: 2, 'one-time': 3 };

export const FREQUENCY_LABELS = {
  'super-active': 'Frequent',
  regular: 'Regular',
  occasional: 'Occasional',
  'one-time': 'One-time'
};

// Table row backgrounds (detail screen engager table)
export const FREQ_ROW_COLORS = {
  'super-active': 'bg-red-100 dark:bg-red-900/40',
  regular: 'bg-orange-100 dark:bg-orange-900/35',
  occasional: 'bg-amber-50 dark:bg-amber-900/25',
  'one-time': ''
};

// Badge pill styles (used on alert-card popovers etc.)
export const FREQ_BADGE_STYLES = {
  'super-active': 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400',
  regular: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400',
  occasional: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400',
  'one-time': 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
};

// Legend swatches (detail screen table footer)
export const FREQ_LEGEND = [
  { key: 'super-active', label: 'Frequent', color: 'bg-red-300 dark:bg-red-700' },
  { key: 'regular', label: 'Regular', color: 'bg-orange-300 dark:bg-orange-700' },
  { key: 'occasional', label: 'Occasional', color: 'bg-amber-200 dark:bg-amber-700' },
  { key: 'one-time', label: 'One-time', color: 'bg-gray-300 dark:bg-gray-600' }
];

// Network map node color, ramped by frequency tier so intensity is visible
// at a glance.
export const getNodeColor = (frequency) => {
  switch (frequency) {
    case 'super-active': return '#ef4444'; // red-500
    case 'regular': return '#f97316'; // orange-500
    case 'occasional': return '#f59e0b'; // amber-500
    default: return '#9ca3af'; // gray-400
  }
};
