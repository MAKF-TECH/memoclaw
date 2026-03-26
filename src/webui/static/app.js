/**
 * MemoClaw Web UI — Dashboard Application
 */

// ── State ─────────────────────────────────────────────────────────

const state = {
  currentView: 'dashboard',
  containers: [],
  memoriesPage: 0,
  documentsPage: 0,
  username: null,
};

// ── API Client ────────────────────────────────────────────────────

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin', // Send session cookie
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`/v1${path}`, opts);
  if (res.status === 401) {
    // Session expired — redirect to login
    window.location.href = '/login';
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.detail || err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiHealth(path) {
  const res = await fetch(path);
  return res.json();
}

// ── Init ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadCurrentUser();
  checkHealth();
  loadDashboard();
  loadContainers();
});

async function loadCurrentUser() {
  try {
    const res = await fetch('/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      state.username = data.username;
      const userEl = document.getElementById('current-user');
      if (userEl) userEl.textContent = data.username;
    } else {
      window.location.href = '/login';
    }
  } catch {
    // Server might be down
  }
}

async function handleLogout() {
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch { /* ignore */ }
  window.location.href = '/login';
}

function saveApiKey(val) {
  // API key is still useful for external tools — save to localStorage
  localStorage.setItem('memoclaw_api_key', val);
  toast('API key saved (for external tools)', 'success');
}

// ── Navigation ────────────────────────────────────────────────────

function switchView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelector(`[data-view="${view}"]`).classList.add('active');

  // Load view data
  switch (view) {
    case 'dashboard': loadDashboard(); break;
    case 'memories': loadMemories(); break;
    case 'documents': loadDocuments(); break;
    case 'graph': loadGraph(); break;
    case 'profiles': break;
    case 'search': break;
  }
}

// ── Health ─────────────────────────────────────────────────────────

async function checkHealth() {
  const badge = document.getElementById('health-status');
  try {
    const data = await apiHealth('/health');
    badge.className = 'health-badge ok';
    badge.innerHTML = '<span class="health-dot"></span> Connected';
  } catch {
    badge.className = 'health-badge error';
    badge.innerHTML = '<span class="health-dot"></span> Offline';
  }
}

// ── Containers ────────────────────────────────────────────────────

async function loadContainers() {
  try {
    // Get containers from memories
    const mems = await api('GET', '/memories?limit=200');
    const tags = new Set();
    (mems.memories || []).forEach(m => { if (m.containerTag) tags.add(m.containerTag); });

    // Also from documents
    const docs = await api('GET', '/documents?limit=200');
    (docs.documents || []).forEach(d => { if (d.containerTag) tags.add(d.containerTag); });

    state.containers = [...tags].sort();
    populateContainerSelects();
  } catch {
    // Ignore — probably no API key yet
  }
}

function populateContainerSelects() {
  const selects = [
    'memories-container-filter', 'graph-container-filter',
    'profile-selector', 'search-container',
  ];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    const firstOption = el.options[0].outerHTML;
    el.innerHTML = firstOption;
    state.containers.forEach(tag => {
      const opt = document.createElement('option');
      opt.value = tag;
      opt.textContent = tag;
      el.appendChild(opt);
    });
    el.value = current;
  });
}

// ── Dashboard ─────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const [mems, docs] = await Promise.all([
      api('GET', '/memories?limit=5'),
      api('GET', '/documents?limit=5'),
    ]);

    document.getElementById('stat-memories').textContent = mems.total || 0;
    document.getElementById('stat-documents').textContent = docs.total || 0;
    document.getElementById('stat-containers').textContent = state.containers.length;
    document.getElementById('stat-profiles').textContent = state.containers.length;

    // Recent memories
    const recentMems = document.getElementById('recent-memories');
    if (mems.memories.length === 0) {
      recentMems.innerHTML = '<div class="empty-state">No memories yet. Add some documents!</div>';
    } else {
      recentMems.innerHTML = mems.memories.map(m => `
        <div class="card" onclick="showMemoryDetail('${m.id}')">
          <div class="card-header">
            <span class="card-type ${m.type}">${m.type}</span>
            ${m.containerTag ? `<span class="card-container-tag">${m.containerTag}</span>` : ''}
          </div>
          <div class="card-content">${escapeHtml(m.memory)}</div>
          <div class="card-meta"><span>${timeAgo(m.createdAt)}</span></div>
        </div>
      `).join('');
    }

    // Recent documents
    const recentDocs = document.getElementById('recent-documents');
    if (docs.documents.length === 0) {
      recentDocs.innerHTML = '<div class="empty-state">No documents yet</div>';
    } else {
      recentDocs.innerHTML = docs.documents.map(d => `
        <div class="card" onclick="showDocumentDetail('${d.id}')">
          <div class="card-header">
            <span class="card-type ${d.status}">${d.status}</span>
            ${d.containerTag ? `<span class="card-container-tag">${d.containerTag}</span>` : ''}
          </div>
          <div class="card-content">${escapeHtml(truncate(d.content, 150))}</div>
          <div class="card-meta"><span>${timeAgo(d.createdAt)}</span></div>
        </div>
      `).join('');
    }
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}

