import React, { useMemo, useState } from 'react';
import DataTable from './DataTable.jsx';
import StatusBadge from './StatusBadge.jsx';
import RawData from './RawData.jsx';
import { n, relTime } from './formatters.js';

export default function UsersTab({ users, onInspect }) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');

  const roles = useMemo(() => {
    const set = new Set(users.map((u) => u.role).filter(Boolean));
    return Array.from(set).sort();
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      const matchesQuery =
        !q ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q);
      const matchesRole = !role || u.role === role;
      return matchesQuery && matchesRole;
    });
  }, [users, query, role]);

  const rows = filtered.map((u) => ({
    key: u.id,
    user: u.email,
    email: u.email,
    role: u.role,
    spaces: u.spaces ?? '—',
    projects: u.projects ?? 0,
    events: u.events ?? 0,
    joined: u.createdAt,
    raw: u,
  }));

  const columns = [
    {
      key: 'user',
      label: 'User',
      render: (row) => (
        <div>
          <div className="admin-primary">{row.email}</div>
          <button className="admin-link" onClick={() => onInspect(row.raw.id)}>Inspect journey</button>
        </div>
      ),
    },
    { key: 'role', label: 'Role', render: (row) => <StatusBadge tone={row.role === 'admin' ? 'success' : 'neutral'}>{row.role || 'user'}</StatusBadge> },
    { key: 'projects', label: 'Projects' },
    { key: 'events', label: 'Activity' },
    { key: 'joined', label: 'Joined', render: (row) => relTime(row.joined) },
  ];

  return (
    <div className="admin-sections">
      <section className="admin-section">
        <div className="admin-toolbar">
          <input
            type="search"
            placeholder="Search users by email or role..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="admin-search"
            aria-label="Search users"
          />
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <div className="admin-meta">{n(filtered.length)} user{filtered.length === 1 ? '' : 's'}</div>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="No users found"
          emptyMessage={query || role ? 'Try adjusting your search or filters.' : 'No users have registered yet.'}
        />
        <RawData data={users} title="View raw user data" />
      </section>
    </div>
  );
}
