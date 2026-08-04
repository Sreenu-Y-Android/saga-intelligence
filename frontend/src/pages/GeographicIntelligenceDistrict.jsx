import React, { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import GeoBreadcrumb from '../components/geographic/GeoBreadcrumb';
import GeoFilterBar from '../components/geographic/GeoFilterBar';
import DistrictDetailPanel from '../components/geographic/DistrictDetailPanel';
import { useGeoScope } from '../hooks/useGeoIntel';

/**
 * Standalone deep-link for a single district — the target of "View Full
 * District" links from the State Overview map/snapshot and any external
 * ?location= link. Renders the same DistrictDetailPanel used inside the
 * District Explorer tab's split pane, so drill-down logic lives in one place.
 */
const GeographicIntelligenceDistrict = () => {
  const { districtKey } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { scope } = useGeoScope();

  const filters = useMemo(() => {
    let from = searchParams.get('from') || '';
    let to = searchParams.get('to') || '';

    if (!from && !to) {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      const toLocalYMD = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      from = toLocalYMD(start);
      to = toLocalYMD(now);
    }

    return {
      from,
      to,
      platform: searchParams.get('platform') || 'all',
      sentiment: searchParams.get('sentiment') || 'all',
      topic: searchParams.get('topic') || 'all',
    };
  }, [searchParams]);

  const handleFilterChange = (next) => {
    const params = {};
    if (next.from) params.from = next.from;
    if (next.to) params.to = next.to;
    if (next.platform && next.platform !== 'all') params.platform = next.platform;
    if (next.sentiment && next.sentiment !== 'all') params.sentiment = next.sentiment;
    if (next.topic && next.topic !== 'all') params.topic = next.topic;
    setSearchParams(params);
  };

  const canSeeAll = scope?.can_see_all_districts;

  return (
    <div className="space-y-4">
      <div>
        <GeoBreadcrumb
          crumbs={
            canSeeAll
              ? [{ label: 'Geographic Intelligence', to: '/geographic-intelligence' }, { label: districtKey }]
              : [{ label: 'Your District' }, { label: districtKey }]
          }
        />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-lg font-extrabold text-slate-800">District Intelligence</h1>
          <GeoFilterBar filters={filters} onChange={handleFilterChange} />
        </div>
      </div>

      <DistrictDetailPanel districtKey={districtKey} filters={filters} />
    </div>
  );
};

export default GeographicIntelligenceDistrict;
