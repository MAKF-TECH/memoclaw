import { useState, useEffect, useRef } from 'react'
import { api, ago } from '../lib/api'
import { Badge, PageHeader, Empty, Spinner, Button, Modal, Input, Textarea, Select, Drawer, toast } from '../components/UI'

// ─── Type icon map ────────────────────────────────────────────────────────────
const TYPE_ICON = {
  fact: '🔵',
  preference: '🟡',
  episode: '🟣',
}
const TYPE_COLOR = {
  fact: 'border-violet-500/20 hover:border-violet-500/40',
  preference: 'border-amber-500/20 hover:border-amber-500/40',
  episode: 'border-sky-500/20 hover:border-sky-500/40',
}
const TYPE_BG = {
  fact: 'bg-violet-500/[0.04]',
  preference: 'bg-amber-500/[0.04]',
  episode: 'bg-sky-500/[0.04]',
}

function MemoryCard({ m, onForget, onClick }) {
  const color = TYPE_COLOR[m.type] || 'border-white/[0.08] hover:border-white/[0.14]'
  const bg = TYPE_BG[m.type] || ''
  return (
    <div
      onClick={() => onClick(m)}
      className={`group relative flex flex-col gap-2.5 p-4 rounded-xl border ${color} ${bg}
        bg-white/[0.02] cursor-pointer transition-all duration-150 hover:bg-white/[0.04]
        hover:-translate-y-[1px] hover:shadow-lg hover:shadow-black/20`}
    >
      {/* Header row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge type={m.type} />
        {m.isStatic && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-violet-400/70 bg-violet-500/10 px-1.5 py-0.5 rounded-md font-semibold">
            ◆ static
          </span>
        )}
        {m.isLatest
          ? <span className="text-[10px] text-emerald-500/80 font-medium">● latest</span>
          : <span className="text-[10px] text-gray-600">v{m.version}</span>
        }
      </div>

      {/* Content */}
      <p className="text-[13px] text-gray-200 leading-relaxed line-clamp-4 flex-1">
        {m.memory}
      </p>

      {/* Footer */}
      <div className="flex items-center gap-2 mt-auto pt-1 border-t border-white/[0.04]">
        {m.containerTag && (
          <span className="text-[10px] text-gray-500 bg-white/[0.04] px-1.5 py-0.5 rounded font-mono truncate max-w-[120px]">
            {m.containerTag}
          </span>
        )}
        <span className="ml-auto text-[10px] text-gray-600">{ago(m.createdAt)}</span>
        <button
          onClick={e => { e.stopPropagation(); onForget(m.id) }}
          className="text-[10px] text-red-400/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer ml-1"
        >
          forget
        </button>
      </div>
    </div>
  )
}

