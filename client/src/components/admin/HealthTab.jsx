import React, { useMemo } from 'react';
import KPICard from './KPICard.jsx';
import RawData from './RawData.jsx';
import StatusBadge from './StatusBadge.jsx';
import { uptime, bytes } from './formatters.js';

export default function HealthTab({ data }) {
  const health = data.health || {};
  const mem = health.mem || {};

  const memoryUsed = mem.heapUsed || 0;
  const memoryTotal = mem.heapTotal || 1;
  const memoryPct = Math.min(100, Math.round((memoryUsed / memoryTotal) * 100));

  return (
    <div className="admin-sections">
      <section className="admin-section">
        <h3 className="admin-section-title">System Health</h3>
        <div className="admin-kpi-grid three">
          <KPICard
            label="API"
            value={health.ok ? 'Healthy' : 'Unhealthy'}
            sub="Request handling"
            icon="🌐"
            tone={health.ok ? 'success' : 'danger'}
          />
          <KPICard
            label="MongoDB"
            value={health.mongo === 'connected' || health.mongo === true ? 'Connected' : 'Disconnected'}
            sub="Database"
            icon="🗄️"
            tone={health.mongo === 'connected' || health.mongo === true ? 'success' : 'danger'}
          />
          <KPICard label="Uptime" value={uptime(health.uptimeSec)} sub="Since last restart" icon="⏱️" />
        </div>
      </section>

      <section className="admin-section">
        <h3 className="admin-section-title">Memory</h3>
        <div className="admin-memory">
          <div className="admin-memory-bar" role="img" aria-label={`Memory ${memoryPct}% used`}>
            <div className="admin-memory-fill" style={{ width: `${memoryPct}%` }} />
          </div>
          <div className="admin-memory-meta">
            <span>{bytes(memoryUsed)} used</span>
            <span>{bytes(memoryTotal)} total</span>
            <span>{memoryPct}%</span>
          </div>
        </div>
      </section>

      <section className="admin-section">
        <h3 className="admin-section-title">Status Summary</h3>
        <div className="admin-status-list">
          <div className="admin-status-row">
            <span>API Status</span>
            <StatusBadge tone={health.ok ? 'success' : 'danger'}>{health.ok ? 'Healthy' : 'Unhealthy'}</StatusBadge>
          </div>
          <div className="admin-status-row">
            <span>Database</span>
            <StatusBadge tone={health.mongo === 'connected' || health.mongo === true ? 'success' : 'danger'}>
              {health.mongo === 'connected' || health.mongo === true ? 'Connected' : 'Disconnected'}
            </StatusBadge>
          </div>
          <div className="admin-status-row">
            <span>Checked At</span>
            <span className="admin-muted">{health.at ? new Date(health.at).toLocaleString() : '—'}</span>
          </div>
        </div>
        <RawData data={health} title="View system details" />
      </section>
    </div>
  );
}
