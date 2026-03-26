/** MemoClaw Dashboard — Modern UI */

const S = { view: 'dashboard', containers: [], mPage: 0, dPage: 0, user: null };

// ── API ───────────────────────────────────────────
async function api(m, p, b) {
  const o = { method: m, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (b) o.body = JSON.stringify(b);
  const r = await fetch(`/v1${p}`, o);
  if (r.status === 401) return void (location.href = '/login');
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || e.error || `HTTP ${r.status}`); }
  return r.json();
}

// ── Init ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadUser();
  checkHealth();
  loadDash();
  loadContainers();
});

async function loadUser() {
  try {
    const r = await fetch('/auth/me', { credentials: 'same-origin' });
    if (!r.ok) return void (location.href = '/login');
    const d = await r.json();
    S.user = d.username;
    document.getElementById('current-user').textContent = d.username;
    document.getElementById('user-avatar').textContent = d.username[0].toUpperCase();
  } catch {}
}

async function handleLogout() {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  location.href = '/login';
}

// ── Navigation ────────────────────────────────────
function nav(v) {
  S.view = v;
  document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const sec = document.getElementById(`v-${v}`);
  if (sec) { sec.classList.remove('hidden'); sec.classList.add('animate-fade-in'); }
  const btn = document.querySelector(`[data-v="${v}"]`);
  if (btn) btn.classList.add('active');
  ({ dashboard: loadDash, memories: loadMemories, documents: loadDocs, graph: loadGraph })[v]?.();
}

// ── Health ────────────────────────────────────────
async function checkHealth() {
  const el = document.getElementById('health-status');
  try {
    await (await fetch('/health')).json();
    el.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span>Connected</span>';
  } catch {
    el.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-red-400"></span><span>Offline</span>';
  }
}

// ── Containers ────────────────────────────────────
async function loadContainers() {
  try {
    const [m, d] = await Promise.all([api('GET', '/memories?limit=200'), api('GET', '/documents?limit=200')]);
    const tags = new Set();
    (m.memories || []).forEach(x => x.containerTag && tags.add(x.containerTag));
    (d.documents || []).forEach(x => x.containerTag && tags.add(x.containerTag));
    S.containers = [...tags].sort();
    ['f-mem-container', 'f-graph-container', 'f-profile', 'f-search-container'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const first = id === 'f-profile' ? '<option value="">Select container…</option>' : '<option value="">All containers</option>';
      el.innerHTML = first + S.containers.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    });
  } catch {}
}

// ── Dashboard ─────────────────────────────────────
async function loadDash() {
  try {
    const [m, d] = await Promise.all([api('GET', '/memories?limit=5'), api('GET', '/documents?limit=5')]);
    document.getElementById('s-mem').textContent = m.total || 0;
    document.getElementById('s-doc').textContent = d.total || 0;
    document.getElementById('s-con').textContent = S.containers.length;
    document.getElementById('s-pro').textContent = S.containers.length;

    const rm = document.getElementById('recent-mem');
    rm.innerHTML = (m.memories || []).length === 0 ? '<div class="empty">No memories yet</div>'
      : (m.memories || []).map(x => `
        <div class="px-5 py-3 hover:bg-white/[0.02] cursor-pointer transition-colors" onclick="openMemDrawer('${x.id}')">
          <div class="flex items-center gap-2 mb-1">
            <span class="badge badge-${x.type}">${x.type}</span>
            ${x.containerTag ? `<span class="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded">${esc(x.containerTag)}</span>` : ''}
            <span class="ml-auto text-[10px] text-gray-600">${ago(x.createdAt)}</span>
          </div>
          <p class="text-[13px] text-gray-300 leading-relaxed line-clamp-2">${esc(x.memory)}</p>
        </div>`).join('');

    const rd = document.getElementById('recent-doc');
    rd.innerHTML = (d.documents || []).length === 0 ? '<div class="empty">No documents yet</div>'
      : (d.documents || []).map(x => `
        <div class="px-5 py-3 hover:bg-white/[0.02] cursor-pointer transition-colors" onclick="openDocDrawer('${x.id}')">
          <div class="flex items-center gap-2 mb-1">
            <span class="badge badge-${x.status}">${x.status}</span>
            ${x.containerTag ? `<span class="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded">${esc(x.containerTag)}</span>` : ''}
            <span class="ml-auto text-[10px] text-gray-600">${ago(x.createdAt)}</span>
          </div>
          <p class="text-[13px] text-gray-300 leading-relaxed line-clamp-2">${esc(trunc(x.content, 120))}</p>
        </div>`).join('');
  } catch (e) { console.error(e); }
}

