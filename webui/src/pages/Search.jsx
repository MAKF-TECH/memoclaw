import { useState } from 'react'
import { api, ago } from '../lib/api'
import { Card, Badge, PageHeader, Empty, Spinner, Button, Input, Select, SimScore } from '../components/UI'

export default function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('hybrid')
  const [container, setContainer] = useState('')
  const [timing, setTiming] = useState(null)

  async function search(e) {
    e?.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    try {
      const ep = mode === 'documents' ? '/v1/search/documents' : '/v1/search/memories'
      const body = { q: query, limit: 20, searchMode: mode }
      if (container) body.containerTag = container
      const d = await api('POST', ep, body)
      setResults(d?.results || [])
      setTiming(d?.timing)
    } catch {} finally { setLoading(false) }
  }

  return (
    <div className="p-8 animate-in fade-in duration-300">
      <PageHeader title="Search" subtitle="Semantic search across memories & documents" />

      <form onSubmit={search} className="flex gap-2 mb-6 flex-wrap">
        <Input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="What are you looking for?" className="flex-1 min-w-[240px] !text-[15px] !py-2.5" autoFocus />
        <Select value={container} onChange={e => setContainer(e.target.value)}>
          <option value="">All containers</option>
        </Select>
        <Select value={mode} onChange={e => setMode(e.target.value)}>
          <option value="hybrid">Hybrid</option><option value="memories">Memories</option><option value="documents">Documents</option>
        </Select>
        <Button type="submit">Search</Button>
      </form>

      {timing !== null && results && (
        <div className="text-xs text-gray-600 mb-3">{results.length} results in {timing}ms</div>
      )}

      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
        : results === null ? <div className="text-sm text-gray-600">Enter a query to search your memory</div>
        : results.length === 0 ? <Empty>No results found</Empty>
        : <div className="space-y-2">
            {results.map((r, i) => (
              <Card key={r.id || i} className="p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  {r.type && <Badge type={r.type} />}
                  {r.container_tag && <span className="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded">{r.container_tag}</span>}
                  {r.is_static && <Badge type="static">static</Badge>}
                  <span className="ml-auto"><SimScore value={r.similarity || 0} /></span>
                </div>
                <p className="text-[13px] text-gray-300 leading-relaxed">{r.memory || r.chunk || r.content_preview || ''}</p>
                {r.created_at && <p className="text-[10px] text-gray-600 mt-1">{ago(r.created_at)}</p>}
              </Card>
            ))}
          </div>}
    </div>
  )
}