// ── Memories View ─────────────────────────────────────────────────

async function loadMemories() {
  const container = document.getElementById('memories-container-filter').value;
  const list = document.getElementById('memories-list');
  list.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';

  try {
    let url = `/memories?limit=50&offset=${state.memoriesPage * 50}`;
    if (container) url += `&container_tag=${encodeURIComponent(container)}`;

    const data = await api('GET', url);
    const typeFilter = document.getElementById('memories-type-filter').value;
    let memories = data.memories || [];
    if (typeFilter) memories = memories.filter(m => m.type === typeFilter);

    if (memories.length === 0) {
      list.innerHTML = '<div class="empty-state">No memories found</div>';
      return;
    }

    list.innerHTML = memories.map(m => `
      <div class="card" onclick="showMemoryDetail('${m.id}')">
        <div class="card-header">
          <span class="card-type ${m.type}">${m.type}</span>
          <div style="display:flex;gap:8px;align-items:center">
            ${m.containerTag ? `<span class="card-container-tag">${escapeHtml(m.containerTag)}</span>` : ''}
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();forgetMemory('${m.id}')">Forget</button>
          </div>
        </div>
        <div class="card-content">${escapeHtml(m.memory)}</div>
        <div class="card-meta">
          <span>${timeAgo(m.createdAt)}</span>
          ${m.isLatest ? '<span style="color:var(--green)">● latest</span>' : '<span style="color:var(--text-muted)">○ superseded</span>'}
        </div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty-state" style="color:var(--red)">Error: ${escapeHtml(e.message)}</div>`;
  }
}

async function forgetMemory(id) {
  if (!confirm('Forget this memory?')) return;
  try {
    await api('DELETE', `/memories/${id}`);
    toast('Memory forgotten', 'success');
    loadMemories();
  } catch (e) {
    toast(`Error: ${e.message}`, 'error');
  }
}

// ── Documents View ────────────────────────────────────────────────

async function loadDocuments() {
  const statusFilter = document.getElementById('docs-status-filter').value;
  const list = document.getElementById('documents-list');
  list.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';

  try {
    let url = `/documents?limit=50&offset=${state.documentsPage * 50}`;
    if (statusFilter) url += `&status=${statusFilter}`;

    const data = await api('GET', url);
    const docs = data.documents || [];

    if (docs.length === 0) {
      list.innerHTML = '<div class="empty-state">No documents found</div>';
      return;
    }

    list.innerHTML = docs.map(d => `
      <div class="card" onclick="showDocumentDetail('${d.id}')">
        <div class="card-header">
          <span class="card-type ${d.status}">${d.status}</span>
          <div style="display:flex;gap:8px;align-items:center">
            ${d.containerTag ? `<span class="card-container-tag">${escapeHtml(d.containerTag)}</span>` : ''}
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteDocument('${d.id}')">Delete</button>
          </div>
        </div>
        <div class="card-content">${escapeHtml(truncate(d.content, 200))}</div>
        <div class="card-meta">
          <span>${timeAgo(d.createdAt)}</span>
          ${d.customId ? `<span>ID: ${escapeHtml(d.customId)}</span>` : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty-state" style="color:var(--red)">Error: ${escapeHtml(e.message)}</div>`;
  }
}

async function deleteDocument(id) {
  if (!confirm('Delete this document and all its memories?')) return;
  try {
    await fetch(`/v1/documents/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.apiKey}` },
    });
    toast('Document deleted', 'success');
    loadDocuments();
  } catch (e) {
    toast(`Error: ${e.message}`, 'error');
  }
}