// ── Memories ──────────────────────────────────────
async function loadMemories() {
  const el = document.getElementById('mem-list');
  el.innerHTML = '<div class="p-12 text-center"><span class="spinner"></span></div>';
  try {
    const ct = document.getElementById('f-mem-container').value;
    const tp = document.getElementById('f-mem-type').value;
    let url = `/memories?limit=50&offset=${S.mPage * 50}`;
    if (ct) url += `&container_tag=${encodeURIComponent(ct)}`;
    const data = await api('GET', url);
    let list = data.memories || [];
    if (tp) list = list.filter(m => m.type === tp);
    if (!list.length) { el.innerHTML = '<div class="empty">No memories found</div>'; return; }
    el.innerHTML = list.map(m => `
      <div class="mem-row" onclick="openMemDrawer('${m.id}')">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="badge badge-${m.type}">${m.type}</span>
          ${m.containerTag ? `<span class="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded">${esc(m.containerTag)}</span>` : ''}
          ${m.isLatest ? '<span class="text-[10px] text-emerald-500">● latest</span>' : '<span class="text-[10px] text-gray-600">○ old</span>'}
          <span class="ml-auto text-[10px] text-gray-600">${ago(m.createdAt)}</span>
          <button class="btn-danger opacity-0 group-hover:opacity-100" onclick="event.stopPropagation();forgetMem('${m.id}')">Forget</button>
        </div>
        <p class="text-[13px] text-gray-300 leading-relaxed">${esc(m.memory)}</p>
      </div>`).join('');
  } catch (e) { el.innerHTML = `<div class="empty text-red-400">Error: ${esc(e.message)}</div>`; }
}

async function forgetMem(id) {
  if (!confirm('Forget this memory?')) return;
  try { await api('DELETE', `/memories/${id}`); toast('Memory forgotten'); loadMemories(); } catch (e) { toast(e.message, 'error'); }
}

// ── Documents ─────────────────────────────────────
async function loadDocs() {
  const el = document.getElementById('doc-list');
  el.innerHTML = '<div class="p-12 text-center"><span class="spinner"></span></div>';
  try {
    const st = document.getElementById('f-doc-status').value;
    let url = `/documents?limit=50&offset=${S.dPage * 50}`;
    if (st) url += `&status=${st}`;
    const data = await api('GET', url);
    const list = data.documents || [];
    if (!list.length) { el.innerHTML = '<div class="empty">No documents found</div>'; return; }
    el.innerHTML = list.map(d => `
      <div class="mem-row" onclick="openDocDrawer('${d.id}')">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="badge badge-${d.status}">${d.status}</span>
          ${d.containerTag ? `<span class="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded">${esc(d.containerTag)}</span>` : ''}
          <span class="ml-auto text-[10px] text-gray-600">${ago(d.createdAt)}</span>
          <button class="btn-danger opacity-0 group-hover:opacity-100" onclick="event.stopPropagation();delDoc('${d.id}')">Delete</button>
        </div>
        <p class="text-[13px] text-gray-300 leading-relaxed line-clamp-3">${esc(trunc(d.content, 200))}</p>
      </div>`).join('');
  } catch (e) { el.innerHTML = `<div class="empty text-red-400">Error: ${esc(e.message)}</div>`; }
}