export default function Memories() {
  const [mems, setMems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [containers, setContainers] = useState([])
  const searchRef = useRef(null)

  useEffect(() => { load() }, [filter, typeFilter])

  // Ctrl+F focuses search
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  async function load() {
    setLoading(true)
    try {
      let url = '/v1/memories?limit=200'
      if (filter) url += `&container_tag=${encodeURIComponent(filter)}`
      const d = await api('GET', url)
      let list = d?.memories || []
      if (typeFilter) list = list.filter(m => m.type === typeFilter)
      setMems(list)
      const tags = new Set(list.map(m => m.containerTag).filter(Boolean))
      setContainers([...tags].sort())
    } catch {} finally { setLoading(false) }
  }

  async function forget(id) {
    if (!confirm('Forget this memory?')) return
    try { await api('DELETE', `/v1/memories/${id}`); toast('Memory forgotten'); load() }
    catch (e) { toast(e.message, 'error') }
  }

  async function addMemory(e) {
    e.preventDefault()
    const fd = new FormData(e.target)
    try {
      await api('POST', '/v1/memories', {
        content: fd.get('content'),
        containerTag: fd.get('tag') || undefined,
        type: fd.get('type'),
        isStatic: fd.get('static') === 'on',
      })
      setAddOpen(false); toast('Memory created'); load()
    } catch (e) { toast(e.message, 'error') }
  }

  // client-side search filter
  const visible = search.trim()
    ? mems.filter(m => m.memory?.toLowerCase().includes(search.toLowerCase()) || m.containerTag?.toLowerCase().includes(search.toLowerCase()))
    : mems

  // group by type for section headers
  const facts = visible.filter(m => m.type === 'fact')
  const prefs = visible.filter(m => m.type === 'preference')
  const episodes = visible.filter(m => m.type === 'episode')
  const other = visible.filter(m => !['fact','preference','episode'].includes(m.type))

  const sections = typeFilter
    ? [{ label: null, items: visible }]
    : [
        { label: 'Facts', icon: '🔵', items: facts },
        { label: 'Preferences', icon: '🟡', items: prefs },
        { label: 'Episodes', icon: '🟣', items: episodes },
        ...(other.length ? [{ label: 'Other', icon: '⚪', items: other }] : []),
      ].filter(s => s.items.length > 0)

  return (
    <div className="p-8 animate-in fade-in duration-300 max-w-[1400px] mx-auto">
      <PageHeader title="Memories" subtitle={`${mems.length} knowledge units`}>
        {/* Inline search */}
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter… (⌘F)"
            className="bg-white/[0.03] border border-white/[0.08] rounded-lg pl-8 pr-3 py-2 text-xs text-gray-300 placeholder:text-gray-600 outline-none focus:border-violet-500/50 w-44 transition-all focus:w-56"
          />
        </div>
        <Select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All containers</option>
          {containers.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="fact">Facts</option>
          <option value="preference">Preferences</option>
          <option value="episode">Episodes</option>
        </Select>
        <Button onClick={() => setAddOpen(true)}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Memory
        </Button>
      </PageHeader>

      {loading
        ? <div className="flex justify-center py-24"><Spinner /></div>
        : visible.length === 0
          ? <Empty>No memories found{search ? ` for "${search}"` : ''}</Empty>
          : (
            <div className="space-y-10">
              {sections.map(section => (
                <div key={section.label || 'all'}>
                  {section.label && (
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-sm">{section.icon}</span>
                      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{section.label}</h2>
                      <span className="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded-full">{section.items.length}</span>
                      <div className="flex-1 h-px bg-white/[0.05] ml-1" />
                    </div>
                  )}
                  {/* ── GRID ── */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {section.items.map(m => (
                      <MemoryCard key={m.id} m={m} onForget={forget} onClick={setDetail} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
      }

      {/* ── Add Modal ── */}
      <Modal title="Add Memory" open={addOpen} onClose={() => setAddOpen(false)}>
        <form onSubmit={addMemory} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Content</label>
            <Textarea name="content" placeholder="A fact, preference, or episode…" required className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Container tag</label>
              <Input name="tag" placeholder="user_makf / agent_atlas" className="w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
              <Select name="type" className="w-full">
                <option value="fact">Fact</option>
                <option value="preference">Preference</option>
                <option value="episode">Episode</option>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" name="static" className="accent-violet-500" />
            Mark as static (permanent identity trait)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit">Add Memory</Button>
          </div>
        </form>
      </Modal>

      {/* ── Detail Drawer ── */}
      <Drawer title="Memory Detail" open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div className="space-y-5">
            <p className="text-sm text-gray-200 leading-relaxed">{detail.memory}</p>
            <div className="flex flex-wrap gap-2">
              <Badge type={detail.type} />
              {detail.isStatic && <Badge type="static">static</Badge>}
              {detail.isLatest && <Badge type="latest">latest</Badge>}
              {detail.containerTag && (
                <span className="text-[11px] text-gray-500 bg-white/[0.04] px-2 py-0.5 rounded font-mono">{detail.containerTag}</span>
              )}
            </div>
            <div className="text-xs text-gray-600 space-y-1">
              <div>Version <span className="text-gray-400">{detail.version}</span></div>
              <div>Created <span className="text-gray-400">{detail.createdAt ? new Date(detail.createdAt).toLocaleString() : '—'}</span></div>
              {detail.id && <div className="font-mono text-[10px] text-gray-700 truncate">{detail.id}</div>}
            </div>
            <Button variant="danger" onClick={() => { forget(detail.id); setDetail(null) }}>
              Forget this memory
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  )
}