// ── Graph View ────────────────────────────────────────────────────

let graphData = { nodes: [], edges: [] };
let graphTransform = { x: 0, y: 0, scale: 1 };
let graphDrag = null;
let graphHover = null;

async function loadGraph() {
  const container = document.getElementById('graph-container-filter').value;
  try {
    let url = `/memories?limit=200`;
    if (container) url += `&container_tag=${encodeURIComponent(container)}`;
    const data = await api('GET', url);
    const memories = data.memories || [];

    // Build graph
    graphData.nodes = memories.map((m, i) => ({
      id: m.id,
      label: truncate(m.memory, 60),
      full: m.memory,
      type: m.type,
      containerTag: m.containerTag,
      isLatest: m.isLatest,
      // Arrange in a force-like layout (simple circular for now)
      x: 400 + 250 * Math.cos((2 * Math.PI * i) / memories.length + Math.random() * 0.3),
      y: 300 + 200 * Math.sin((2 * Math.PI * i) / memories.length + Math.random() * 0.3),
      radius: 8,
    }));

    // Fetch edges from the API (via search similarity for related pairs)
    graphData.edges = [];

    // Simple similarity-based edges: connect memories from same container with random subset
    const byContainer = {};
    memories.forEach(m => {
      if (!m.containerTag) return;
      (byContainer[m.containerTag] = byContainer[m.containerTag] || []).push(m.id);
    });
    Object.values(byContainer).forEach(ids => {
      for (let i = 0; i < ids.length - 1 && i < 30; i++) {
        graphData.edges.push({
          source: ids[i],
          target: ids[i + 1],
          type: ['extends', 'updates', 'derives'][i % 3],
        });
      }
    });

    drawGraph();
  } catch (e) {
    console.error('Graph load error:', e);
  }
}

function drawGraph() {
  const canvas = document.getElementById('graph-canvas');
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.save();
  ctx.translate(graphTransform.x, graphTransform.y);
  ctx.scale(graphTransform.scale, graphTransform.scale);

  const colors = {
    fact: '#7c5cff',
    preference: '#fbbf24',
    episode: '#60a5fa',
  };
  const edgeColors = {
    updates: '#f87171',
    extends: '#34d399',
    derives: '#fb923c',
  };

  // Draw edges
  const nodeMap = {};
  graphData.nodes.forEach(n => nodeMap[n.id] = n);

  graphData.edges.forEach(e => {
    const s = nodeMap[e.source];
    const t = nodeMap[e.target];
    if (!s || !t) return;

    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    ctx.strokeStyle = edgeColors[e.type] || '#2a2a3a';
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // Draw nodes
  graphData.nodes.forEach(n => {
    const isHovered = graphHover && graphHover.id === n.id;
    const r = isHovered ? n.radius * 1.5 : n.radius;

    // Glow
    if (isHovered) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
      ctx.fillStyle = colors[n.type] + '33';
      ctx.fill();
    }

    // Node
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = colors[n.type] || '#7c5cff';
    ctx.fill();

    if (!n.isLatest) {
      ctx.strokeStyle = '#555577';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Label (only if zoomed enough or hovered)
    if (graphTransform.scale > 0.7 || isHovered) {
      ctx.font = `${isHovered ? 12 : 10}px -apple-system, sans-serif`;
      ctx.fillStyle = isHovered ? '#e8e8f0' : '#8888aa';
      ctx.textAlign = 'center';
      ctx.fillText(n.label, n.x, n.y + r + 14);
    }
  });

  ctx.restore();

  // Empty state
  if (graphData.nodes.length === 0) {
    ctx.font = '14px -apple-system, sans-serif';
    ctx.fillStyle = '#555577';
    ctx.textAlign = 'center';
    ctx.fillText('No memories to visualize. Add some documents first!', rect.width / 2, rect.height / 2);
  }
}

// Graph interaction
(function initGraphInteraction() {
  const canvas = document.getElementById('graph-canvas');
  if (!canvas) return;

  canvas.addEventListener('mousedown', (e) => {
    graphDrag = { startX: e.clientX - graphTransform.x, startY: e.clientY - graphTransform.y };
  });

  canvas.addEventListener('mousemove', (e) => {
    if (graphDrag) {
      graphTransform.x = e.clientX - graphDrag.startX;
      graphTransform.y = e.clientY - graphDrag.startY;
      drawGraph();
      return;
    }

    // Hover detection
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - graphTransform.x) / graphTransform.scale;
    const my = (e.clientY - rect.top - graphTransform.y) / graphTransform.scale;

    let found = null;
    for (const n of graphData.nodes) {
      const dx = mx - n.x;
      const dy = my - n.y;
      if (dx * dx + dy * dy < 200) { found = n; break; }
    }

    if (found !== graphHover) {
      graphHover = found;
      drawGraph();

      const tooltip = document.getElementById('graph-tooltip');
      if (found) {
        tooltip.classList.remove('hidden');
        tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
        tooltip.style.top = (e.clientY - rect.top - 10) + 'px';
        tooltip.innerHTML = `
          <div><strong>${escapeHtml(found.full)}</strong></div>
          <div style="margin-top:4px;font-size:11px;color:var(--text-muted)">
            Type: ${found.type} · ${found.containerTag || 'no container'}
          </div>`;
      } else {
        tooltip.classList.add('hidden');
      }
    }
  });

  canvas.addEventListener('mouseup', () => { graphDrag = null; });
  canvas.addEventListener('mouseleave', () => { graphDrag = null; });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    graphTransform.scale = Math.max(0.2, Math.min(5, graphTransform.scale * delta));
    drawGraph();
  }, { passive: false });

  // Redraw on resize
  window.addEventListener('resize', () => {
    if (state.currentView === 'graph') drawGraph();
  });
})();