async function delDoc(id) {
  if (!confirm('Delete this document?')) return;
  try { await fetch(`/v1/documents/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }); toast('Document deleted'); loadDocs(); } catch (e) { toast(e.message, 'error'); }
}

// ── Graph ─────────────────────────────────────────
let G = { nodes: [], edges: [] }, GT = { x: 0, y: 0, s: 1 }, drag = null, hover = null;

async function loadGraph() {
  try {
    const ct = document.getElementById('f-graph-container').value;
    let url = '/memories?limit=200';
    if (ct) url += `&container_tag=${encodeURIComponent(ct)}`;
    const data = await api('GET', url);
    const mems = data.memories || [];
    const empty = document.getElementById('graph-empty');
    if (!mems.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    const W = 800, H = 600;
    G.nodes = mems.map((m, i) => {
      const angle = (2 * Math.PI * i) / mems.length;
      const r = 150 + Math.random() * 120;
      return { id: m.id, label: trunc(m.memory, 50), full: m.memory, type: m.type, tag: m.containerTag, latest: m.isLatest,
        x: W / 2 + r * Math.cos(angle), y: H / 2 + r * Math.sin(angle), r: 6 + Math.random() * 4 };
    });
    // Edges by container adjacency
    G.edges = [];
    const byC = {};
    mems.forEach(m => { if (m.containerTag) (byC[m.containerTag] = byC[m.containerTag] || []).push(m.id); });
    Object.values(byC).forEach(ids => { for (let i = 0; i < ids.length - 1 && i < 30; i++) G.edges.push({ s: ids[i], t: ids[i + 1], type: ['extends', 'updates', 'derives'][i % 3] }); });
    drawGraph();
  } catch (e) { console.error(e); }
}

function drawGraph() {
  const c = document.getElementById('graph-canvas'), ctx = c.getContext('2d');
  const rect = c.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  c.width = rect.width * dpr; c.height = rect.height * dpr;
  c.style.width = rect.width + 'px'; c.style.height = rect.height + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.save(); ctx.translate(GT.x, GT.y); ctx.scale(GT.s, GT.s);

  const col = { fact: '#8b5cf6', preference: '#fbbf24', episode: '#38bdf8' };
  const ecol = { updates: '#f87171', extends: '#34d399', derives: '#fb923c' };
  const nm = {}; G.nodes.forEach(n => nm[n.id] = n);

  // Edges
  G.edges.forEach(e => {
    const a = nm[e.s], b = nm[e.t];
    if (!a || !b) return;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = ecol[e.type] || '#1a1a2a'; ctx.globalAlpha = 0.2; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
  });

  // Nodes
  G.nodes.forEach(n => {
    const h = hover && hover.id === n.id;
    const r = h ? n.r * 1.6 : n.r;
    if (h) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2); ctx.fillStyle = (col[n.type] || '#8b5cf6') + '22'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fillStyle = col[n.type] || '#8b5cf6'; ctx.fill();
    if (!n.latest) { ctx.strokeStyle = '#333'; ctx.lineWidth = 0.5; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]); }
    if (GT.s > 0.6 || h) {
      ctx.font = `${h ? 11 : 9}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = h ? '#e2e8f0' : '#6b7280'; ctx.textAlign = 'center';
      ctx.fillText(n.label, n.x, n.y + r + 13);
    }
  });
  ctx.restore();
}

