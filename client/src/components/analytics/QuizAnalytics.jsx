import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';

function ScoreTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <strong>{p.name}</strong>
      <span>Score: {p.score}%{p.when ? ` · ${p.when}` : ''}</span>
    </div>
  );
}

function barColor(score, best) {
  if (score === best) return '#ec765d';
  if (score >= 70) return '#1b7566';
  if (score >= 40) return '#73af94';
  return '#c9b48a';
}

export default function QuizAnalytics({ summary }) {
  if (!summary.total) {
    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">📝</div>
        <p><strong>No quizzes completed yet.</strong></p>
        <p><small>Complete your first adaptive quiz to start tracking your performance.</small></p>
      </div>
    );
  }
  const chartData = [...summary.recent].reverse().map((q, i) => ({
    name: `Q${i + 1}`,
    score: q.score,
    when: q.at ? new Date(q.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
  }));
  return (
    <div>
      <div className="quiz-stats">
        <div className="quiz-stat"><span className="quiz-stat-value">{summary.completed}</span><span className="quiz-stat-label">Completed</span></div>
        <div className="quiz-stat"><span className="quiz-stat-value">{summary.avg === null ? '—' : `${summary.avg}%`}</span><span className="quiz-stat-label">Average</span></div>
        <div className="quiz-stat"><span className="quiz-stat-value">{summary.best === null ? '—' : `${summary.best}%`}</span><span className="quiz-stat-label">Best</span></div>
      </div>
      {chartData.length ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#dce3dc" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#71827e', fontSize: 12 }} axisLine={{ stroke: '#dce3dc' }} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: '#71827e', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ScoreTooltip />} cursor={{ fill: '#173f3a', opacity: 0.06 }} />
            <Bar dataKey="score" radius={[6, 6, 0, 0]}>
              {chartData.map((d, i) => <Cell key={i} fill={barColor(d.score, summary.best)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
