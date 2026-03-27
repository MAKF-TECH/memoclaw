import { useState, useEffect } from 'react'
import { api, ago, trunc } from '../lib/api'
import { Card, Badge, PageHeader, Empty, Spinner, Button, Modal, Textarea, Input, Drawer, toast } from '../components/UI'

export default function Documents() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [detail, setDetail] = useState(null)

  useEffect(() => { load() }, [statusFilter])

  async function load() {
    setLoading(true)
    try {
      let url = '/v1/documents?limit=100'
      if (statusFilter) url += `&status=${statusFilter}`
      const d = await api('GET', url)
      setDocs(d?.documents || [])
    } catch {} finally { setLoading(false) }
  }

  async function del(id) {
    if (!confirm('Delete document and its memories?')) return
    try { await api('DELETE', `/v1/documents/${id}`); toast('Deleted'); load() } catch (e) { toast(e.message, 'error') }
  }

  async function addDoc(e) {
    e.preventDefault()
    const fd = new FormData(e.target)
    try {
      await api('POST', '/v1/documents', {
        content: fd.get('content'), containerTag: fd.get('tag') || undefined,
        entityContext: fd.get('ctx') || undefined,
      })
      setAddOpen(false); toast('Document queued'); load()
    } catch (e) { toast(e.message, 'error') }
  }

  async function openDetail(id) {
    try { const d = await api('GET', `/v1/documents/${id}`); setDetail(d) } catch {}
  }

  return (
    <div className="p-8 animate-in fade-in duration-300">
      <PageHeader title="Documents" subtitle="Ingested content">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-[#0d0d16] border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-gray-300 outline-none">
          <option value="">All statuses</option><option value="done">Done</option><option value="queued">Queued</option><option value="error">Error</option>
        </select>
        <Button onClick={() => setAddOpen(true)}>+ Add Document</Button>
      </PageHeader>

      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
        : docs.length === 0 ? <Empty>No documents found</Empty>
        : <div className="space-y-2">{docs.map(d => (
            <Card key={d.id} onClick={() => openDetail(d.id)} className="p-4 group cursor-pointer hover:border-violet-500/20 hover:bg-violet-500/[0.02]">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge type={d.status} />
                {d.containerTag && <span className="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded">{d.containerTag}</span>}
                <span className="ml-auto text-[10px] text-gray-600">{ago(d.createdAt)}</span>
                <button onClick={e => { e.stopPropagation(); del(d.id) }}
                  className="text-[10px] text-red-400/60 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">delete</button>
              </div>
              <p className="text-[13px] text-gray-300 leading-relaxed line-clamp-3">{trunc(d.content, 250)}</p>
            </Card>
          ))}</div>}

      <Modal title="Add Document" open={addOpen} onClose={() => setAddOpen(false)}>
        <form onSubmit={addDoc} className="space-y-3">
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Content</label>
            <Textarea name="content" rows={5} placeholder="Paste text, a conversation, URL…" required className="w-full" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Container</label><Input name="tag" placeholder="user_123" className="w-full" /></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Entity context</label><Input name="ctx" placeholder="About John, a dev" className="w-full" /></div>
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
            <div className="flex gap-2"><Badge type={detail.status} />{detail.containerTag && <span className="text-[11px] text-gray-500 bg-white/[0.04] px-2 py-0.5 rounded">{detail.containerTag}</span>}</div>
            <div><span className="text-xs text-gray-500 block mb-1">Content</span><p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{detail.content}</p></div>
            <div><span className="text-xs text-gray-500">Created {detail.createdAt ? new Date(detail.createdAt).toLocaleString() : '—'}</span></div>
            <Button variant="danger" onClick={() => { del(detail.id); setDetail(null) }}>Delete document</Button>
          </div>
        )}
      </Drawer>
    </div>
  )
}
