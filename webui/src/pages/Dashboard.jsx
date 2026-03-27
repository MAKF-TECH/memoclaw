import { useState, useEffect } from 'react'
import { api, ago, trunc } from '../lib/api'
import { Badge, Spinner } from '../components/UI'

function GlowStat({ value, label, color, glow }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 flex flex-col gap-1`}>
      {/* glow blob */}
      <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-20 ${glow}`} />
      <div className={`text-3xl font-extrabold tracking-tight tabular-nums ${color}`}>{value ?? '—'}</div>
      <div className="text-xs text-gray-500 font-medium">{label}</div>
    </div>
  )
}

function MiniMemCard({ m }) {
  const typeColors = {
    fact: 'border-l-violet-500',
    preference: 'border-l-amber-400',
    episode: 'border-l-sky-400',
  }
  return (
    <div className={`px-4 py-3 border-l-2 ${typeColors[m.type] || 'border-l-gray-600'} bg-white/[0.01] hover:bg-white/[0.03] transition-colors`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Badge type={m.type} />
        {m.isStatic && <span className="text-[10px] text-violet-400/60 font-semibold">◆ static</span>}
        {m.containerTag && (
          <span className="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded font-mono truncate max-w-[100px]">{m.containerTag}</span>
        )}
        <span className="ml-auto text-[10px] text-gray-600 shrink-0">{ago(m.createdAt)}</span>
      </div>
      <p className="text-[13px] text-gray-300 leading-relaxed line-clamp-2">{m.memory}</p>
    </div>
  )
}

function MiniDocCard({ d }) {
  return (
    <div className="px-4 py-3 bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center gap-1.5 mb-1">
        <Badge type={d.status} />
        {d.containerTag && (
          <span className="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded font-mono truncate max-w-[100px]">{d.containerTag}</span>
        )}
        <span className="ml-auto text-[10px] text-gray-600 shrink-0">{ago(d.createdAt)}</span>
      </div>
      <p className="text-[13px] text-gray-300 leading-relaxed line-clamp-2">{trunc(d.content, 160)}</p>
    </div>
  )
}

function Panel({ title, children, count }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden flex flex-col">
      <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</h3>
        {count != null && (
          <span className="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded-full">{count}</span>
        )}
      </div>
      <div className="divide-y divide-white/[0.04] max-h-[380px] overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [mems, setMems] = useState([])
  const [docs, setDocs] = useState([])
  const [totals, setTotals] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [m, d] = await Promise.all([
        api('GET', '/v1/memories?limit=10'),
        api('GET', '/v1/documents?limit=10'),
      ])
      setMems(m?.memories || [])
      setDocs(d?.documents || [])
      setTotals({ mem: m?.total || 0, doc: d?.total || 0 })
    } catch {} finally { setLoading(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Spinner /></div>
  )

  const containers = new Set([...mems, ...docs].map(x => x.containerTag).filter(Boolean))
  const facts = mems.filter(m => m.type === 'fact').length
  const prefs = mems.filter(m => m.type === 'preference').length

  return (
    <div className="p-8 animate-in fade-in duration-300 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Memory Engine</h1>
        <p className="text-sm text-gray-500 mt-0.5">Agent knowledge overview</p>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <GlowStat value={totals.mem} label="Total Memories" color="text-violet-400" glow="bg-violet-500" />
        <GlowStat value={totals.doc} label="Documents" color="text-emerald-400" glow="bg-emerald-500" />
        <GlowStat value={containers.size} label="Containers" color="text-amber-400" glow="bg-amber-500" />
        <GlowStat value={prefs} label="Preferences" color="text-cyan-400" glow="bg-cyan-500" />
      </div>

      {/* Type breakdown mini bar */}
      {totals.mem > 0 && (
        <div className="mb-8 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Memory Breakdown</span>
            <span className="text-[11px] text-gray-600">{totals.mem} total</span>
          </div>
          <div className="flex rounded-lg overflow-hidden h-2 gap-px">
            {facts > 0 && (
              <div className="bg-violet-500/70 transition-all" style={{ width: `${(facts / totals.mem) * 100}%` }} title={`${facts} facts`} />
            )}
            {prefs > 0 && (
              <div className="bg-amber-400/70 transition-all" style={{ width: `${(prefs / totals.mem) * 100}%` }} title={`${prefs} preferences`} />
            )}
            {(totals.mem - facts - prefs) > 0 && (
              <div className="bg-sky-400/70 transition-all" style={{ width: `${((totals.mem - facts - prefs) / totals.mem) * 100}%` }} title="episodes" />
            )}
          </div>
          <div className="flex gap-4 mt-3">
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className="w-2 h-2 rounded-sm bg-violet-500/70 inline-block" />{facts} facts</span>
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className="w-2 h-2 rounded-sm bg-amber-400/70 inline-block" />{prefs} preferences</span>
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className="w-2 h-2 rounded-sm bg-sky-400/70 inline-block" />{totals.mem - facts - prefs} episodes</span>
          </div>
        </div>
      )}

      {/* Recent panels */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel title="Recent Memories" count={mems.length}>
          {mems.length === 0
            ? <div className="text-center py-10 text-sm text-gray-600">No memories yet</div>
            : mems.map(m => <MiniMemCard key={m.id} m={m} />)
          }
        </Panel>
        <Panel title="Recent Documents" count={docs.length}>
          {docs.length === 0
            ? <div className="text-center py-10 text-sm text-gray-600">No documents yet</div>
            : docs.map(d => <MiniDocCard key={d.id} d={d} />)
          }
        </Panel>
      </div>
    </div>
  )
}
