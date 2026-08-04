import React from 'react';
import { ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';
import Sparkline from './Sparkline';
import useCountUp from '../../hooks/useCountUp';

const STATUS_DOT = {
  good: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  neutral: 'bg-slate-300',
};

/**
 * Enterprise KPI tile — icon, live value (count-up), trend vs previous
 * period, inline sparkline, status indicator and a hover tooltip. Used
 * across every tab's executive KPI row.
 */
const StateKpiTile = ({
  label,
  value,
  numericValue,
  detail,
  changePct,
  compareLabel = 'vs previous period',
  changeIsGood, // true = up is good (green), false = up is bad (red), undefined = neutral amber
  changeUnit,   // 'pp' or '%' (default)
  sparklineData,
  sparklineColor = '#d97706',
  status,
  tooltip,
  icon: Icon,
  iconColor = 'text-yellow-700',
  iconBg = 'bg-yellow-50',
  loading,
  onClick,
  children,
}) => {
  const animated = useCountUp(numericValue ?? (typeof value === 'number' ? value : NaN));
  const displayValue = Number.isFinite(numericValue ?? (typeof value === 'number' ? value : NaN))
    ? animated.toLocaleString()
    : value;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 animate-pulse space-y-2">
        <div className="h-3 w-20 bg-slate-100 rounded" />
        <div className="h-6 w-16 bg-slate-100 rounded" />
        <div className="h-3 w-24 bg-slate-100 rounded" />
      </div>
    );
  }

  const up = changePct !== undefined && changePct !== null && changePct >= 0;
  const trendColor = changePct === undefined || changePct === null
    ? ''
    : changeIsGood === undefined
      ? (up ? 'text-amber-600' : 'text-slate-400')
      : ((up === changeIsGood) ? 'text-emerald-600' : 'text-red-500');

  const formatChange = (val, unit) => {
    const abs = Math.abs(val);
    if (unit === 'pp') {
      return `${abs} pp`;
    }
    if (abs >= 1000) {
      const times = (abs / 100).toFixed(1);
      return `${parseFloat(times)}x`;
    }
    return `${abs}%`;
  };

  return (
    <div
      onClick={onClick}
      className={`group relative bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4 transition-all duration-200 ${onClick ? 'cursor-pointer hover:shadow-[0_4px_16px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 hover:border-slate-300' : 'hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]'}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {Icon && (
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconBg} ${iconColor} flex-shrink-0`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
          {status && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] || STATUS_DOT.neutral}`} />}
        </div>
        {tooltip && (
          <div className="relative">
            <Info className="h-3 w-3 text-slate-300 group-hover:text-slate-400 cursor-help" />
            <div className="pointer-events-none absolute right-0 top-5 z-20 w-48 rounded-lg bg-slate-800 text-white text-[10px] leading-snug px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
              {tooltip}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xl font-extrabold text-slate-800 leading-none truncate tabular-nums" title={typeof value === 'string' ? value : undefined}>
            {displayValue ?? '—'}
          </div>
          {(detail || changePct !== undefined) && (
            <div className="flex items-center gap-1.5 mt-1.5 text-[10px]">
              {changePct !== undefined && changePct !== null && (
                <span className={`inline-flex items-center gap-0.5 font-bold ${trendColor}`}>
                  {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {formatChange(changePct, changeUnit)}
                </span>
              )}
              <span className="text-slate-400 truncate">{detail || compareLabel}</span>
            </div>
          )}
        </div>
        {sparklineData && sparklineData.length > 1 && (
          <Sparkline data={sparklineData} color={sparklineColor} />
        )}
      </div>
      {children}
    </div>
  );
};

export default StateKpiTile;
