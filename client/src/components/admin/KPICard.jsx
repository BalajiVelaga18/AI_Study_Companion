import React from 'react';

export default function KPICard({ label, value, sub, icon, tone = 'neutral' }) {
  return (
    <div className={`admin-kpi ${tone}`}>
      <div className="admin-kpi-head">
        <span className="admin-kpi-icon" aria-hidden="true">{icon}</span>
        <span className="admin-kpi-label">{label}</span>
      </div>
      <div className="admin-kpi-value">{value}</div>
      {sub ? <div className="admin-kpi-sub">{sub}</div> : null}
    </div>
  );
}
