import React from 'react';

export default function EmptyState({ icon = '📭', title = 'No data', message = '' }) {
  return (
    <div className="admin-empty">
      <div className="admin-empty-icon" aria-hidden="true">{icon}</div>
      <div className="admin-empty-title">{title}</div>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
