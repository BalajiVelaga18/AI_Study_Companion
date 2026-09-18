import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { API, authHeaders } from '../lib/api.js';
import AnalyticsDashboard from '../components/analytics/AnalyticsDashboard.jsx';
import Tutor from '../components/tutor/Tutor.jsx';

export default function Project({ initialTab, projectId }) {
  const { id: paramId } = useParams();
  const id = projectId || paramId;
  const [search] = useSearchParams();
  const [tab, setTab] = useState(initialTab || search.get('tab') || 'materials');
  const [mats, setMats] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [highlightMat, setHighlightMat] = useState(null);

  const load = async () => {
    try {
      const [m, a] = await Promise.all([
        api(`/api/materials/${id}/materials`),
        api(`/api/analytics/project/${id}`),
      ]);
      setMats(m); setAnalytics(a); setErr('');
    } catch (e) { setErr(String(e.message || e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [id]);

  const upload = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f); fd.append('idempotencyKey', crypto.randomUUID());
    await fetch(`${API}/api/materials/${id}/materials`, { method: 'POST', headers: { ...authHeaders() }, body: fd });
    load();
  };
  const viewMaterial = (materialId) => {
    setHighlightMat(materialId);
    setTab('materials');
  };
  const startQuiz = async () => {
    try { setQuiz(await api(`/api/quiz/${id}/quiz/start`, { method: 'POST', body: JSON.stringify({ n: 5 }) })); }
    catch (e) { alert('Quiz error: ' + e.message); }
  };
  const answer = async (item, val) => {
    const r = await api(`/api/quiz/${id}/quiz/${quiz.quizId}/answer`, { method: 'POST', body: JSON.stringify({ itemId: item.id, answer: val }) });
    alert(`${r.correct ? '✓' : '✗'} ${r.feedback}`);
    setAnalytics(await api(`/api/analytics/project/${id}`));
  };
  const completeQuiz = async () => {
    const r = await api(`/api/quiz/${id}/quiz/${quiz.quizId}/complete`, { method: 'POST', body: '{}' });
    alert(`Quiz complete — score ${r.score}`);
    setAnalytics(await api(`/api/analytics/project/${id}`));
  };

  if (loading) return <div className="card">Loading project workspace…</div>;
  if (err) return <div className="card"><b>Couldn’t load project.</b> {err} <small>(Is the server running on :4000? Are you logged in?)</small></div>;

  return <div className="project-shell">
    <div className="project-head">
      <h2>Project workspace</h2>
      <div className="project-tabs-bar">
        {['materials', 'tutor', 'quiz', 'mastery', 'growth', 'analytics'].map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>
    </div>
    <div className="project-body">
    {tab === 'materials' && <div className="card"><h3>Materials → processing (queued/processing/ready/failed)</h3><input type="file" accept=".pdf" onChange={upload} />
      {mats.length === 0 && <p><small>No PDFs yet — upload one to ground the Tutor. Status updates every few seconds.</small></p>}
      {mats.map((m) => <div key={m._id} className={String(highlightMat) === String(m._id) ? 'mat-highlight' : ''}>{m.filename} — <b>{m.status}</b> {m.pageCount ? `· ${m.pageCount}p` : ''} {m.error ? <small>{m.error}</small> : ''}</div>)}</div>}
    {tab === 'tutor' && <Tutor projectId={id} mats={mats} growth={analytics?.growth || []} onViewMaterial={viewMaterial} />}
    {tab === 'quiz' && <div className="card"><h3>Adaptive Quiz (targets weakest concepts first)</h3><button onClick={startQuiz}>Start quiz</button>
      {quiz?.fallbackUsed && <div className="fallback-indicator">AI service temporarily unavailable — using backup mode.</div>}
      {quiz && <p><button onClick={completeQuiz}>Complete quiz → mastery update</button></p>}
      {!quiz && <p><small>No active quiz — start one. MCQ + open-ended; correct answers are never sent before submission.</small></p>}
      {quiz?.items.map((it) => <div key={it.id} className="card"><b>[{it.concept}/{it.difficulty}]</b> {it.prompt}
        {it.type === 'mcq' ? it.options.map((o, k) => <div key={k}><button onClick={() => answer(it, k)}>{o}</button></div>)
          : <QuizOpen item={it} onSend={(v) => answer(it, v)} />}</div>)}</div>}
    {(tab === 'mastery' || tab === 'growth') && <div className="card"><h3>Estimated mastery & Growth → what next?</h3>
      {(!analytics?.growth || analytics.growth.length === 0) && <p><small>No concepts yet — upload + process a PDF, then take a quiz.</small></p>}
      {analytics?.growth?.map((g) => <div key={g.name} style={{ marginBottom: 8 }}>{g.name} <div className="bar"><i style={{ width: `${Math.round(g.mastery * 100)}%` }} /></div><small>{Math.round(g.mastery * 100)}% · {g.trend} {g.delta ? `(${g.delta > 0 ? '+' : ''}${Math.round(g.delta * 100)}%)` : ''}</small><Sparkline data={g.history} /></div>)}
      {analytics?.recs?.map((r, i) => <div key={i}>💡 {r.text} <small>({r.reason})</small></div>)}</div>}
    {tab === 'analytics' && <AnalyticsDashboard projectId={id} />}
    </div>
  </div>;
}
function QuizOpen({ item, onSend }) {
  const [v, setV] = React.useState('');
  return <p><textarea value={v} onChange={(e) => setV(e.target.value)} rows={3} /><br /><button onClick={() => onSend(v)}>Submit open answer</button></p>;
}
// Tiny dependency-free trend sparkline (replaces a chart lib for the prototype)
function Sparkline({ data }) {
  if (!data || data.length < 2) return null;
  const w = 120, h = 24;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - v * h}`).join(' ');
  return <svg width={w} height={h} style={{ display: 'block', marginTop: 4 }}><polyline points={pts} fill="none" stroke="#0a7" strokeWidth="2" /></svg>;
}
