'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ArtisanGroupView } from '@nasj/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';

export function ArtisanGroups() {
  const [data, setData] = useState<ArtisanGroupView[] | null>(null);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState({ craft: '', area: '', period: '' });
  const load = useCallback(() => {
    setError(false);
    const params = new URLSearchParams();
    if (filters.craft) params.set('craft', filters.craft);
    if (filters.area) params.set('area', filters.area);
    if (filters.period) params.set('period', new Date(filters.period).toISOString());
    void apiFetch<ArtisanGroupView[]>(`/api/v1/commerce/artisan-groups?${params}`)
      .then(setData)
      .catch((cause) => {
        if (cause instanceof ApiError) setError(true);
        else setError(true);
      });
  }, [filters]);
  useEffect(() => {
    void load();
  }, [load]);
  const crafts = [...new Set(data?.map((row) => row.craft) ?? [])];
  const areas = [...new Set(data?.map((row) => row.area) ?? [])];
  if (error)
    return (
      <section>
        <h1>Artisan groups</h1>
        <p role="alert">Unable to load synthetic capacity data.</p>
        <Button onClick={load}>Retry</Button>
      </section>
    );
  if (!data) return <p role="status">Loading synthetic artisan groups…</p>;
  return (
    <section>
      <Badge variant="outline">Synthetic / fictional data</Badge>
      <h1>Artisan groups</h1>
      <p>
        Planning view only. Capacity is declared commercial capacity, not observed or wearable data.
      </p>
      <fieldset className="panel grid gap-3 md:grid-cols-3">
        <legend className="sr-only">Filter artisan groups</legend>
        <label>
          Craft
          <select
            value={filters.craft}
            onChange={(e) => setFilters({ ...filters, craft: e.target.value })}
          >
            <option value="">All crafts</option>
            {crafts.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Governorate / area
          <select
            value={filters.area}
            onChange={(e) => setFilters({ ...filters, area: e.target.value })}
          >
            <option value="">All areas</option>
            {areas.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Period start
          <input
            type="datetime-local"
            value={filters.period}
            onChange={(e) => setFilters({ ...filters, period: e.target.value })}
          />
        </label>
      </fieldset>
      {data.length === 0 ? (
        <p role="status">No groups match these filters.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((group) => (
            <Card key={`${group.name}-${group.craft}`} className="p-5">
              <h2>{group.name}</h2>
              <Badge variant="secondary">Synthetic provenance</Badge>
              <dl>
                <dt>Craft</dt>
                <dd>{group.craft}</dd>
                <dt>Area</dt>
                <dd>{group.area}</dd>
              </dl>
              {group.capacities.map((capacity) => (
                <div key={capacity.period.from}>
                  <h3>
                    {new Date(capacity.period.from).toLocaleDateString()} –{' '}
                    {new Date(capacity.period.to).toLocaleDateString()}
                  </h3>
                  <dl>
                    <dt>Declared capacity</dt>
                    <dd>
                      {capacity.declared} {capacity.unit}
                    </dd>
                    <dt>Committed capacity</dt>
                    <dd>
                      {capacity.committed} {capacity.unit}
                    </dd>
                    <dt>Remaining capacity</dt>
                    <dd>
                      {capacity.remaining} {capacity.unit}
                    </dd>
                  </dl>
                  {capacity.remaining === '0.00' && (
                    <p role="status">No eligible capacity remains.</p>
                  )}
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
