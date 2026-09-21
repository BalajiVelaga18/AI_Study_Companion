import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import AnalyticsDashboard from '../components/analytics/AnalyticsDashboard.jsx';
import Tutor from '../components/tutor/Tutor.jsx';
import Quiz from '../components/quiz/Quiz.jsx';

export default function Project({ initialTab, projectId }) {
  const { id: paramId } = useParams();
  const id = projectId || paramId;
  const [search] = useSearchParams();
  const [tab, setTab] = useState(initialTab || search.get('tab') || 'materials');
  const [mats, setMats] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [highlightMat, setHighlightMat] = useState(null);
  const [uploadStatus, setUploadStatus] = useState({ type: 'idle', message: '' });

  const load = async () => {
    try {
      const [m, a] = await Promise.all([
        api(`/api/materials/${id}/materials`),
        api(`/api/analytics/project/${id}`),
      ]);
      setMats(m);
      setAnalytics(a);
      setErr('');
    } catch (e) {
      setErr(e.message || 'Could not load project.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [id]);

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadStatus({ type: 'error', message: 'Only PDF files are allowed.' });
      e.target.value = '';
      return;
    }

    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadStatus({ type: 'error', message: `File too large. Maximum size is ${MAX_SIZE / (1024 * 1024)}MB.` });
      e.target.value = '';
      return;
    }

    setUploadStatus({ type: 'uploading', message: `Uploading ${file.name}...` });

    const form = new FormData();
    form.append('file', file);
    form.append('idempotencyKey', crypto.randomUUID());

    try {
      await api(`/api/materials/${id}/materials`, { method: 'POST', body: form });
      setUploadStatus({ type: 'success', message: `${file.name} uploaded successfully.` });
      load();
    } catch (e) {
      setUploadStatus({ type: 'error', message: e.message || 'Upload failed. Please try again.' });
    } finally {
      e.target.value = '';
    }
  };

  const viewMaterial = (materialId) => {
    setHighlightMat(materialId);
    setTab('materials');
  };

  if (loading) return <div className="card">Loading project workspace…</div>;
  if (err) {
    return (
      <div className="card">
        <b>Couldn’t load project.</b> {err}
      </div>
    );
  }

  return (
    <div className="project-shell">
      <div className="project-head">
        <h2>Project workspace</h2>
        <div className="project-tabs-bar">
          {['materials', 'tutor', 'quiz', 'mastery', 'growth', 'analytics'].map((t) => (
            <button
              key={t}
              className={tab === t ? 'active' : ''}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="project-body">
        {tab === 'materials' && (
          <div className="card">
            <h3>Materials</h3>
            <input type="file" accept=".pdf" onChange={upload} disabled={uploadStatus.type === 'uploading'} />
            {uploadStatus.message && (
              <p className={`upload-status ${uploadStatus.type}`}><small>{uploadStatus.message}</small></p>
            )}
            {mats.length === 0 && uploadStatus.type === 'idle' && (
              <p><small>No PDFs yet — upload one to ground the Tutor.</small></p>
            )}
            {mats.map((m) => (
              <div
                key={m._id}
                className={String(highlightMat) === String(m._id) ? 'mat-highlight' : ''}
              >
                {m.filename} — <b>{m.status}</b>
                {m.pageCount ? ` · ${m.pageCount}p` : ''}
                {m.error ? <small>{m.error}</small> : ''}
              </div>
            ))}
          </div>
        )}

        {tab === 'tutor' && (
          <Tutor
            projectId={id}
            mats={mats}
            growth={analytics?.growth || []}
            onViewMaterial={viewMaterial}
          />
        )}

        {tab === 'quiz' && (
          <Quiz projectId={id} onComplete={load} />
        )}

        {(tab === 'mastery' || tab === 'growth') && (
          <div className="card">
            <h3>Mastery & Growth</h3>
            {(!analytics?.growth || analytics.growth.length === 0) && (
              <p><small>No concepts yet — upload and process a PDF, then take a quiz.</small></p>
            )}
            {analytics?.growth?.map((g) => (
              <div key={g.name} style={{ marginBottom: 8 }}>
                {g.name}
                <div className="bar"><i style={{ width: `${Math.round(g.mastery * 100)}%` }} /></div>
                <small>
                  {Math.round(g.mastery * 100)}% · {g.trend}
                  {g.delta ? ` (${g.delta > 0 ? '+' : ''}${Math.round(g.delta * 100)}%)` : ''}
                </small>
                <Sparkline data={g.history} />
              </div>
            ))}
            {analytics?.recs?.map((r, i) => (
              <div key={i}>💡 {r.text} <small>({r.reason})</small></div>
            ))}
          </div>
        )}

        {tab === 'analytics' && <AnalyticsDashboard projectId={id} />}
      </div>
    </div>
  );
}

function Sparkline({ data }) {
  if (!data || data.length < 2) return null;
  const w = 120;
  const h = 24;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - v * h}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block', marginTop: 4 }}>
      <polyline points={pts} fill="none" stroke="#0a7" strokeWidth="2" />
    </svg>
  );
}
