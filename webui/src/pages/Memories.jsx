import { useState, useEffect } from 'react'
import { api, ago } from '../lib/api'
import { Card, Badge, PageHeader, Empty, Spinner, Button, Modal, Input, Textarea, Select, Drawer, toast } from '../components/UI'

export default function Memories() {
  const [mems, setMems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [containers, setContainers] = useState([])

  useEffect(() => { load() }, [filter, typeFilter])

  async function load() {
    setLoading(true)
    try {
      let url = '/v1/memories?limit=100'
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
    try { await api('DELETE', `/v1/memories/${id}`); toast('Memory forgotten'); load() } catch (e) { toast(e.message, 'error') }
  }

  async function addMemory(e) {
    e.preventDefault()
    const fd = new FormData(e.target)
    try {
      await api('POST', '/v1/memories', {
        content: fd.get('content'), containerTag: fd.get('tag') || undefined,
        type: fd.get('type'), isStatic: fd.get('static') === 'on',
      })
      setAddOpen(false); toast('Memory created'); load()
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div className="p-8 animate-in fade-in duration-300">
      <PageHeader title="Memories" subtitle="Extracted knowledge units">
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
        <Button onClick={() => setAddOpen(true)}>+ Add Memory</Button>
      </PageHeader>

      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
        : mems.length === 0 ? <Empty>No memories found</Empty>
        : <div className="space-y-2">
            {mems.map(m => (
              <Card key={m.id} onClick={() => setDetail(m)} className="p-4 group cursor-pointer hover:border-violet-500/20 hover:bg-violet-500/[0.02]">
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge type={m.type} />
                  {m.isStatic && <Badge type="static">static</Badge>}
                  {m.containerTag && <span className="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded">{m.containerTag}</span>}
                  {m.isLatest ? <span className="text-[10px] text-emerald-500">● latest</span> : <span className="text-[10px] text-gray-600">○ v{m.version}</span>}
                  <span className="ml-auto text-[10px] text-gray-600">{ago(m.createdAt)}</span>
                  <button onClick={e => { e.stopPropagation(); forget(m.id) }}
                    className="text-[10px] text-red-400/60 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">forget</button>
                </div>
                <p className="text-[13px] text-gray-300 leading-relaxed">{m.memory}</p>
              </Card>
            ))}
          </div>}

      {/* Add Modal */}
      <Modal title="Add Memory" open={addOpen} onClose={() => setAddOpen(false)}>
        <form onSubmit={addMemory} className="space-y-3">
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Content</label>
            <Textarea name="content" placeholder="A fact, preference, or episode…" required className="w-full" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Container</label>
              <Input name="tag" placeholder="user_123" className="w-full" /></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
              <Select name="type" className="w-full"><option value="fact">Fact</option><option value="preference">Preference</option><option value="episode">Episode</option></Select></div>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" name="static" className="accent-violet-500" /> Mark as static (permanent identity trait)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit">Add Memory</Button>
          </div>
        </form>
      </Modal>

      {/* Detail Drawer */}
      <Drawer title="Memory Detail" open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div className="space-y-5">
            <p className="text-sm text-gray-300 leading-relaxed">{detail.memory}</p>
            <div className="flex flex-wrap gap-2">
              <Badge type={detail.type} />{detail.isStatic && <Badge type="static">static</Badge>}
              {detail.isLatest && <Badge type="latest">latest</Badge>}
              {detail.containerTag && <span className="text-[11px] text-gray-500 bg-white/[0.04] px-2 py-0.5 rounded">{detail.containerTag}</span>}
            </div>
            <div><span className="text-xs text-gray-500">Version {detail.version} · Created {detail.createdAt ? new Date(detail.createdAt).toLocaleString() : '—'}</span></div>
            <Button variant="danger" onClick={() => { forget(detail.id); setDetail(null) }}>Forget this memory</Button>
          </div>
        )}
      </Drawer>
    </div>
  )
}
