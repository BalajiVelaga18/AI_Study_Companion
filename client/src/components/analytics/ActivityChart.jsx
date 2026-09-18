import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <strong>{p.full}</strong>
      <span>{p.activities} {p.activities === 1 ? 'activity' : 'activities'}</span>
    </div>
  );
}

export default function ActivityChart({ series }) {
  if (!series.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">📊</div>
        <p><strong>No learning activity yet.</strong></p>
        <p><small>Ask the Tutor or take a quiz — your activity will appear here.</small></p>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="actFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b7566" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#1b7566" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#dce3dc" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: '#71827e', fontSize: 12 }} axisLine={{ stroke: '#dce3dc' }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: '#71827e', fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#1b7566', strokeOpacity: 0.3 }} />
        <Area type="monotone" dataKey="activities" stroke="#1b7566" strokeWidth={2.5} fill="url(#actFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
