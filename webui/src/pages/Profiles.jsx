import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Card, PageHeader, Empty, Spinner, Select } from '../components/UI'

export default function Profiles() {
  const [containers, setContainers] = useState([])
  const [selected, setSelected] = useState('')
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api('GET', '/v1/memories?limit=200').then(d => {
      const tags = new Set((d?.memories || []).map(m => m.containerTag).filter(Boolean))
      setContainers([...tags].sort())
    }).catch(() => {})
  }, [])

  useEffect(() => { if (selected) loadProfile() }, [selected])

  async function loadProfile() {
    setLoading(true)
    try {
      const d = await api('POST', '/v1/profile', { containerTag: selected })
      setProfile(d?.profile)
    } catch {} finally { setLoading(false) }
  }

  return (
    <div className="p-8 animate-in fade-in duration-300">
      <PageHeader title="User Profiles" subtitle="Auto-built context per container">
        <Select value={selected} onChange={e => setSelected(e.target.value)}>
          <option value="">Select container…</option>
          {containers.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
      </PageHeader>

      <div className="max-w-2xl">
        {!selected ? <div className="text-sm text-gray-600">Select a container to view its profile</div>
          : loading ? <div className="flex justify-center py-16"><Spinner /></div>
          : !profile ? <Empty>No profile data</Empty>
          : <>
            <Card hover={false} className="!p-0 mb-4 overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Static Facts</h4>
                <span className="text-[10px] bg-violet-500/10 text-violet-400 px-1.5 rounded font-bold">{(profile.static||[]).length}</span>
              </div>
              <div className="px-5 py-2">
                {(profile.static||[]).length === 0 ? <p className="py-4 text-xs text-gray-600 text-center">No static facts yet</p>
                  : (profile.static||[]).map((f, i) => (
                    <div key={i} className="py-2.5 border-b border-white/[0.04] last:border-0 text-sm text-gray-300 leading-relaxed flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-2 flex-shrink-0" />{f}
                    </div>
                  ))}
              </div>
            </Card>

            <Card hover={false} className="!p-0 overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dynamic Context</h4>
                <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-1.5 rounded font-bold">{(profile.dynamic||[]).length}</span>
              </div>
              <div className="px-5 py-2">
                {(profile.dynamic||[]).length === 0 ? <p className="py-4 text-xs text-gray-600 text-center">No dynamic context yet</p>
                  : (profile.dynamic||[]).map((f, i) => (
                    <div key={i} className="py-2.5 border-b border-white/[0.04] last:border-0 text-sm text-gray-300 leading-relaxed flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />{f}
                    </div>
                  ))}
              </div>
            </Card>
          </>}
      </div>
    </div>
  )
}
