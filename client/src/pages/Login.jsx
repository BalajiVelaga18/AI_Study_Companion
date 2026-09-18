import React, { useState } from 'react';
import { API } from '../lib/api.js';
export default function Login({ mode = 'login' }) {
  const [email, setEmail] = useState('user@demo.local');
  const [password, setPassword] = useState('user123');
  const [busy, setBusy] = useState(false);
  const go = async (m) => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/auth/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const j = await r.json();
      if (j.token) { localStorage.setItem('token', j.token); window.location.href = '/'; } else alert(j.error?.message || j.error || 'failed');
    } finally { setBusy(false); }
  };
  return <div className="login-shell"><div className="card login-card"><div className="eyebrow">Your learning studio</div><h2>{mode === 'register' ? 'Start learning' : 'Welcome back'}</h2><p>Turn scattered notes into a clearer path forward.</p>
    <input value={email} onChange={(e) => setEmail(e.target.value)} /><br /><br />
    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /><br /><br />
    <div className="login-actions"><button onClick={() => go('login')} disabled={busy}>Login</button><button onClick={() => go('register')} disabled={busy}>Register</button></div>
    <p><small>Seed: user@demo.local/user123, admin@demo.local/admin123</small></p></div></div>;
}