// Graph interactions
(function () {
  const c = document.getElementById('graph-canvas');
  if (!c) return;
  c.addEventListener('mousedown', e => { drag = { sx: e.clientX - GT.x, sy: e.clientY - GT.y }; });
  c.addEventListener('mousemove', e => {
    if (drag) { GT.x = e.clientX - drag.sx; GT.y = e.clientY - drag.sy; drawGraph(); return; }
    const rect = c.getBoundingClientRect();
    const mx = (e.clientX - rect.left - GT.x) / GT.s, my = (e.clientY - rect.top - GT.y) / GT.s;
    let found = null;
    for (const n of G.nodes) { if ((mx - n.x) ** 2 + (my - n.y) ** 2 < 200) { found = n; break; } }
    if (found !== hover) {
      hover = found; drawGraph();
      const tip = document.getElementById('graph-tip');
      if (found) {
        tip.classList.remove('hidden');
        tip.style.left = (e.clientX - rect.left + 14) + 'px'; tip.style.top = (e.clientY - rect.top - 8) + 'px';
        tip.innerHTML = `<p class="font-medium text-gray-200 mb-1">${esc(found.full)}</p><p class="text-gray-500">${found.type} · ${found.tag || 'untagged'}</p>`;
      } else tip.classList.add('hidden');
    }
  });
  c.addEventListener('mouseup', () => { drag = null; });
  c.addEventListener('mouseleave', () => { drag = null; });
  c.addEventListener('wheel', e => { e.preventDefault(); GT.s = Math.max(0.2, Math.min(5, GT.s * (e.deltaY > 0 ? 0.92 : 1.08))); drawGraph(); }, { passive: false });
  window.addEventListener('resize', () => { if (S.view === 'graph') drawGraph(); });
})();

// ── Profiles ──────────────────────────────────────
async function loadProfile(ct) {
  const el = document.getElementById('profile-out');
  if (!ct) { el.innerHTML = '<div class="text-sm text-gray-600">Select a container</div>'; return; }
  el.innerHTML = '<div class="p-8 text-center"><span class="spinner"></span></div>';
  try {
    const d = await api('POST', '/profile', { containerTag: ct });
    const p = d.profile;
    el.innerHTML = `
      <div class="card !p-0 mb-4 overflow-hidden">
        <div class="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
          <svg class="w-4 h-4 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
          <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Static Facts</h4>
          <span class="text-[10px] bg-brand-400/10 text-brand-400 px-1.5 rounded font-bold">${(p.static||[]).length}</span>
        </div>
        <div class="px-5 py-2">
          ${(p.static||[]).length ? (p.static||[]).map(f => `<div class="fact-row"><span class="fact-dot bg-brand-400"></span><span class="text-gray-300">${esc(f)}</span></div>`).join('')
            : '<p class="py-4 text-xs text-gray-600 text-center">No static facts yet</p>'}
        </div>
      </div>
      <div class="card !p-0 overflow-hidden">
        <div class="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
          <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dynamic Context</h4>
          <span class="text-[10px] bg-cyan-400/10 text-cyan-400 px-1.5 rounded font-bold">${(p.dynamic||[]).length}</span>
        </div>
        <div class="px-5 py-2">
          ${(p.dynamic||[]).length ? (p.dynamic||[]).map(f => `<div class="fact-row"><span class="fact-dot bg-cyan-400"></span><span class="text-gray-300">${esc(f)}</span></div>`).join('')
            : '<p class="py-4 text-xs text-gray-600 text-center">No dynamic context yet</p>'}
        </div>
      </div>`;
  } catch (e) { el.innerHTML = `<div class="empty text-red-400">${esc(e.message)}</div>`; }
}

// ── Search ────────────────────────────────────────
async function doSearch() {
  const q = document.getElementById('search-q').value.trim();
  if (!q) return;
  const el = document.getElementById('search-out');
  el.innerHTML = '<div class="p-8 text-center"><span class="spinner"></span></div>';
  try {
    const ct = document.getElementById('f-search-container').value;
    const mode = document.getElementById('f-search-mode').value;
    const ep = mode === 'documents' ? '/search/documents' : '/search/memories';
    const body = { q, limit: 20, searchMode: mode };
    if (ct) body.containerTag = ct;
    const data = await api('POST', ep, body);
    const items = data.results || [];
    if (!items.length) { el.innerHTML = '<div class="empty">No results</div>'; return; }
    el.innerHTML = items.map(r => `
      <div class="mem-row">
        <div class="flex items-center gap-2 mb-1.5">
          ${r.type ? `<span class="badge badge-${r.type}">${r.type}</span>` : ''}
          ${r.container_tag ? `<span class="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded">${esc(r.container_tag)}</span>` : ''}
          <span class="ml-auto sim-score ${r.similarity > 0.6 ? 'text-emerald-400' : r.similarity > 0.3 ? 'text-amber-400' : 'text-gray-500'}">${Math.round((r.similarity||0)*100)}%</span>
        </div>
        <p class="text-[13px] text-gray-300 leading-relaxed">${esc(r.memory || r.content_preview || '')}</p>
        <p class="text-[10px] text-gray-600 mt-1">${ago(r.created_at)}</p>
      </div>`).join('');
  } catch (e) { el.innerHTML = `<div class="empty text-red-400">${esc(e.message)}</div>`; }
}

