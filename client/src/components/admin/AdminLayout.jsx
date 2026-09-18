import React from 'react';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'journey', label: 'Journey' },
  { id: 'activity', label: 'Activity' },
  { id: 'ai', label: 'AI' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'health', label: 'Health' },
];

export default function AdminLayout({ tab, setTab, children }) {
  return (
    <div className="admin">
      <div className="admin-header">
        <div>
          <div className="eyebrow">Operations</div>
          <h2 className="admin-title">Admin Dashboard</h2>
        </div>
      </div>
      <nav className="admin-tabs" aria-label="Admin sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="admin-body">{children}</div>
    </div>
  );
}
