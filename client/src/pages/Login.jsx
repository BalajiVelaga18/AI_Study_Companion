import React, { useState } from 'react';
import { API } from '../lib/api.js';

export default function Login({ mode = 'login' }) {
  const [email, setEmail] = useState('user@demo.local');
  const [password, setPassword] = useState('user123');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (action) => {
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/auth/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
        window.location.href = '/';
        return;
      }
      setMessage(data.error?.message || data.error || 'Something went wrong. Please try again.');
    } catch (err) {
      setMessage('Network error. Is the server awake?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="card login-card">
        <div className="eyebrow">Your learning studio</div>
        <h2>{mode === 'register' ? 'Start learning' : 'Welcome back'}</h2>
        <p>Turn scattered notes into a clearer path forward.</p>

        {message && <div className="form-error">{message}</div>}

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />

        <div className="login-actions">
          <button onClick={() => submit('login')} disabled={busy}>
            {busy ? 'Please wait…' : 'Login'}
          </button>
          <button onClick={() => submit('register')} disabled={busy} className="btn-secondary">
            Register
          </button>
        </div>

        <p>
          <small>Seed: user@demo.local/user123, admin@demo.local/admin123</small>
        </p>
      </div>
    </div>
  );
}
