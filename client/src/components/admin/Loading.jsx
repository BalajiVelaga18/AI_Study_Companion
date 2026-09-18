import React from 'react';

export default function Loading({ cards = 4 }) {
  return (
    <div aria-busy="true" aria-label="Loading admin dashboard">
      <div className="admin-kpi-grid">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="admin-kpi skeleton">
            <div className="sk-line sk-title" />
            <div className="sk-line sk-num" />
          </div>
        ))}
      </div>
      <div className="card">
        <div className="sk-line sk-title" />
        <div className="sk-block" />
      </div>
    </div>
  );
}
