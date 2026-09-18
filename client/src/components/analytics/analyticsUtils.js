// Pure data transforms for the Analytics dashboard (no React — unit-testable).

export function parseDayKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); // local noon-safe (midnight local)
}

export function shortDay(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// { '2026-09-17': 10, ... } -> sorted [{ date, full, activities }], gaps filled with 0.
export function toActivitySeries(activityByDay) {
  if (!activityByDay || typeof activityByDay !== 'object') return [];
  const entries = Object.entries(activityByDay)
    .map(([k, v]) => ({ d: parseDayKey(k), activities: Number(v) || 0 }))
    .filter((e) => e.d && !Number.isNaN(e.d.getTime()))
    .sort((a, b) => a.d - b.d);
  if (!entries.length) return [];
  const byTime = new Map(entries.map((e) => [e.d.getTime(), e.activities]));
  const out = [];
  const cursor = new Date(entries[0].d);
  const end = entries[entries.length - 1].d;
  while (cursor <= end) {
    out.push({
      date: shortDay(cursor),
      full: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      activities: byTime.get(cursor.getTime()) ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function totalActivities(activityByDay, activityList) {
  const series = toActivitySeries(activityByDay);
  if (series.length) return series.reduce((s, p) => s + p.activities, 0);
  return Array.isArray(activityList) ? activityList.length : 0;
}

// Quizzes -> { total, completed, avg|null, best|null, recent: [{score, at, completed}] }
export function summarizeQuizzes(quizzes) {
  const list = Array.isArray(quizzes) ? quizzes : [];
  const scored = list
    .map((q) => ({ score: typeof q.score === 'number' ? q.score : null, at: q.at || q.createdAt || null, completed: q.completed !== false }))
    .filter((q) => q.score !== null);
  const completed = scored.filter((q) => q.completed);
  const pool = completed.length ? completed : [];
  const avg = pool.length ? Math.round(pool.reduce((s, q) => s + q.score, 0) / pool.length) : null;
  const best = pool.length ? Math.max(...pool.map((q) => q.score)) : null;
  return {
    total: list.length,
    completed: completed.length,
    avg,
    best,
    recent: scored.slice(-5).reverse(),
  };
}

export const EVENT_LABELS = {
  'tutor.ask': 'Asked Tutor',
  'quiz.start': 'Started Quiz',
  'quiz.submit': 'Completed Quiz',
  'quiz.complete': 'Completed Quiz',
  'question.answer': 'Answered Question',
  'material.upload': 'Uploaded Material',
  'material.processing': 'Processing Material',
  'material.ready': 'Material Ready',
  'material.failed': 'Material Failed',
  'mastery.update': 'Mastery Updated',
  'recommendation': 'New Recommendation',
  'project.create': 'Created Project',
  'space.create': 'Created Space',
  'user.register': 'Joined',
};

export const EVENT_ICONS = {
  'tutor.ask': '💬',
  'quiz.start': '▶️',
  'quiz.submit': '✅',
  'quiz.complete': '✅',
  'question.answer': '✏️',
  'material.upload': '📄',
  'material.processing': '⚙️',
  'material.ready': '📚',
  'material.failed': '⚠️',
  'mastery.update': '📈',
  'recommendation': '💡',
  'project.create': '🗂️',
  'space.create': '🗂️',
  'user.register': '👋',
};

export function eventLabel(type) {
  if (EVENT_LABELS[type]) return EVENT_LABELS[type];
  return String(type || 'Activity')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Local-timezone, human-friendly: "Today, 10:15 AM" / "Yesterday, 4:02 PM" / "Sep 16, 2026, 9:00 AM"
export function formatActivityTime(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown time';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today - day) / 86400000);
  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${time}`;
}

// tutor.ask events per day from raw activity, for the Tutor Usage trend.
export function tutorTrend(activity) {
  if (!Array.isArray(activity)) return [];
  const counts = {};
  for (const a of activity) {
    if (a?.type !== 'tutor.ask' || !a.at) continue;
    const d = new Date(a.at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return toActivitySeries(counts).map((p) => ({ date: p.date, full: p.full, messages: p.activities }));
}
