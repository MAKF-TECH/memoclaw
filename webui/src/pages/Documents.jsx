import { useState, useEffect, useRef } from 'react'
import { api, ago, trunc } from '../lib/api'
import { Badge, PageHeader, Empty, Spinner, Button, Modal, Textarea, Input, Drawer, toast } from '../components/UI'

const STATUS_COLOR = {
  done: 'border-emerald-500/20 hover:border-emerald-500/40',
  queued: 'border-amber-500/20 hover:border-amber-500/40',
  error: 'border-red-500/20 hover:border-red-500/40',
  extracting: 'border-cyan-500/20 hover:border-cyan-500/40',
  embedding: 'border-cyan-500/20 hover:border-cyan-500/40',
}
const STATUS_BG = {
  done: 'bg-emerald-500/[0.03]',
  queued: 'bg-amber-500/[0.03]',
  error: 'bg-red-500/[0.03]',
  extracting: 'bg-cyan-500/[0.03]',
  embedding: 'bg-cyan-500/[0.03]',
}

function DocCard({ d, onDelete, onClick }) {
  const color = STATUS_COLOR[d.status] || 'border-white/[0.08] hover:border-white/[0.14]'
  const bg = STATUS_BG[d.status] || ''
  return (
    <div
      onClick={() => onClick(d.id)}
      className={`group relative flex flex-col gap-2.5 p-4 rounded-xl border ${color} ${bg}
        bg-white/[0.02] cursor-pointer transition-all duration-150 hover:bg-white/[0.04]
        hover:-translate-y-[1px] hover:shadow-lg hover:shadow-black/20`}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge type={d.status} />
        {d.containerTag && (
          <span className="text-[10px] text-gray-500 bg-white/[0.04] px-1.5 py-0.5 rounded font-mono truncate max-w-[140px]">
            {d.containerTag}
          </span>
        )}
        <span className="ml-auto text-[10px] text-gray-600">{ago(d.createdAt)}</span>
      </div>

      <p className="text-[13px] text-gray-200 leading-relaxed line-clamp-4 flex-1">
        {trunc(d.content, 280)}
      </p>

      <div className="flex items-center gap-2 mt-auto pt-1 border-t border-white/[0.04]">
        {d.entityContext && (
          <span className="text-[10px] text-gray-600 italic truncate max-w-[160px]">{d.entityContext}</span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onDelete(d.id) }}
          className="ml-auto text-[10px] text-red-400/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
        >
          delete
        </button>
      </div>
    </div>
  )
}

export default function Documents() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const searchRef = useRef(null)

  useEffect(() => { load() }, [statusFilter])

  async function load() {
    setLoading(true)
    try {
      let url = '/v1/documents?limit=200'
      if (statusFilter) url += `&status=${statusFilter}`
      const d = await api('GET', url)
      setDocs(d?.documents || [])
    } catch {} finally { setLoading(false) }
  }

  async function del(id) {
    if (!confirm('Delete document and its memories?')) return
    try { await api('DELETE', `/v1/documents/${id}`); toast('Deleted'); load() }
    catch (e) { toast(e.message, 'error') }
  }

  async function addDoc(e) {
    e.preventDefault()
    const fd = new FormData(e.target)
    try {
      await api('POST', '/v1/documents', {
        content: fd.get('content'),
        containerTag: fd.get('tag') || undefined,
        entityContext: fd.get('ctx') || undefined,
      })
      setAddOpen(false); toast('Document queued for ingestion'); load()
    } catch (e) { toast(e.message, 'error') }
  }

  async function openDetail(id) {
    try { const d = await api('GET', `/v1/documents/${id}`); setDetail(d) } catch {}
  }

  const visible = search.trim()
    ? docs.filter(d => d.content?.toLowerCase().includes(search.toLowerCase()) || d.containerTag?.toLowerCase().includes(search.toLowerCase()))
    : docs

  return (
    <div className="p-8 animate-in fade-in duration-300 max-w-[1400px] mx-auto">
      <PageHeader title="Documents" subtitle={`${docs.length} ingested`}>
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter…"
            className="bg-white/[0.03] border border-white/[0.08] rounded-lg pl-8 pr-3 py-2 text-xs text-gray-300 placeholder:text-gray-600 outline-none focus:border-violet-500/50 w-44 transition-all focus:w-56"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-[#0d0d16] border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-gray-300 outline-none focus:border-violet-500/50 transition-colors">
          <option value="">All statuses</option>
          <option value="done">Done</option>
          <option value="queued">Queued</option>
          <option value="error">Error</option>
        </select>
        <Button onClick={() => setAddOpen(true)}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Document
        </Button>
      </PageHeader>

      {loading
        ? <div className="flex justify-center py-24"><Spinner /></div>
        : visible.length === 0
          ? <Empty>No documents found{search ? ` for "${search}"` : ''}</Empty>
          : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {visible.map(d => (
                <DocCard key={d.id} d={d} onDelete={del} onClick={openDetail} />
              ))}
            </div>
          )
      }

      <Modal title="Add Document" open={addOpen} onClose={() => setAddOpen(false)}>
        <form onSubmit={addDoc} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Content</label>
            <Textarea name="content" rows={5} placeholder="Paste text, a conversation, notes…" required className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Container tag</label>
              <Input name="tag" placeholder="user_makf / agent_atlas" className="w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Entity context</label>
              <Input name="ctx" placeholder="About John, a dev" className="w-full" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit">Add Document</Button>
          </div>
        </form>
      </Modal>

      <Drawer title="Document" open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div className="space-y-5">
            <div className="flex gap-2 flex-wrap">
              <Badge type={detail.status} />
              {detail.containerTag && (
                <span className="text-[11px] text-gray-500 bg-white/[0.04] px-2 py-0.5 rounded font-mono">{detail.containerTag}</span>
              )}
            </div>
            <div>
              <span className="text-xs text-gray-500 block mb-1">Content</span>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{detail.content}</p>
            </div>
            <div className="text-xs text-gray-600 space-y-1">
              <div>Created <span className="text-gray-400">{detail.createdAt ? new Date(detail.createdAt).toLocaleString() : '—'}</span></div>
              {detail.id && <div className="font-mono text-[10px] text-gray-700 truncate">{detail.id}</div>}
            </div>
            <Button variant="danger" onClick={() => { del(detail.id); setDetail(null) }}>Delete document</Button>
          </div>
        )}
      </Drawer>
    </div>
  )
}
