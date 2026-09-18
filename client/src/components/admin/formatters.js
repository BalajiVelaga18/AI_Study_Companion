// Admin dashboard data formatting utilities.

export function n(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return Number(v).toLocaleString('en-US');
}

export function pct(v, fallback = '—') {
  if (v === null || v === undefined || Number.isNaN(v)) return fallback;
  return `${Math.round(Number(v))}%`;
}

export function ms(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const n = Number(v);
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

export function tokens(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const n = Number(v);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString('en-US');
}

export function bytes(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const n = Number(v);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function uptime(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const total = Math.max(0, Math.round(Number(v)));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function relTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(iso);
}

export function providerLabel(p) {
  const s = String(p || 'local').toLowerCase();
  if (s === 'gemini') return 'Gemini';
  if (s === 'mock') return 'Mock';
  if (s === 'local') return 'Local';
  return s.replace(/^./, (c) => c.toUpperCase());
}

export function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (['completed', 'ready', 'success', 'ok', 'healthy', 'done', 'passed', 'active'].includes(s)) return 'success';
  if (['running', 'processing', 'pending', 'queued', 'in progress'].includes(s)) return 'warning';
  if (['failed', 'error', 'unhealthy', 'down', 'critical', 'timeout'].includes(s)) return 'danger';
  return 'neutral';
}

export function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'done') return 'Completed';
  if (s === 'failed') return 'Failed';
  if (['processing', 'running'].includes(s)) return 'Processing';
  if (s === 'queued') return 'Queued';
  return s.replace(/^./, (c) => c.toUpperCase());
}

export const EVENT_LABELS = {
  'tutor.ask': 'Tutor Question',
  'quiz.start': 'Quiz Started',
  'quiz.submit': 'Quiz Submitted',
  'quiz.complete': 'Quiz Completed',
  'question.answer': 'Question Answered',
  'material.upload': 'Material Uploaded',
  'material.processing': 'Material Processing',
  'material.ready': 'Material Ready',
  'material.failed': 'Material Failed',
  'mastery.update': 'Mastery Updated',
  'recommendation': 'Recommendation',
  'project.create': 'Project Created',
  'space.create': 'Space Created',
  'user.register': 'User Registered',
};

export const EVENT_ICONS = {
  'tutor.ask': '💬',
  'quiz.start': '📝',
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
  return String(type || 'Event')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function eventIcon(type) {
  return EVENT_ICONS[type] || '●';
}

export function toSeries(data, dateKey = 'at') {
  if (!Array.isArray(data)) return [];
  const counts = {};
  for (const item of data) {
    const raw = item[dateKey] || item.createdAt || item.at;
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  const entries = Object.entries(counts)
    .map(([k, v]) => ({ d: new Date(`${k}T12:00:00`), activities: v }))
    .sort((a, b) => a.d - b.d);
  if (!entries.length) return [];
  const out = [];
  const cursor = new Date(entries[0].d);
  const end = entries[entries.length - 1].d;
  const byTime = new Map(entries.map((e) => [e.d.getTime(), e.activities]));
  while (cursor <= end) {
    out.push({
      date: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      full: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      activities: byTime.get(cursor.getTime()) ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
