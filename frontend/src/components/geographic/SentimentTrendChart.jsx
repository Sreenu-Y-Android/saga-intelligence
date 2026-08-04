import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <div className="font-semibold text-slate-700 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-1.5" style={{ color: p.color }}>
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
};

/** Daily sentiment trend — reused for both a single district and the state-wide series. */
const SentimentTrendChart = ({ data = [], loading, title = 'Sentiment Trend', height = 220 }) => {
  if (loading) {
    return <div className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse" style={{ height: height + 48 }} />;
  }

  if (!data.length) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-center text-xs text-slate-400" style={{ height: height + 48 }}>
        No trend data for this period
      </div>
    );
  }

  const hasSentimentData = data.some((d) => (d.positive || 0) > 0 || (d.negative || 0) > 0 || (d.neutral || 0) > 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-bold text-slate-800 mb-2">{title}</h3>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="geoPositive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="geoNegative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="geoNeutral" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="geoTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {hasSentimentData ? (
              <>
                <Area type="monotone" dataKey="neutral" name="Neutral" stroke="#f59e0b" fill="url(#geoNeutral)" strokeWidth={1.5} dot={{ r: 3 }} />
                <Area type="monotone" dataKey="positive" name="Positive" stroke="#10b981" fill="url(#geoPositive)" strokeWidth={2} dot={{ r: 3 }} />
                <Area type="monotone" dataKey="negative" name="Negative" stroke="#ef4444" fill="url(#geoNegative)" strokeWidth={2} dot={{ r: 3 }} />
              </>
            ) : (
              <Area type="monotone" dataKey="total" name="Total Mentions" stroke="#3b82f6" fill="url(#geoTotal)" strokeWidth={2} dot={{ r: 3 }} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SentimentTrendChart;
