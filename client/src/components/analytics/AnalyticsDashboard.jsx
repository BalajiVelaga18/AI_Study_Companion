import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import AnalyticsSummaryCard from './AnalyticsSummaryCard.jsx';
import ActivityChart from './ActivityChart.jsx';
import TutorUsage from './TutorUsage.jsx';
import QuizAnalytics from './QuizAnalytics.jsx';
import RecentActivity from './RecentActivity.jsx';
import { toActivitySeries, totalActivities, summarizeQuizzes, tutorTrend } from './analyticsUtils.js';

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading analytics">
      <div className="stat-grid">
        {[0, 1, 2, 3].map((i) => <div key={i} className="stat-card skeleton"><div className="sk-line sk-num" /><div className="sk-line sk-label" /></div>)}
      </div>
      <div className="card"><div className="sk-line sk-title" /><div className="sk-block" /></div>
      <div className="card"><div className="sk-line sk-title" /><div className="sk-block sk-short" /></div>
    </div>
  );
}

export default function AnalyticsDashboard({ projectId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await api(`/api/analytics/project/${projectId}`));
    } catch {
      setError(true);
    }
  }, [projectId]);

  useEffect(() => { setData(null); load(); }, [load]);

  if (error && !data) {
    return (
      <div className="card">
        <h3>Project Analytics</h3>
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">⚠️</div>
          <p><strong>Unable to load analytics.</strong></p>
          <p><button onClick={load}>Retry</button></p>
        </div>
      </div>
    );
  }
  if (!data) return <Skeleton />;

  const activityByDay = data.activityByDay ?? {};
  const quizzes = data.quizzes ?? [];
  const tutorMessages = data.tutorMessages ?? 0;
  const series = toActivitySeries(activityByDay);
  const quizSummary = summarizeQuizzes(quizzes);

  return (
    <div className="analytics">
      <div className="analytics-head">
        <div>
          <div className="eyebrow">Insights</div>
          <h3 className="analytics-title">Project Analytics</h3>
        </div>
        <button className="ghost-btn" onClick={load}>Refresh</button>
      </div>

      <div className="stat-grid">
        <AnalyticsSummaryCard icon="⚡" label="Total Activities" value={totalActivities(activityByDay, data.activity)} />
        <AnalyticsSummaryCard icon="💬" label="Tutor Messages" value={tutorMessages} />
        <AnalyticsSummaryCard icon="📝" label="Quizzes Completed" value={quizSummary.completed} sub={data.quizzes?.length ? `${data.quizzes.length} started` : null} />
        <AnalyticsSummaryCard icon="🎯" label="Average Quiz Score" value={quizSummary.avg === null ? '—' : `${quizSummary.avg}%`} />
      </div>

      <div className="card">
        <h3>Learning Activity</h3>
        <p><small>Your day-by-day learning activity in this project.</small></p>
        <ActivityChart series={series} />
      </div>

      <div className="analytics-cols">
        <div className="card">
          <h3>Tutor Usage</h3>
          <TutorUsage total={tutorMessages} trend={tutorTrend(data.activity)} />
        </div>
        <div className="card">
          <h3>Quiz Performance</h3>
          <QuizAnalytics summary={quizSummary} />
        </div>
      </div>

      <div className="card">
        <h3>Recent Activity</h3>
        <RecentActivity items={data.activity} />
      </div>
    </div>
  );
}
