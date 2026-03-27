import { useState, useEffect } from 'react'
import { api, ago, trunc } from '../lib/api'
import { Card, StatCard, Badge, PageHeader, Empty, Spinner } from '../components/UI'

export default function Dashboard() {
  const [stats, setStats] = useState({})
  const [mems, setMems] = useState([])
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [m, d] = await Promise.all([api('GET', '/v1/memories?limit=8'), api('GET', '/v1/documents?limit=8')])
      setMems(m?.memories || [])
      setDocs(d?.documents || [])
      setStats({ mem: m?.total || 0, doc: d?.total || 0 })
    } catch {} finally { setLoading(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>

  return (
    <div className="p-8 animate-in fade-in duration-300">
      <PageHeader title="Dashboard" subtitle="Memory engine overview" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard value={stats.mem} label="Memories" color="text-violet-400" />
        <StatCard value={stats.doc} label="Documents" color="text-emerald-400" />
        <StatCard value={new Set([...mems, ...docs].map(x => x.containerTag).filter(Boolean)).size} label="Containers" color="text-amber-400" />
        <StatCard value="—" label="Profiles" color="text-cyan-400" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Memories */}
        <Card hover={false} className="!p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Memories</h3>
          </div>
          <div className="divide-y divide-white/[0.04] max-h-[420px] overflow-y-auto">
            {mems.length === 0 ? <Empty>No memories yet</Empty> : mems.map(m => (
              <div key={m.id} className="px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <Badge type={m.type} />
                  {m.isStatic && <Badge type="static">static</Badge>}
                  {m.containerTag && <span className="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded">{m.containerTag}</span>}
                  <span className="ml-auto text-[10px] text-gray-600">{ago(m.createdAt)}</span>
                </div>
                <p className="text-[13px] text-gray-300 leading-relaxed line-clamp-2">{m.memory}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Documents */}
        <Card hover={false} className="!p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Documents</h3>
          </div>
          <div className="divide-y divide-white/[0.04] max-h-[420px] overflow-y-auto">
            {docs.length === 0 ? <Empty>No documents yet</Empty> : docs.map(d => (
              <div key={d.id} className="px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <Badge type={d.status} />
                  {d.containerTag && <span className="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded">{d.containerTag}</span>}
                  <span className="ml-auto text-[10px] text-gray-600">{ago(d.createdAt)}</span>
                </div>
                <p className="text-[13px] text-gray-300 leading-relaxed line-clamp-2">{trunc(d.content, 150)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