// ── Modals ─────────────────────────────────────────
function modalAddMemory() {
  document.getElementById('modal-title').textContent = 'Add Memory';
  document.getElementById('modal-body').innerHTML = `
    <div class="space-y-3">
      <div><label class="lbl">Content</label><textarea id="m-content" rows="4" class="inp w-full" placeholder="A fact, preference, or episode…"></textarea></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="lbl">Container</label><input id="m-tag" class="inp w-full" placeholder="user_123"></div>
        <div><label class="lbl">Type</label><select id="m-type" class="sel w-full"><option value="fact">Fact</option><option value="preference">Preference</option><option value="episode">Episode</option></select></div>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button onclick="closeModal()" class="btn-ghost">Cancel</button>
        <button onclick="submitMem()" class="btn-primary">Add Memory</button>
      </div>
    </div>`;
  document.getElementById('modal-bg').classList.remove('hidden');
}

async function submitMem() {
  const c = document.getElementById('m-content').value.trim(); if (!c) return;
  try {
    await api('POST', '/memories', { content: c, containerTag: document.getElementById('m-tag').value.trim() || undefined, type: document.getElementById('m-type').value });
    closeModal(); toast('Memory added'); loadMemories(); loadContainers();
  } catch (e) { toast(e.message, 'error'); }
}

function modalAddDoc() {
  document.getElementById('modal-title').textContent = 'Add Document';
  document.getElementById('modal-body').innerHTML = `
    <div class="space-y-3">
      <div><label class="lbl">Content</label><textarea id="d-content" rows="5" class="inp w-full" placeholder="Paste text, a conversation, URL…"></textarea></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="lbl">Container</label><input id="d-tag" class="inp w-full" placeholder="user_123"></div>
        <div><label class="lbl">Entity context (optional)</label><input id="d-ctx" class="inp w-full" placeholder="About John, a dev"></div>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button onclick="closeModal()" class="btn-ghost">Cancel</button>
        <button onclick="submitDoc()" class="btn-primary">Add Document</button>
      </div>
    </div>`;
  document.getElementById('modal-bg').classList.remove('hidden');
}

async function submitDoc() {
  const c = document.getElementById('d-content').value.trim(); if (!c) return;
  try {
    await api('POST', '/documents', { content: c, containerTag: document.getElementById('d-tag').value.trim() || undefined, entityContext: document.getElementById('d-ctx').value.trim() || undefined });
    closeModal(); toast('Document queued for processing'); loadDocs(); loadContainers();
  } catch (e) { toast(e.message, 'error'); }
}

function closeModal(e) { if (e && e.target !== e.currentTarget) return; document.getElementById('modal-bg').classList.add('hidden'); }

