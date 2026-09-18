import React from 'react';
import { eventLabel, EVENT_ICONS, formatActivityTime } from './analyticsUtils';

export default function RecentActivity({ items }) {
  const list = (Array.isArray(items) ? items : []).slice(0, 8);
  if (!list.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">🕰️</div>
        <p><strong>Nothing here yet.</strong></p>
        <p><small>Your learning activity will show up as a timeline.</small></p>
      </div>
    );
  }
  return (
    <ul className="activity-timeline">
      {list.map((a, i) => (
        <li key={a._id || i} className="activity-item">
          <span className="activity-icon" aria-hidden="true">{EVENT_ICONS[a.type] || '•'}</span>
          <span className="activity-body">
            <span className="activity-label">{eventLabel(a.type)}</span>
            <span className="activity-time">{formatActivityTime(a.at)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
