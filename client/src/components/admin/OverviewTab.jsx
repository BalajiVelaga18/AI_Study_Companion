import React from 'react';
import KPICard from './KPICard.jsx';
import RawData from './RawData.jsx';
import ActivityChart from '../analytics/ActivityChart.jsx';
import StatusBadge from './StatusBadge.jsx';
import { n, pct } from './formatters.js';

export default function OverviewTab({ data }) {
  const counts = data.counts || {};
  const engagement = data.engagement || {};
  const learning = data.learning || {};

  return (
    <div className="admin-sections">
      <section className="admin-section">
        <h3 className="admin-section-title">Platform Overview</h3>
        <div className="admin-kpi-grid four">
          <KPICard label="Users" value={n(counts.users)} sub="Registered learners" icon="👤" />
          <KPICard label="Spaces" value={n(counts.spaces)} sub="Learning spaces" icon="🗂️" />
          <KPICard label="Projects" value={n(counts.projects)} sub="Active projects" icon="📁" />
          <KPICard label="Events" value={n(counts.events)} sub="Total events" icon="⚡" />
        </div>
        <div className="admin-kpi-grid four" style={{ marginTop: 14 }}>
          <KPICard label="Tutor Messages" value={n(counts.tutorMsgs)} sub="AI conversations" icon="💬" />
          <KPICard label="Materials" value={n(counts.materials)} sub="Uploaded files" icon="📄" />
          <KPICard label="Tutor Grounded" value={data.evaluation?.tutorGroundedPct === null ? '—' : `${data.evaluation.tutorGroundedPct}%`} sub={`${n(data.evaluation?.tutorSamples || 0)} samples`} icon="🎯" />
          <KPICard label="AI Fail Rate" value={data.ai?.failRate === undefined ? '—' : `${Math.round((data.ai.failRate || 0) * 100)}%`} sub="Recent AI calls" icon="⚠️" />
        </div>
      </section>

      <section className="admin-section">
        <h3 className="admin-section-title">Engagement</h3>
        <div className="admin-kpi-grid four">
          <KPICard label="Events (24h)" value={n(engagement.events24)} sub="Total events" icon="⚡" />
          <KPICard label="Active Learners (24h)" value={n(engagement.activeUsers24)} sub="Unique users" icon="🎓" />
          <KPICard label="Quiz Completion" value={engagement.quizCompletion || '—'} sub="Completed / started" icon="📝" />
          <KPICard label="Average Quiz Score" value={pct(engagement.avgQuizScore)} sub="Across completed quizzes" icon="🎯" />
        </div>
      </section>

      <section className="admin-section">
        <h3 className="admin-section-title">Learning Analytics</h3>
        <div className="admin-kpi-grid three">
          <KPICard label="Average Quiz Score" value={pct(learning.avgScore)} icon="🎯" />
          <KPICard label="Quizzes Started" value={n(Array.isArray(learning.quizzes) ? learning.quizzes.length : 0)} icon="📝" />
          <KPICard label="Quizzes Completed" value={n((Array.isArray(learning.quizzes) ? learning.quizzes : []).filter((q) => q.completed).length)} icon="✅" />
        </div>
        {Array.isArray(learning.quizzes) && learning.quizzes.length > 0 && (
          <div className="admin-table-wrap" style={{ marginTop: 18 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Quiz</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Completed</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {learning.quizzes.map((q, i) => (
                  <tr key={i}>
                    <td>Quiz {i + 1}</td>
                    <td><StatusBadge>{q.completed ? 'Completed' : 'In Progress'}</StatusBadge></td>
                    <td>{q.score !== null && q.score !== undefined ? `${q.score}%` : '—'}</td>
                    <td>{q.completed ? 'Yes' : 'No'}</td>
                    <td>{q.at ? new Date(q.at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section">
        <h3 className="admin-section-title">Activity Trend</h3>
        <ActivityChart series={[]} />
        <p className="admin-note">Time-series activity data is aggregated per-project. Visit a project&apos;s Analytics tab for detailed charts.</p>
      </section>

      <RawData data={data} title="View raw overview data" />
    </div>
  );
}