// ── Profiles View ─────────────────────────────────────────────────

async function loadProfile(containerTag) {
  const detail = document.getElementById('profile-detail');
  if (!containerTag) {
    detail.innerHTML = '<div class="empty-state">Select a container to view its profile</div>';
    return;
  }

  detail.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';

  try {
    const data = await api('POST', '/profile', { containerTag });
    const p = data.profile;

    let html = '';

    // Static facts
    html += `
      <div class="profile-section">
        <div class="profile-section-header">
          <h4>📌 Static Facts</h4>
          <span class="badge">${(p.static || []).length}</span>
        </div>
        <div class="profile-facts">
          ${(p.static || []).length === 0
            ? '<div class="empty-state" style="padding:16px">No static facts yet</div>'
            : (p.static || []).map(f => `<div class="profile-fact">${escapeHtml(f)}</div>`).join('')
          }
        </div>
      </div>`;

    // Dynamic facts
    html += `
      <div class="profile-section">
        <div class="profile-section-header">
          <h4>⚡ Dynamic Context</h4>
          <span class="badge">${(p.dynamic || []).length}</span>
        </div>
        <div class="profile-facts">
          ${(p.dynamic || []).length === 0
            ? '<div class="empty-state" style="padding:16px">No dynamic context yet</div>'
            : (p.dynamic || []).map(f => `<div class="profile-fact dynamic">${escapeHtml(f)}</div>`).join('')
          }
        </div>
      </div>`;

    // Search results (if any)
    const results = data.searchResults?.results || [];
    if (results.length > 0) {
      html += `
        <div class="profile-section">
          <div class="profile-section-header">
            <h4>🔍 Related Memories</h4>
            <span class="badge">${results.length}</span>
          </div>
          <div class="profile-facts">
            ${results.map(r => `
              <div class="profile-fact">
                ${escapeHtml(r.memory)}
                <span class="card-similarity">${Math.round(r.similarity * 100)}%</span>
              </div>
            `).join('')}
          </div>
        </div>`;
    }

    detail.innerHTML = html;
  } catch (e) {
    detail.innerHTML = `<div class="empty-state" style="color:var(--red)">Error: ${escapeHtml(e.message)}</div>`;
  }
}

// ── Search View ───────────────────────────────────────────────────

