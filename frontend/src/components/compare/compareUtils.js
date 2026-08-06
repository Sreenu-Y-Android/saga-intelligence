import { useEffect, useRef, useState } from 'react';

/* Party visual identity — used to colour every "side" of the comparison so
   the two candidates stay readable even without labels. */
export const PARTY_COLORS = {
  // INC's real identity is the saffron/white/green tricolor, not a flat hue — `grad` (the
  // only one of these tokens that renders as an actual gradient swatch) carries that; the
  // solid tokens use a saffron-family amber since BJP already owns the brighter orange.
  INC: { main: '#CA8A04', soft: '#fef3c7', text: '#92400e', ring: '#f59e0b', grad: 'from-orange-500 via-white to-green-600' },
  BRS: { main: '#ec4899', soft: '#fce7f3', text: '#9d174d', ring: '#f472b6', grad: 'from-pink-400 to-rose-500' },
  BJP: { main: '#f97316', soft: '#ffedd5', text: '#9a3412', ring: '#fb923c', grad: 'from-orange-400 to-orange-600' },
  AIMIM: { main: '#16a34a', soft: '#dcfce7', text: '#166534', ring: '#4ade80', grad: 'from-green-500 to-emerald-600' },
  DEFAULT: { main: '#64748b', soft: '#f1f5f9', text: '#334155', ring: '#94a3b8', grad: 'from-slate-400 to-slate-600' },
};

export const partyColor = (p) => PARTY_COLORS[String(p || '').toUpperCase()] || PARTY_COLORS.DEFAULT;

export const fmtNum = (n) => (n || n === 0 ? Number(n).toLocaleString('en-IN') : '—');

export const fmtShort = (n) => {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1e7) return `${sign}${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${sign}${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}K`;
  return String(v);
};

export const initialOf = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';

export const titleCase = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/* Animated count-up. Re-animates from the previous value whenever `target`
   changes — so switching the opponent mid-comparison counts to the new number
   instead of snapping. easeOutCubic for a lively-but-settled feel. */
export const useCountUp = (target, { duration = 900, decimals = 0 } = {}) => {
  // Starts from 0 on mount so every reveal (and every opponent switch, which
  // remounts the view) counts up rather than snapping into place.
  const [val, setVal] = useState(0);
  const state = useRef({ raf: 0, from: 0 });

  useEffect(() => {
    const from = state.current.from;
    const to = Number(target) || 0;
    if (from === to) { setVal(to); return undefined; }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (to - from) * eased);
      if (t < 1) {
        state.current.raf = requestAnimationFrame(tick);
      } else {
        state.current.from = to;
      }
    };
    cancelAnimationFrame(state.current.raf);
    state.current.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(state.current.raf);
  }, [target, duration]);

  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
};
