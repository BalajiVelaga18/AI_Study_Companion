import React, { useState, useMemo } from 'react';
import DataTable from './DataTable.jsx';
import StatusBadge from './StatusBadge.jsx';
import RawData from './RawData.jsx';
import { formatDateTime, eventLabel, eventIcon } from './formatters.js';

const FILTERS = [
  { id: '', label: 'All events' },
  { id: 'tutor', label: 'Tutor' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'material', label: 'Materials' },
  { id: 'project', label: 'Projects' },
];

export default function ActivityTab({ filters, setFilters, activity, loadActivity }) {
  const [activeFilter, setActiveFilter] = useState('');

  const filtered = useMemo(() => {
    if (!activeFilter) return activity;
    return activity.filter((a) => String(a.type || '').startsWith(activeFilter));
  }, [activity, activeFilter]);

  const rows = filtered.map((a, i) => ({
    key: a._id || i,
    time: a.at,
    event: a.type,
    user: a.ownerId,
    project: a.projectId,
    data: a.data,
    raw: a,
  }));

  const columns = [
    { key: 'time', label: 'Time', render: (row) => formatDateTime(row.time) },
    { key: 'event', label: 'Event', render: (row) => <><span aria-hidden="true">{eventIcon(row.event)}</span> <span className="admin-primary">{eventLabel(row.event)}</span></> },
    { key: 'user', label: 'User', render: (row) => row.user ? <span className="admin-mono">{String(row.user).slice(-6)}</span> : '—' },
    { key: 'project', label: 'Project', render: (row) => row.project ? <span className="admin-mono">{String(row.project).slice(-6)}</span> : '—' },
    { key: 'status', label: 'Status', render: (row) => {
      const ev = String(row.event || '');
      const explicit = row.data?.status;
      if (explicit) return <StatusBadge>{explicit}</StatusBadge>;
      if (ev.includes('failed') || ev.includes('fail')) return <StatusBadge tone="danger">Failed</StatusBadge>;
      if (ev.includes('start')) return <StatusBadge tone="warning">Started</StatusBadge>;
      if (ev.includes('complete') || ev.includes('ready') || ev.includes('upload') || ev.includes('create')) return <StatusBadge tone="success">Completed</StatusBadge>;
      return <StatusBadge>Completed</StatusBadge>;
    }}, 
  ];

  return (
    <div className="admin-sections">
      <section className="admin-section">
        <div className="admin-toolbar">
          <div className="admin-filter-group" role="group" aria-label="Filter events">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`admin-filter ${activeFilter === f.id ? 'active' : ''}`}
                onClick={() => setActiveFilter(f.id)}
                aria-pressed={activeFilter === f.id}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="admin-meta">{filtered.length} event{filtered.length === 1 ? '' : 's'}</div>
        </div>

        <div className="admin-toolbar admin-toolbar-secondary">
          {['type', 'userId', 'projectId', 'from', 'to'].map((k) => (
            <input
              key={k}
              value={filters[k] || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, [k]: e.target.value }))}
              placeholder={k}
              className="admin-input-small"
              aria-label={`Filter ${k}`}
            />
          ))}
          <button onClick={loadActivity}>Apply filters</button>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="No activity found"
          emptyMessage="Try changing filters or wait for users to generate events."
        />
        <RawData data={activity} title="View raw activity data" />
      </section>
    </div>
  );
}
