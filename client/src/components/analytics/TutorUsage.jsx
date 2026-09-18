import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <strong>{p.full}</strong>
      <span>{p.messages} {p.messages === 1 ? 'message' : 'messages'}</span>
    </div>
  );
}

export default function TutorUsage({ total, trend }) {
  return (
    <div>
      <div className="tutor-total">
        <span className="tutor-count">{total}</span>
        <span className="tutor-caption">tutor message{total === 1 ? '' : 's'} in this project</span>
      </div>
      {trend.length > 1 ? (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <XAxis dataKey="date" tick={{ fill: '#71827e', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: '#71827e', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#1b7566', strokeOpacity: 0.3 }} />
            <Area type="monotone" dataKey="messages" stroke="#39806c" strokeWidth={2} fill="#39806c" fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p><small>{total === 0 ? 'Ask your first question in the Tutor tab to start tracking usage.' : 'Ask a few more questions over different days to see your trend.'}</small></p>
      )}
    </div>
  );
}