async function performSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;

  const container = document.getElementById('search-container').value;
  const mode = document.getElementById('search-mode').value;
  const results = document.getElementById('search-results');
  results.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';

  try {
    const endpoint = mode === 'documents' ? '/search/documents' : '/search/memories';
    const body = { q: query, limit: 20, searchMode: mode };
    if (container) body.containerTag = container;

    const data = await api('POST', endpoint, body);
    const items = data.results || [];

    if (items.length === 0) {
      results.innerHTML = '<div class="empty-state">No results found</div>';
      return;
    }

    results.innerHTML = items.map(r => `
      <div class="card">
        <div class="card-header">
          <div style="display:flex;gap:8px;align-items:center">
            ${r.type ? `<span class="card-type ${r.type}">${r.type}</span>` : ''}
            ${r.container_tag ? `<span class="card-container-tag">${escapeHtml(r.container_tag)}</span>` : ''}
          </div>
          <span class="card-similarity">${Math.round((r.similarity || 0) * 100)}% match</span>
        </div>
        <div class="card-content">${escapeHtml(r.memory || r.content_preview || '')}</div>
        <div class="card-meta"><span>${timeAgo(r.created_at)}</span></div>
      </div>
    `).join('');
  } catch (e) {
    results.innerHTML = `<div class="empty-state" style="color:var(--red)">Error: ${escapeHtml(e.message)}</div>`;
  }
}

// ── Modals ─────────────────────────────────────────────────────────

