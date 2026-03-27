/** API client — uses session cookies, redirects to /login on 401 */
const BASE = '';

export async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  if (r.status === 401) { window.location.href = '/login.html'; return null; }
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || e.error || `HTTP ${r.status}`); }
  return r.json();
}

export async function getMe() {
  const r = await fetch('/auth/me', { credentials: 'same-origin' });
  if (!r.ok) return null;
  return r.json();
}

export async function logout() {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  window.location.href = '/login.html';
}

export function ago(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString();
}

export function trunc(s, n) { return !s ? '' : s.length > n ? s.slice(0, n) + '…' : s; }
