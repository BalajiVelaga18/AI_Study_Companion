// Vite injects env vars prefixed with VITE_ at build time.
// Set VITE_API_URL on Vercel (or your build host) to point at the Render backend.
export const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
export function authHeaders() { return { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }; }

function errorMessage(data) {
  if (!data || typeof data !== 'object') return '';
  if (typeof data.error === 'string') return data.error;
  if (data.error && typeof data.error === 'object') {
    if (typeof data.error.message === 'string') return data.error.message;
    if (typeof data.error.code === 'string') return data.error.code;
  }
  if (typeof data.message === 'string') return data.message;
  return '';
}

export async function api(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { ...(opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...authHeaders(), ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(errorMessage(await r.json().catch(() => ({}))) || r.statusText);
  return r.json();
}
