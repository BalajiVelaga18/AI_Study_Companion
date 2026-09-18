import React from 'react';

export default function AnalyticsSummaryCard({ icon, label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" aria-hidden="true">{icon}</div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub ? <div className="stat-sub">{sub}</div> : null}
      </div>
    </div>
  );
}