// ── Drawers ───────────────────────────────────────
async function openMemDrawer(id) {
  const dw = document.getElementById('drawer'), body = document.getElementById('drawer-body');
  document.getElementById('drawer-title').textContent = 'Memory';
  dw.classList.remove('hidden'); body.innerHTML = '<div class="p-8 text-center"><span class="spinner"></span></div>';
  try {
    const all = await api('GET', '/memories?limit=200');
    const m = (all.memories || []).find(x => x.id === id);
    if (!m) { body.innerHTML = '<div class="empty">Not found</div>'; return; }
    body.innerHTML = `
      <div class="space-y-5">
        <div><p class="text-sm text-gray-300 leading-relaxed">${esc(m.memory)}</p></div>
        <div class="flex flex-wrap gap-2">
          <span class="badge badge-${m.type}">${m.type}</span>
          ${m.isLatest ? '<span class="badge badge-done">latest</span>' : '<span class="badge bg-gray-800 text-gray-500">superseded</span>'}
          ${m.containerTag ? `<span class="text-[11px] text-gray-500 bg-white/[0.04] px-2 py-0.5 rounded">${esc(m.containerTag)}</span>` : ''}
        </div>
        <div><label class="lbl">Created</label><p class="text-xs text-gray-400">${m.createdAt ? new Date(m.createdAt).toLocaleString() : '—'}</p></div>
        ${m.metadata && Object.keys(m.metadata).length ? `<div><label class="lbl">Metadata</label><pre class="text-xs text-gray-500 bg-white/[0.02] p-2 rounded overflow-auto">${esc(JSON.stringify(m.metadata, null, 2))}</pre></div>` : ''}
        <div class="pt-2"><button class="btn-danger" onclick="forgetMem('${m.id}');closeDrawer()">Forget this memory</button></div>
      </div>`;
  } catch (e) { body.innerHTML = `<div class="empty text-red-400">${esc(e.message)}</div>`; }
}

async function openDocDrawer(id) {
  const dw = document.getElementById('drawer'), body = document.getElementById('drawer-body');
  document.getElementById('drawer-title').textContent = 'Document';
  dw.classList.remove('hidden'); body.innerHTML = '<div class="p-8 text-center"><span class="spinner"></span></div>';
  try {
    const d = await api('GET', `/documents/${id}`);
    body.innerHTML = `
      <div class="space-y-5">
        <div class="flex gap-2"><span class="badge badge-${d.status}">${d.status}</span>${d.containerTag ? `<span class="text-[11px] text-gray-500 bg-white/[0.04] px-2 py-0.5 rounded">${esc(d.containerTag)}</span>` : ''}</div>
        <div><label class="lbl">Content</label><p class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">${esc(d.content)}</p></div>
        <div><label class="lbl">Created</label><p class="text-xs text-gray-400">${d.createdAt ? new Date(d.createdAt).toLocaleString() : '—'}</p></div>
        ${d.metadata && Object.keys(d.metadata).length ? `<div><label class="lbl">Metadata</label><pre class="text-xs text-gray-500 bg-white/[0.02] p-2 rounded overflow-auto">${esc(JSON.stringify(d.metadata, null, 2))}</pre></div>` : ''}
        <div class="pt-2"><button class="btn-danger" onclick="delDoc('${d.id}');closeDrawer()">Delete document</button></div>
      </div>`;
  } catch (e) { body.innerHTML = `<div class="empty text-red-400">${esc(e.message)}</div>`; }
}

function closeDrawer() { document.getElementById('drawer').classList.add('hidden'); }

// ── Settings ──────────────────────────────────────
async function changePw() {
  const cur = document.getElementById('pw-cur').value, nw = document.getElementById('pw-new').value, cf = document.getElementById('pw-cfm').value;
  if (!cur || !nw) return toast('Fill all fields', 'error');
  if (nw !== cf) return toast('Passwords don\'t match', 'error');
  try {
    const r = await fetch('/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ current_password: cur, new_password: nw }) });
    if (r.ok) { toast('Password updated'); document.getElementById('pw-cur').value = ''; document.getElementById('pw-new').value = ''; document.getElementById('pw-cfm').value = ''; }
    else { const d = await r.json(); toast(d.detail || 'Failed', 'error'); }
  } catch (e) { toast(e.message, 'error'); }
}

// ── Utilities ─────────────────────────────────────
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function trunc(s, n) { return !s ? '' : s.length > n ? s.slice(0, n) + '…' : s; }
function ago(d) {
  if (!d) return ''; const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s/60)}m`; if (s < 86400) return `${Math.floor(s/3600)}h`;
  if (s < 604800) return `${Math.floor(s/86400)}d`; return new Date(d).toLocaleDateString();
}
function toast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div'); el.className = `toast-item ${type}`; el.textContent = msg;
  c.appendChild(el); setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3000);
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeDrawer(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); nav('search'); document.getElementById('search-q').focus(); }
});