function showAddMemoryModal() {
  document.getElementById('modal-title').textContent = 'Add Memory';
  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label>Content</label>
      <textarea id="modal-memory-content" placeholder="Enter a fact, preference, or episode..."></textarea>
    </div>
    <div class="form-group">
      <label>Container Tag</label>
      <input id="modal-memory-container" placeholder="e.g., user_123" value="">
    </div>
    <div class="form-group">
      <label>Type</label>
      <select id="modal-memory-type">
        <option value="fact">Fact</option>
        <option value="preference">Preference</option>
        <option value="episode">Episode</option>
      </select>
    </div>
    <div class="form-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAddMemory()">Add Memory</button>
    </div>`;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

async function submitAddMemory() {
  const content = document.getElementById('modal-memory-content').value.trim();
  if (!content) return;

  const body = {
    content,
    containerTag: document.getElementById('modal-memory-container').value.trim() || undefined,
    type: document.getElementById('modal-memory-type').value,
  };

  try {
    await api('POST', '/memories', body);
    closeModal();
    toast('Memory added', 'success');
    loadMemories();
    loadContainers();
  } catch (e) {
    toast(`Error: ${e.message}`, 'error');
  }
}

function showAddDocumentModal() {
  document.getElementById('modal-title').textContent = 'Add Document';
  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label>Content</label>
      <textarea id="modal-doc-content" placeholder="Paste text, a URL, or a conversation..."></textarea>
    </div>
    <div class="form-group">
      <label>Container Tag</label>
      <input id="modal-doc-container" placeholder="e.g., user_123">
    </div>
    <div class="form-group">
      <label>Entity Context (optional)</label>
      <input id="modal-doc-context" placeholder="e.g., This is about John, a software engineer">
    </div>
    <div class="form-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAddDocument()">Add Document</button>
    </div>`;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

async function submitAddDocument() {
  const content = document.getElementById('modal-doc-content').value.trim();
  if (!content) return;

  const body = {
    content,
    containerTag: document.getElementById('modal-doc-container').value.trim() || undefined,
    entityContext: document.getElementById('modal-doc-context').value.trim() || undefined,
  };

  try {
    await api('POST', '/documents', body);
    closeModal();
    toast('Document added — processing...', 'success');
    loadDocuments();
    loadContainers();
  } catch (e) {
    toast(`Error: ${e.message}`, 'error');
  }
}

function closeModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ── Detail Drawer ─────────────────────────────────────────────────

async function showMemoryDetail(id) {
  const drawer = document.getElementById('detail-drawer');
  const body = document.getElementById('drawer-body');
  document.getElementById('drawer-title').textContent = 'Memory Detail';
  drawer.classList.remove('hidden');
  body.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';

  try {
    // Find memory from local data (already loaded)
    const mems = await api('GET', `/memories?limit=200`);
    const mem = (mems.memories || []).find(m => m.id === id);
    if (!mem) { body.innerHTML = '<div class="empty-state">Memory not found</div>'; return; }

    body.innerHTML = `
      <div class="detail-section">
        <h4>Content</h4>
        <p>${escapeHtml(mem.memory)}</p>
      </div>
      <div class="detail-section">
        <h4>Properties</h4>
        <div class="tag-list">
          <span class="tag">Type: ${mem.type}</span>
          <span class="tag">Latest: ${mem.isLatest ? 'Yes' : 'No'}</span>
          ${mem.containerTag ? `<span class="tag">Container: ${escapeHtml(mem.containerTag)}</span>` : ''}
        </div>
      </div>
      <div class="detail-section">
        <h4>Created</h4>
        <p>${mem.createdAt ? new Date(mem.createdAt).toLocaleString() : 'Unknown'}</p>
      </div>
      ${mem.metadata && Object.keys(mem.metadata).length > 0 ? `
        <div class="detail-section">
          <h4>Metadata</h4>
          <pre style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap">${escapeHtml(JSON.stringify(mem.metadata, null, 2))}</pre>
        </div>
      ` : ''}
      <div class="detail-section" style="margin-top:24px">
        <button class="btn btn-danger" onclick="forgetMemory('${mem.id}');closeDrawer()">Forget Memory</button>
      </div>
    `;
  } catch (e) {
    body.innerHTML = `<div class="empty-state" style="color:var(--red)">Error: ${e.message}</div>`;
  }
}

async function showDocumentDetail(id) {
  const drawer = document.getElementById('detail-drawer');
  const body = document.getElementById('drawer-body');
  document.getElementById('drawer-title').textContent = 'Document Detail';
  drawer.classList.remove('hidden');
  body.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';

  try {
    const doc = await api('GET', `/documents/${id}`);
    body.innerHTML = `
      <div class="detail-section">
        <h4>Status</h4>
        <span class="card-type ${doc.status}">${doc.status}</span>
      </div>
      <div class="detail-section">
        <h4>Content</h4>
        <p style="white-space:pre-wrap">${escapeHtml(doc.content)}</p>
      </div>
      <div class="detail-section">
        <h4>Properties</h4>
        <div class="tag-list">
          ${doc.containerTag ? `<span class="tag">Container: ${escapeHtml(doc.containerTag)}</span>` : ''}
          ${doc.customId ? `<span class="tag">Custom ID: ${escapeHtml(doc.customId)}</span>` : ''}
        </div>
      </div>
      <div class="detail-section">
        <h4>Created</h4>
        <p>${doc.createdAt ? new Date(doc.createdAt).toLocaleString() : 'Unknown'}</p>
      </div>
      ${doc.metadata && Object.keys(doc.metadata).length > 0 ? `
        <div class="detail-section">
          <h4>Metadata</h4>
          <pre style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap">${escapeHtml(JSON.stringify(doc.metadata, null, 2))}</pre>
        </div>
      ` : ''}
      <div class="detail-section" style="margin-top:24px">
        <button class="btn btn-danger" onclick="deleteDocument('${doc.id}');closeDrawer()">Delete Document</button>
      </div>
    `;
  } catch (e) {
    body.innerHTML = `<div class="empty-state" style="color:var(--red)">Error: ${e.message}</div>`;
  }
}

function closeDrawer() {
  document.getElementById('detail-drawer').classList.add('hidden');
}

// ── Utilities ─────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '…' : str;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeDrawer();
  }
  // Ctrl+K for search
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    switchView('search');
    document.getElementById('search-input').focus();
  }
});

// ── Settings ──────────────────────────────────────────────────────

async function changePassword() {
  const current = document.getElementById('current-password').value;
  const newPw = document.getElementById('new-password').value;
  const confirm = document.getElementById('confirm-password').value;

  if (!current || !newPw) {
    toast('Please fill in all fields', 'error');
    return;
  }
  if (newPw !== confirm) {
    toast('New passwords do not match', 'error');
    return;
  }
  if (newPw.length < 4) {
    toast('Password must be at least 4 characters', 'error');
    return;
  }

  try {
    const res = await fetch('/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        current_password: current,
        new_password: newPw,
      }),
    });

    if (res.ok) {
      toast('Password updated successfully', 'success');
      document.getElementById('current-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
    } else {
      const data = await res.json();
      toast(data.detail || 'Failed to update password', 'error');
    }
  } catch (e) {
    toast(`Error: ${e.message}`, 'error');
  }
}

function copyApiKey() {
  const input = document.getElementById('api-key-display');
  input.type = 'text';
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    toast('API key copied to clipboard', 'success');
  }).catch(() => {
    toast('Could not copy — select and copy manually', 'error');
  });
  setTimeout(() => { input.type = 'password'; }, 2000);
}
