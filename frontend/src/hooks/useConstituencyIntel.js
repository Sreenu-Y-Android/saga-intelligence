import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';

/**
 * Thin hooks around the existing /api/constituency-intel/* endpoints
 * (constituencyIntelligenceController) — reused as-is for the Constituency
 * Explorer tab rather than re-implementing seat-level aggregation.
 */

export const useConstituencyLeaderboard = (days = 90) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await api.get('/constituency-intel/leaderboard', { params: { days, sort: 'negative', limit: 200 } });
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || 'Failed to load constituency leaderboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  return { data, loading, error };
};

export const useConstituencyDetail = (constituency, days = 90) => {
  const [detail, setDetail] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const daysRef = useRef(days);
  daysRef.current = days;

  const refetch = useCallback(async () => {
    if (!constituency) return;
    try {
      setLoading(true);
      setError(null);
      const [detailRes, narrativeRes] = await Promise.all([
        api.get(`/constituency-intel/${encodeURIComponent(constituency)}`, { params: { days: daysRef.current } }),
        api.get(`/constituency-intel/${encodeURIComponent(constituency)}/narrative`, { params: { days: daysRef.current } }),
      ]);
      setDetail(detailRes.data);
      setNarrative(narrativeRes.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load constituency detail');
    } finally {
      setLoading(false);
    }
  }, [constituency]);

  useEffect(() => { refetch(); }, [refetch, days]);

  return { detail, narrative, loading, error };
};

export const useConstituencyComparison = (a, b, days = 90) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!a || !b) { setData(null); return; }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get('/constituency-intel/compare', { params: { a, b, days } });
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || 'Failed to compare constituencies');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [a, b, days]);

  return { data, loading, error };
};
