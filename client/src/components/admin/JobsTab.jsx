import React, { useMemo, useState } from 'react';
import KPICard from './KPICard.jsx';
import DataTable from './DataTable.jsx';
import StatusBadge from './StatusBadge.jsx';
import RawData from './RawData.jsx';
import { n, relTime, normalizeStatus, statusTone } from './formatters.js';

export default function JobsTab({ jobs, loadJobs }) {
  const [status, setStatus] = useState('');

  const byStatus = useMemo(() => {
    const map = { queued: 0, processing: 0, completed: 0, failed: 0 };
    for (const j of jobs) {
      const s = String(j.status || 'unknown').toLowerCase();
      const bucket = s === 'done' ? 'completed' : s;
      map[bucket] = (map[bucket] || 0) + 1;
    }
    return map;
  }, [jobs]);

  const filtered = useMemo(() => {
    if (!status) return jobs;
    return jobs.filter((j) => {
      const s = String(j.status || '').toLowerCase();
      const bucket = s === 'done' ? 'completed' : s;
      return bucket === status;
    });
  }, [jobs, status]);

  const rows = filtered.map((j, i) => ({
    key: j._id || i,
    job: j.filename || j.kind || `Job ${String(j._id || '').slice(-6)}`,
    type: j.kind || 'Processing',
    status: j.status,
    attempts: j.attempts,
    updatedAt: j.updatedAt,
    lastError: j.lastError,
    raw: j,
  }));

  const columns = [
    { key: 'job', label: 'Job', render: (row) => <span className="admin-primary">{row.job}</span> },
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge tone={statusTone(row.status)}>{normalizeStatus(row.status)}</StatusBadge> },
    { key: 'attempts', label: 'Attempts', render: (row) => n(row.attempts) },
    { key: 'updated', label: 'Last updated', render: (row) => relTime(row.updatedAt) },
    { key: 'error', label: 'Error', render: (row) => row.lastError ? <span className="admin-danger" title={row.lastError}>{row.lastError.slice(0, 40)}…</span> : '—' },
  ];

  const statuses = ['queued', 'processing', 'completed', 'failed'];

  return (
    <div className="admin-sections">
      <section className="admin-section">
        <h3 className="admin-section-title">Background Jobs</h3>
        <div className="admin-kpi-grid four">
          <KPICard label="Completed" value={n(byStatus.completed)} icon="✅" tone="success" />
          <KPICard label="Running" value={n(byStatus.processing)} icon="⚙️" tone="warning" />
          <KPICard label="Queued" value={n(byStatus.queued)} icon="⏳" tone="neutral" />
          <KPICard label="Failed" value={n(byStatus.failed)} icon="⚠️" tone={byStatus.failed > 0 ? 'danger' : 'success'} />
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-toolbar">
          <div className="admin-filter-group" role="group" aria-label="Filter jobs by status">
            <button className={`admin-filter ${status === '' ? 'active' : ''}`} onClick={() => setStatus('')}>All</button>
            {statuses.map((s) => (
              <button key={s} className={`admin-filter ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
                {s.replace(/^./, (c) => c.toUpperCase())}
              </button>
            ))}
          </div>
          <button onClick={loadJobs}>Refresh</button>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="No background jobs"
          emptyMessage={status ? `No ${status} jobs found.` : 'No background jobs have been created yet.'}
        />
        <RawData data={jobs} title="View raw job data" />
      </section>
    </div>
  );
}
