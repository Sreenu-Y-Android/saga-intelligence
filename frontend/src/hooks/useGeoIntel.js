import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';

/**
 * Geographic Intelligence data hooks — thin fetch wrappers around
 * /api/geo-intel/*, following the same loading/error/refetch shape used
 * across the app's other dashboard hooks (see useDashboardData.js).
 */

const buildParams = (filters = {}) => {
  const params = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.platform && filters.platform !== 'all') params.platform = filters.platform;
  if (filters.sentiment && filters.sentiment !== 'all') params.sentiment = filters.sentiment;
  if (filters.topic && filters.topic !== 'all') params.topic = filters.topic;
  if (filters.sort) params.sort = filters.sort;
  if (filters.order) params.order = filters.order;
  if (filters.limit) params.limit = filters.limit;
  return params;
};

export const useGeoScope = () => {
  const [scope, setScope] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await api.get('/geo-intel/scope');
        if (!cancelled) setScope(res.data);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || 'Failed to load geographic scope');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { scope, loading, error };
};

export const useDistrictLeaderboard = (filters) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/geo-intel/districts', { params: buildParams(filtersRef.current) });
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load district leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch, filters.from, filters.to, filters.platform, filters.sentiment, filters.topic, filters.sort, filters.order]);

  return { data, loading, error, refetch };
};

export const useDistrictDetail = (districtKey, filters) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const refetch = useCallback(async () => {
    if (!districtKey) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/geo-intel/districts/${encodeURIComponent(districtKey)}`, { params: buildParams(filtersRef.current) });
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load district detail');
    } finally {
      setLoading(false);
    }
  }, [districtKey]);

  useEffect(() => { refetch(); }, [refetch, filters.from, filters.to, filters.platform, filters.sentiment, filters.topic]);

  return { data, loading, error, refetch };
};

export const useCityLeaderboard = (districtKey, filters, { enabled = true } = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const refetch = useCallback(async () => {
    if (!districtKey || !enabled) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/geo-intel/districts/${encodeURIComponent(districtKey)}/cities`, { params: buildParams(filtersRef.current) });
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load city leaderboard');
    } finally {
      setLoading(false);
    }
  }, [districtKey, enabled]);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
};

export const useStateSummary = (filters) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/geo-intel/summary', { params: buildParams(filtersRef.current) });
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load state summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch, filters.from, filters.to, filters.platform, filters.sentiment, filters.topic]);

  return { data, loading, error, refetch };
};

export const usePlayback = (filters, { enabled = true } = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/geo-intel/playback', { params: buildParams(filtersRef.current) });
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load historical playback data');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { refetch(); }, [refetch, filters.from, filters.to, filters.platform, filters.sentiment]);

  return { data, loading, error, refetch };
};

export const useTopicAnalytics = (districtKey, filters, { enabled = true } = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const refetch = useCallback(async () => {
    if (!districtKey || !enabled) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/geo-intel/districts/${encodeURIComponent(districtKey)}/topics`, { params: { ...buildParams(filtersRef.current), limit: 20 } });
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load topic analytics');
    } finally {
      setLoading(false);
    }
  }, [districtKey, enabled]);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
};
