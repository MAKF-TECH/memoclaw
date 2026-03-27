import { useState, useEffect, useRef } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { GraphChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { api } from '../lib/api'
import { PageHeader, Empty, Spinner, Select } from '../components/UI'

echarts.use([GraphChart, TooltipComponent, LegendComponent, CanvasRenderer])

const COLORS = { fact: '#8b5cf6', preference: '#f59e0b', episode: '#38bdf8' }
const EDGE_COLORS = { updates: '#ef4444', extends: '#22c55e', derives: '#f97316' }

export default function GraphView() {
  const [mems, setMems] = useState([])
  const [loading, setLoading] = useState(true)
  const [container, setContainer] = useState('')
  const [containers, setContainers] = useState([])
  const chartRef = useRef(null)

  useEffect(() => { load() }, [container])

  async function load() {
    setLoading(true)
    try {
      let url = '/v1/memories?limit=300'
      if (container) url += `&container_tag=${encodeURIComponent(container)}`
      const d = await api('GET', url)
      const list = d?.memories || []
      setMems(list)
      const tags = new Set(list.map(m => m.containerTag).filter(Boolean))
      setContainers([...tags].sort())
    } catch {} finally { setLoading(false) }
  }

  // Build ECharts graph data
  const nodes = mems.map((m, i) => ({
    id: m.id,
    name: m.memory.length > 60 ? m.memory.slice(0, 57) + '…' : m.memory,
    fullText: m.memory,
    symbolSize: m.isStatic ? 28 : (m.isLatest ? 20 : 12),
    category: m.type === 'fact' ? 0 : m.type === 'preference' ? 1 : 2,
    itemStyle: {
      color: COLORS[m.type] || COLORS.fact,
      borderColor: m.isStatic ? '#fff' : 'transparent',
      borderWidth: m.isStatic ? 2 : 0,
      shadowBlur: m.isLatest ? 12 : 0,
      shadowColor: COLORS[m.type] + '44',
    },
    label: {
      show: mems.length < 30,
      position: 'bottom',
      fontSize: 9,
      color: '#6b7280',
      formatter: m.memory.length > 35 ? m.memory.slice(0, 32) + '…' : m.memory,
    },
    tooltip: {
      formatter: () => `<div style="max-width:280px">
        <div style="font-weight:600;margin-bottom:4px;color:#e5e7eb">${m.memory}</div>
        <div style="font-size:11px;color:#6b7280">${m.type}${m.isStatic ? ' · static' : ''} · ${m.containerTag || 'untagged'}</div>
      </div>`
    }
  }))

  // Build edges by container adjacency (simple heuristic — same container = connected)
  const links = []
  const byContainer = {}
  mems.forEach((m, i) => {
    if (m.containerTag) (byContainer[m.containerTag] = byContainer[m.containerTag] || []).push(i)
  })
  Object.values(byContainer).forEach(indices => {
    for (let i = 0; i < indices.length - 1 && i < 40; i++) {
      const type = ['extends', 'updates', 'derives'][i % 3]
      links.push({
        source: mems[indices[i]].id,
        target: mems[indices[i + 1]].id,
        lineStyle: { color: EDGE_COLORS[type], width: 1, opacity: 0.3, curveness: 0.15 },
      })
    }
  })

  const option = {
    backgroundColor: 'transparent',
    tooltip: { backgroundColor: '#13131d', borderColor: 'rgba(255,255,255,0.08)', textStyle: { color: '#e5e7eb', fontSize: 12 } },
    legend: {
      data: ['Fact', 'Preference', 'Episode'],
      bottom: 16, left: 'center',
      textStyle: { color: '#6b7280', fontSize: 11 },
      itemWidth: 12, itemHeight: 12,
    },
    animationDuration: 800,
    animationEasingUpdate: 'quinticInOut',
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      force: {
        repulsion: mems.length > 50 ? 200 : 350,
        gravity: 0.08,
        edgeLength: mems.length > 50 ? 80 : 140,
        friction: 0.6,
      },
      categories: [
        { name: 'Fact', itemStyle: { color: COLORS.fact } },
        { name: 'Preference', itemStyle: { color: COLORS.preference } },
        { name: 'Episode', itemStyle: { color: COLORS.episode } },
      ],
      data: nodes,
      links,
      emphasis: {
        focus: 'adjacency',
        blurScope: 'coordinateSystem',
        itemStyle: { shadowBlur: 20, shadowColor: 'rgba(139,92,246,0.4)' },
        lineStyle: { width: 3, opacity: 0.8 },
      },
      lineStyle: { curveness: 0.15 },
    }]
  }

  return (
    <div className="p-8 animate-in fade-in duration-300">
      <PageHeader title="Memory Graph" subtitle="Force-directed knowledge visualization">
        <Select value={container} onChange={e => setContainer(e.target.value)}>
          <option value="">All containers</option>
          {containers.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{background:COLORS.fact}} />Fact</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{background:COLORS.preference}} />Pref</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{background:COLORS.episode}} />Episode</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-white" style={{width:10,height:10}} />Static</span>
        </div>
      </PageHeader>

      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden" style={{height:'calc(100vh - 180px)'}}>
        {loading ? <div className="flex items-center justify-center h-full"><Spinner /></div>
          : mems.length === 0 ? <div className="flex items-center justify-center h-full"><Empty>No memories to visualize</Empty></div>
          : <ReactEChartsCore ref={chartRef} echarts={echarts} option={option} style={{height:'100%',width:'100%'}} theme="dark"
              opts={{renderer:'canvas'}} notMerge={true} />}
      </div>
    </div>
  )
}
