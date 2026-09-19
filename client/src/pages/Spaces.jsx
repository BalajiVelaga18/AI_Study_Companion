import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function Spaces({ detail }) {
  const { spaceId } = useParams();
  const [spaces, setSpaces] = useState([]);
  const [one, setOne] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/api/spaces').then(setSpaces).catch((e) => setErr(String(e.message)));
    if (detail && spaceId) api(`/api/spaces/${spaceId}`).then(setOne).catch((e) => setErr(String(e.message)));
  }, [spaceId]);
  if (err) return <div className="card"><b>Couldn’t load spaces.</b> {err}</div>;
  if (detail && spaceId) {
    if (!one) return <div className="card">Loading space…</div>;
    return <div><h2>{one.name}</h2><p><small>{one.description}</small></p>
      <div className="card"><h3>Projects</h3>{(one.projects || []).map((p) => <div key={p._id}><Link to={`/projects/${p._id}`}>{p.name}</Link> <small>— {p.goal || p.learningGoal}</small></div>)}
      {(one.projects || []).length === 0 && <small>No projects yet — create one from the Dashboard.</small>}</div></div>;
  }
  return <div><h2>Spaces</h2>
    {spaces.length === 0 && <div className="card"><small>No spaces yet — create one from the Dashboard.</small></div>}
    {spaces.map((s) => <div key={s._id} className="card"><Link to={`/spaces/${s._id}`}><b>{s.name}</b></Link> <small>{s.description}</small></div>)}
  </div>;
}
