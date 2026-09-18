import React, { useState } from 'react';
import DataTable from './DataTable.jsx';
import StatusBadge from './StatusBadge.jsx';
import RawData from './RawData.jsx';
import EmptyState from './EmptyState.jsx';
import { formatDateTime, eventLabel, eventIcon, relTime } from './formatters.js';

const JOURNEY_STEPS = [
  { type: 'user.register', label: 'Signup' },
  { type: 'space.create', label: 'Space created' },
  { type: 'project.create', label: 'Project created' },
  { type: 'material.upload', label: 'Material uploaded' },
  { type: 'material.ready', label: 'Material processed' },
  { type: 'tutor.ask', label: 'Tutor interaction' },
  { type: 'quiz.start', label: 'Quiz activity' },
  { type: 'mastery.update', label: 'Mastery update' },
];

export default function JourneyTab({ uid, setUid, journey, loadJourney }) {
  const [input, setInput] = useState(uid);

  const handleLoad = (e) => {
    e.preventDefault();
    setUid(input.trim());
    if (input.trim()) loadJourney(input.trim());
  };

  const activity = journey?.activity || [];
  const reachedTypes = new Set(activity.map((a) => a.type));

  const rows = activity.slice(0, 50).map((a, i) => ({
    key: a._id || i,
    time: a.at,
    event: a.type,
    project: a.projectId,
    details: a.data,
    raw: a,
  }));

  const columns = [
    { key: 'time', label: 'Timestamp', render: (row) => formatDateTime(row.time) },
    { key: 'event', label: 'Event', render: (row) => <><span aria-hidden="true">{eventIcon(row.event)}</span> {eventLabel(row.event)}</> },
    { key: 'project', label: 'Project', render: (row) => row.project ? <span className="admin-mono">{String(row.project).slice(-6)}</span> : '—' },
    { key: 'details', label: 'Details', render: (row) => <span className="admin-muted">{JSON.stringify(row.details).slice(0, 80)}</span> },
  ];

  return (
    <div className="admin-sections">
      <section className="admin-section">
        <form className="admin-toolbar" onSubmit={handleLoad}>
          <input
            type="search"
            placeholder="Enter user ID or email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="admin-search"
            aria-label="User ID or email"
          />
          <button type="submit">Load journey</button>
        </form>

        {!journey && !uid && (
          <EmptyState icon="🔍" title="Load a user journey" message="Enter a user ID or email above to see their learning journey." />
        )}

        {journey && (
          <>
            <div className="admin-journey-user">
              <div className="admin-journey-avatar" aria-hidden="true">{journey.user?.email?.[0]?.toUpperCase() || '?'}</div>
              <div>
                <div className="admin-primary">{journey.user?.email || 'Unknown user'}</div>
                <div className="admin-muted">Role: <StatusBadge tone={journey.user?.role === 'admin' ? 'success' : 'neutral'}>{journey.user?.role || 'user'}</StatusBadge></div>
              </div>
            </div>

            <h3 className="admin-section-title">Learning Journey</h3>
            <div className="admin-timeline">
              {JOURNEY_STEPS.map((step, idx) => {
                const reached = reachedTypes.has(step.type);
                return (
                  <div key={step.type} className={`admin-timeline-step ${reached ? 'reached' : ''}`}>
                    <div className="admin-timeline-dot" aria-hidden="true" />
                    {idx < JOURNEY_STEPS.length - 1 && <div className="admin-timeline-line" aria-hidden="true" />}
                    <div className="admin-timeline-label">{step.label}</div>
                  </div>
                );
              })}
            </div>

            <h3 className="admin-section-title">Recent Activity</h3>
            <DataTable
              columns={columns}
              rows={rows}
              emptyTitle="No activity recorded"
              emptyMessage="This user has not generated any events yet."
            />

            <RawData data={journey} title="View raw journey data" />
          </>
        )}
      </section>
    </div>
  );
}
