import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import AnalyticsSummaryCard from './AnalyticsSummaryCard.jsx';
import ActivityChart from './ActivityChart.jsx';
import RecentActivity from './RecentActivity.jsx';
import TutorUsage from './TutorUsage.jsx';
import QuizAnalytics from './QuizAnalytics.jsx';
import { toActivitySeries, totalActivities, summarizeQuizzes, tutorTrend } from './analyticsUtils.js';

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading global analytics">
      <div className="stat-grid">
        {[0, 1, 2, 3].map((i) => <div key={i} className="stat-card skeleton"><div className="sk-line sk-num" /><div className="sk-line sk-label" /></div>)}
      </div>
      <div className="card"><div className="sk-line sk-title" /><div className="sk-block" /></div>
    </div>
  );
}

function MasteryDistribution({ distribution }) {
  const total = Object.values(distribution).reduce((s, v) => s + v, 0);
  if (!total) {
    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">📊</div>
        <p><strong>No mastery data yet.</strong></p>
        <p><small>Upload material and take quizzes to build your mastery map.</small></p>
      </div>
    );
  }
  const buckets = [
    { key: 'strong', label: 'Strong', color: '#1b7566', threshold: '80%+' },
    { key: 'improving', label: 'Improving', color: '#73af94', threshold: '60–79%' },
    { key: 'developing', label: 'Developing', color: '#c9b48a', threshold: '40–59%' },
    { key: 'weak', label: 'Needs attention', color: '#ec765d', threshold: '< 40%' },
  ];
  return (
    <div className="mastery-distribution">
      {buckets.map((b) => {
        const count = distribution[b.key] || 0;
        const pct = Math.round((count / total) * 100);
        return (
          <div key={b.key} className="mastery-bar-row">
            <div className="mastery-bar-label">
              <span className="mastery-dot" style={{ background: b.color }} />
              <span>{b.label}</span>
              <small className="mastery-threshold">{b.threshold}</small>
            </div>
            <div className="mastery-bar-track">
              <div className="mastery-bar-fill" style={{ width: `${pct}%`, background: b.color }} />
            </div>
            <div className="mastery-bar-value">{count} <small>({pct}%)</small></div>
          </div>
        );
      })}
    </div>
  );
}

function RecentMaterials({ materials }) {
  if (!materials?.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">📄</div>
        <p><strong>No materials yet.</strong></p>
        <p><small>Upload PDFs to your projects to start learning.</small></p>
      </div>
    );
  }
  return (
    <ul className="recent-materials">
      {materials.map((m) => (
        <li key={m.id} className="recent-material-item">
          <span className="material-filename">{m.filename}</span>
          <span className={`material-status status-${m.status}`}>{m.status}</span>
        </li>
      ))}
    </ul>
  );
}

export default function GlobalAnalytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await api('/api/analytics/global'));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error && !data) {
    return (
      <div className="card">
        <h3>Global Analytics</h3>
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">⚠️</div>
          <p><strong>Unable to load global analytics.</strong></p>
          <p><button onClick={load}>Retry</button></p>
        </div>
      </div>
    );
  }
  if (!data) return <Skeleton />;

  const counts = data.counts || {};
  const activityByDay = data.activityByDay || {};
  const series = toActivitySeries(activityByDay);
  const quizSummary = summarizeQuizzes(data.quizSummary?.recent?.map((q) => ({ score: q.score, at: q.at, completed: true })) || []);
  quizSummary.total = data.quizSummary?.total || 0;
  quizSummary.completed = data.quizSummary?.completed || 0;
  quizSummary.avg = data.quizSummary?.avg ?? null;
  quizSummary.best = data.quizSummary?.best ?? null;

  return (
    <div className="analytics global-analytics">
      <div className="analytics-head">
        <div>
          <div className="eyebrow">Across all spaces</div>
          <h3 className="analytics-title">Global Analytics</h3>
        </div>
        <button className="ghost-btn" onClick={load}>Refresh</button>
      </div>

      <div className="stat-grid">
        <AnalyticsSummaryCard icon="🗂️" label="Spaces" value={counts.spaces || 0} />
        <AnalyticsSummaryCard icon="📁" label="Projects" value={counts.projects || 0} />
        <AnalyticsSummaryCard icon="📚" label="Materials" value={counts.materials || 0} />
        <AnalyticsSummaryCard icon="🧠" label="Concepts" value={counts.concepts || 0} />
        <AnalyticsSummaryCard icon="💬" label="Tutor Messages" value={counts.tutorMessages || 0} />
        <AnalyticsSummaryCard icon="📝" label="Quizzes" value={quizSummary.completed} sub={counts.quizzes ? `${counts.quizzes} started` : null} />
        <AnalyticsSummaryCard icon="🎯" label="Avg Quiz Score" value={quizSummary.avg === null ? '—' : `${quizSummary.avg}%`} />
        <AnalyticsSummaryCard icon="⚡" label="Total Activities" value={totalActivities(activityByDay, data.recentActivity)} />
      </div>

      <div className="card">
        <h3>Learning Activity</h3>
        <p><small>Your day-by-day learning activity across all spaces and projects.</small></p>
        <ActivityChart series={series} />
      </div>

      <div className="analytics-cols">
        <div className="card">
          <h3>Tutor Usage</h3>
          <TutorUsage total={counts.tutorMessages || 0} trend={tutorTrend(data.recentActivity)} />
        </div>
        <div className="card">
          <h3>Quiz Performance</h3>
          <QuizAnalytics summary={quizSummary} />
        </div>
      </div>

      <div className="analytics-cols">
        <div className="card">
          <h3>Concept Mastery</h3>
          <p><small>How your concepts are distributed across mastery levels.</small></p>
          <MasteryDistribution distribution={data.masteryDistribution} />
        </div>
        <div className="card">
          <h3>Recent Materials</h3>
          <p><small>Latest materials uploaded across all projects.</small></p>
          <RecentMaterials materials={data.recentMaterials} />
        </div>
      </div>

      <div className="card">
        <h3>Recent Activity</h3>
        <RecentActivity items={data.recentActivity} />
      </div>
    </div>
  );
}
