import React, { useMemo } from 'react';
import KPICard from './KPICard.jsx';
import DataTable from './DataTable.jsx';
import StatusBadge from './StatusBadge.jsx';
import RawData from './RawData.jsx';
import { n, ms, tokens, providerLabel, formatDateTime } from './formatters.js';

export default function AiTab({ data }) {
  const byFeature = data.ai?.byFeature || [];
  const recent = data.ai?.recent || [];

  const totals = useMemo(() => {
    const all = byFeature.reduce(
      (acc, f) => {
        acc.n += f.n || 0;
        acc.tokens += f.tokens || 0;
        acc.fail += f.fail || 0;
        acc.latencySum += (f.avgMs || 0) * (f.n || 0);
        acc.latencyCount += f.n || 0;
        return acc;
      },
      { n: 0, tokens: 0, fail: 0, latencySum: 0, latencyCount: 0 }
    );
    return {
      ...all,
      avgMs: all.latencyCount ? all.latencySum / all.latencyCount : 0,
    };
  }, [byFeature]);

  const providerRows = useMemo(() => {
    const map = {};
    for (const r of recent) {
      const p = providerLabel(r.provider);
      if (!map[p]) map[p] = { provider: p, n: 0, avgMs: 0, fail: 0, fallbacks: 0, latencySum: 0 };
      map[p].n += 1;
      map[p].latencySum += r.latencyMs || 0;
      if (!r.ok) map[p].fail += 1;
      if (r.fallbackUsed) map[p].fallbacks += 1;
    }
    return Object.values(map).map((p) => ({ ...p, avgMs: p.n ? p.latencySum / p.n : 0 }));
  }, [recent]);

  const featureColumns = [
    { key: 'feature', label: 'Feature', render: (row) => <span className="admin-primary">{String(row._id || 'unknown').replace(/^./, (c) => c.toUpperCase())}</span> },
    { key: 'n', label: 'Requests', render: (row) => n(row.n) },
    { key: 'avgMs', label: 'Average latency', render: (row) => ms(row.avgMs) },
    { key: 'fail', label: 'Failures', render: (row) => <StatusBadge tone={row.fail > 0 ? 'danger' : 'success'}>{row.fail || 0}</StatusBadge> },
    { key: 'tokens', label: 'Tokens', render: (row) => tokens(row.tokens) },
  ];

  const providerColumns = [
    { key: 'provider', label: 'Provider', render: (row) => <span className="admin-primary">{row.provider}</span> },
    { key: 'n', label: 'Requests' },
    { key: 'avgMs', label: 'Average latency', render: (row) => ms(row.avgMs) },
    { key: 'fail', label: 'Failures', render: (row) => <StatusBadge tone={row.fail > 0 ? 'danger' : 'success'}>{row.fail}</StatusBadge> },
    { key: 'fallbacks', label: 'Fallbacks', render: (row) => <StatusBadge tone={row.fallbacks > 0 ? 'warning' : 'success'}>{row.fallbacks}</StatusBadge> },
  ];

  const recentRows = recent.slice(0, 30).map((a, i) => ({
    key: a._id || i,
    time: a.at,
    feature: a.feature,
    provider: a.provider,
    latency: a.latencyMs,
    tokens: a.tokens,
    ok: a.ok,
    fallbackUsed: a.fallbackUsed,
    errorCategory: a.errorCategory,
  }));

  const recentColumns = [
    { key: 'time', label: 'Time', render: (row) => formatDateTime(row.time) },
    { key: 'feature', label: 'Feature', render: (row) => <span className="admin-primary">{String(row.feature || '—').replace(/^./, (c) => c.toUpperCase())}</span> },
    { key: 'provider', label: 'Provider', render: (row) => providerLabel(row.provider) },
    { key: 'latency', label: 'Latency', render: (row) => ms(row.latency) },
    { key: 'tokens', label: 'Tokens', render: (row) => tokens(row.tokens) },
    { key: 'status', label: 'Status', render: (row) => (
      <StatusBadge tone={row.fallbackUsed ? 'warning' : row.ok ? 'success' : 'danger'}>
        {row.fallbackUsed ? 'Fallback' : row.ok ? 'Success' : 'Failed'}
      </StatusBadge>
    )},
  ];

  return (
    <div className="admin-sections">
      <section className="admin-section">
        <h3 className="admin-section-title">AI Performance</h3>
        <div className="admin-kpi-grid four">
          <KPICard label="Total Requests" value={n(totals.n)} icon="🤖" />
          <KPICard label="Average Latency" value={ms(totals.avgMs)} icon="⏱️" />
          <KPICard label="Failures" value={n(totals.fail)} icon="⚠️" tone={totals.fail > 0 ? 'danger' : 'success'} />
          <KPICard label="Tokens Used" value={tokens(totals.tokens)} icon="🔤" />
        </div>
      </section>

      <section className="admin-section">
        <h3 className="admin-section-title">By Feature</h3>
        <DataTable
          columns={featureColumns}
          rows={byFeature}
          emptyTitle="No AI usage by feature"
          emptyMessage="AI features have not been used yet."
        />
      </section>

      <section className="admin-section">
        <h3 className="admin-section-title">Provider Activity</h3>
        <DataTable
          columns={providerColumns}
          rows={providerRows}
          emptyTitle="No provider activity"
          emptyMessage="No AI provider data has been recorded yet."
        />
      </section>

      <section className="admin-section">
        <h3 className="admin-section-title">Recent AI Events</h3>
        <DataTable
          columns={recentColumns}
          rows={recentRows}
          emptyTitle="No recent AI events"
          emptyMessage="AI events will appear here as users interact with the Tutor, Quiz, and grading."
        />
      </section>

      <RawData data={data.ai} title="View raw AI data" />
    </div>
  );
}
