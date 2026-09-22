import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import GlobalAnalytics from '../components/analytics/GlobalAnalytics.jsx';

export default function Home() {
  const [spaces, setSpaces] = useState([]);
  const [global, setGlobal] = useState(null);
  const [name, setName] = useState('');

  const load = async () => {
    try {
      setSpaces(await api('/api/spaces'));
      setGlobal(await api('/api/analytics/global'));
    } catch { window.location.href = '/login'; }
  };
  useEffect(() => { load(); }, []);

  const createSpace = async () => {
    const s = await api('/api/spaces', { method: 'POST', body: JSON.stringify({ name, description: '' }) });
    setName(''); setSpaces([...spaces, s]);
  };
  return <div>
    <h2>Where was I, how am I doing, what next?</h2>
    {global && <div className="card"><b>Continue learning:</b> {global.nextActions?.[0]?.text || 'Create a project and upload a PDF to begin.'}<br />
      <small>Projects: {global.counts?.projects ?? global.projects} · Spaces: {global.counts?.spaces ?? global.spaces} · Needs attention: {global.needsAttention?.map((w) => `${w.name} (${Math.round(w.mastery * 100)}%)`).join(', ') || 'none'}</small></div>}

    <GlobalAnalytics />

    <div className="card"><h3>Spaces</h3>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New space name (e.g. Machine Learning)" />
      <p><button onClick={createSpace}>Create space</button></p>
      {spaces.map((s) => <SpaceRow key={s._id} s={s} />)}
    </div>
  </div>;
}

function SpaceRow({ s }) {
  const [projects, setProjects] = useState([]);
  const [pname, setPname] = useState('');
  const [goal, setGoal] = useState('');
  useEffect(() => { api(`/api/spaces/${s._id}/projects`).then(setProjects).catch(() => {}); }, []);
  const create = async () => {
    const p = await api('/api/projects', { method: 'POST', body: JSON.stringify({ spaceId: s._id, name: pname, goal }) });
    setProjects([...projects, p]); setPname(''); setGoal('');
  };
  return <div className="card"><b>{s.name}</b>
    {projects.map((p) => <div key={p._id}><Link to={`/project/${p._id}`}>{p.name}</Link> <small>— {p.goal}</small></div>)}
    <p><input value={pname} onChange={(e) => setPname(e.target.value)} placeholder="Project name" />
    <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Learning goal" />
    <button onClick={create}>Create project</button></p>
  </div>;
}
