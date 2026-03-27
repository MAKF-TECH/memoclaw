import { useState, useEffect, useRef, useCallback } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { GraphChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { api } from '../lib/api'
import { PageHeader, Empty, Spinner, Select } from '../components/UI'

echarts.use([GraphChart, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

const COLORS = { fact: '#8b5cf6', preference: '#f59e0b', episode: '#38bdf8' }
const EDGE_COLORS = { updates: '#ef4444', extends: '#22c55e', derives: '#f97316' }

// Layout modes
const LAYOUTS = ['circular', 'force']

function buildCircularPositions(count) {
  const positions = []
  const cx = 0, cy = 0
  // Use multiple rings for large graphs
  if (count <= 1) return [{ x: 0, y: 0 }]
  const rings = count <= 20 ? 1 : count <= 60 ? 2 : 3
  let placed = 0
  const ringCounts = []
  if (rings === 1) {
    ringCounts.push(count)
  } else if (rings === 2) {
    ringCounts.push(Math.ceil(count * 0.35), count - Math.ceil(count * 0.35))
  } else {
    ringCounts.push(
      Math.ceil(count * 0.2),
      Math.ceil(count * 0.35),
      count - Math.ceil(count * 0.2) - Math.ceil(count * 0.35)
    )
  }
  const radii = rings === 1 ? [320] : rings === 2 ? [180, 340] : [120, 250, 380]
  ringCounts.forEach((n, ri) => {
    const r = radii[ri]
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2
      positions.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
    }
  })
  return positions
}

export default function GraphView() {
  const [mems, setMems] = useState([])
  const [loading, setLoading] = useState(true)
  const [container, setContainer] = useState('')
  const [containers, setContainers] = useState([])
  const [layout, setLayout] = useState('circular')
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

  // ─── Build edges ────────────────────────────────────────────────────────────
  // Use same-container adjacency heuristic + relationship type cycling
  const buildEdges = useCallback((mems) => {
    const links = []
    const byContainer = {}
    mems.forEach((m, i) => {
      if (m.containerTag) (byContainer[m.containerTag] = byContainer[m.containerTag] || []).push(i)
    })
    Object.values(byContainer).forEach(indices => {
      for (let i = 0; i < indices.length - 1 && i < 50; i++) {
        const type = ['extends', 'updates', 'derives'][i % 3]
        links.push({
          source: mems[indices[i]].id,
          target: mems[indices[i + 1]].id,
          relType: type,
          lineStyle: {
            color: EDGE_COLORS[type],
            width: 1.2,
            opacity: 0.45,
            curveness: 0.2,
          },
        })
      }
    })
    return links
  }, [])

  // ─── Compute degree per node ─────────────────────────────────────────────
  const links = buildEdges(mems)
  const degreeMap = {}
  mems.forEach(m => { degreeMap[m.id] = 0 })
  links.forEach(l => {
    degreeMap[l.source] = (degreeMap[l.source] || 0) + 1
    degreeMap[l.target] = (degreeMap[l.target] || 0) + 1
  })
  const maxDegree = Math.max(1, ...Object.values(degreeMap))

  // ─── Sort by degree desc so ring layout puts hubs first ─────────────────
  const sortedMems = [...mems].sort((a, b) => (degreeMap[b.id] || 0) - (degreeMap[a.id] || 0))

  // ─── Positions for circular layout ──────────────────────────────────────
  const positions = layout === 'circular' ? buildCircularPositions(sortedMems.length) : []

  // ─── Build nodes ─────────────────────────────────────────────────────────
  const minSize = 10, maxSize = 52
  const nodes = sortedMems.map((m, i) => {
    const deg = degreeMap[m.id] || 0
    const norm = maxDegree > 0 ? deg / maxDegree : 0
    const size = minSize + norm * (maxSize - minSize)
    // Show label if high degree or small graph
    const showLabel = mems.length < 25 || deg >= Math.max(2, maxDegree * 0.35)
    const pos = layout === 'circular' && positions[i] ? positions[i] : {}

    return {
      id: m.id,
      name: m.memory.length > 55 ? m.memory.slice(0, 52) + '…' : m.memory,
      fullText: m.memory,
      symbolSize: size,
      x: pos.x,
      y: pos.y,
      fixed: layout === 'circular',
      category: m.type === 'fact' ? 0 : m.type === 'preference' ? 1 : 2,
      value: deg,
      itemStyle: {
        color: COLORS[m.type] || COLORS.fact,
        borderColor: m.isStatic ? '#ffffff' : 'rgba(255,255,255,0.15)',
        borderWidth: m.isStatic ? 2.5 : 0.5,
        shadowBlur: deg >= maxDegree * 0.5 ? 18 : (deg > 1 ? 8 : 0),
        shadowColor: (COLORS[m.type] || COLORS.fact) + '66',
      },
      label: {
        show: showLabel,
        position: 'right',
        fontSize: deg >= maxDegree * 0.5 ? 11 : 9,
        fontWeight: deg >= maxDegree * 0.5 ? 600 : 400,
        color: deg >= maxDegree * 0.5 ? '#e5e7eb' : '#9ca3af',
        distance: 4,
        formatter: ({ data }) => {
          const txt = data.fullText || data.name
          return txt.length > 40 ? txt.slice(0, 37) + '…' : txt
        },
      },
      emphasis: {
        label: { show: true, fontSize: 12, color: '#f9fafb', fontWeight: 600 },
        itemStyle: {
          shadowBlur: 30,
          shadowColor: (COLORS[m.type] || COLORS.fact) + '99',
          borderWidth: 3,
          borderColor: '#fff',
        },
      },
    }
  })

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#13131d',
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#e5e7eb', fontSize: 12 },
      formatter: (params) => {
        if (params.dataType === 'node') {
          const m = mems.find(x => x.id === params.data.id)
          if (!m) return ''
          const deg = degreeMap[m.id] || 0
          return `
            <div style="max-width:300px;font-family:inherit">
              <div style="font-weight:600;margin-bottom:6px;color:#f9fafb;line-height:1.4">${m.memory}</div>
              <div style="font-size:11px;color:#6b7280;display:flex;gap:8px;flex-wrap:wrap">
                <span style="background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px">${m.type}</span>
                ${m.isStatic ? '<span style="background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px">static</span>' : ''}
                <span style="background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px">${m.containerTag || 'untagged'}</span>
                <span style="background:rgba(139,92,246,0.2);padding:1px 6px;border-radius:4px;color:#a78bfa">${deg} connections</span>
              </div>
            </div>`
        }
        if (params.dataType === 'edge') {
          return `<span style="font-size:11px;color:#9ca3af">${params.data.relType || 'related'}</span>`
        }
        return ''
      }
    },
    legend: {
      data: ['Fact', 'Preference', 'Episode'],
      bottom: 12, left: 'center',
      textStyle: { color: '#6b7280', fontSize: 11 },
      itemWidth: 10, itemHeight: 10,
      icon: 'circle',
    },
    animationDuration: layout === 'circular' ? 600 : 1200,
    animationEasingUpdate: 'quinticInOut',
    series: [{
      type: 'graph',
      layout: layout === 'circular' ? 'none' : 'force',
      roam: true,
      draggable: layout !== 'circular',
      scaleLimit: { min: 0.3, max: 3 },

      // Force layout settings (used when layout=force)
      force: {
        repulsion: mems.length > 50 ? 220 : 400,
        gravity: 0.1,
        edgeLength: mems.length > 50 ? 90 : 160,
        friction: 0.55,
        layoutAnimation: true,
      },

      categories: [
        { name: 'Fact', itemStyle: { color: COLORS.fact } },
        { name: 'Preference', itemStyle: { color: COLORS.preference } },
        { name: 'Episode', itemStyle: { color: COLORS.episode } },
      ],

      data: nodes,
      links: links.map(l => ({ ...l, source: l.source, target: l.target })),

      // Edge label showing relation type on hover
      edgeLabel: { show: false },

      emphasis: {
        focus: 'adjacency',
        blurScope: 'coordinateSystem',
        lineStyle: { width: 2.5, opacity: 0.9 },
      },

      blur: {
        itemStyle: { opacity: 0.15 },
        lineStyle: { opacity: 0.06 },
        label: { show: false },
      },

      lineStyle: { curveness: 0.25, opacity: 0.45 },
    }]
  }

  return (
    <div className="p-8 animate-in fade-in duration-300">
      <PageHeader title="Memory Graph" subtitle="Knowledge topology — node size = connection degree">
        {/* Layout toggle */}
        <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-1 border border-white/[0.06]">
          {LAYOUTS.map(l => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${
                layout === l
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {l === 'circular' ? '⬤ Circular' : '⠿ Force'}
            </button>
          ))}
        </div>

        <Select value={container} onChange={e => setContainer(e.target.value)}>
          <option value="">All containers</option>
          {containers.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          {Object.entries(COLORS).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="rounded-full" style={{ width: 8, height: 8, background: c }} />
              <span className="capitalize">{k}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="rounded-full border-2 border-white" style={{ width: 8, height: 8, background: 'transparent' }} />
            Static
          </span>
        </div>
      </PageHeader>

      {/* Edge type legend */}
      <div className="flex items-center gap-4 mb-3 text-[11px] text-gray-600">
        <span className="font-medium text-gray-500">Edges:</span>
        {Object.entries(EDGE_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className="h-[2px] w-5 rounded" style={{ background: color }} />
            <span className="capitalize">{type}</span>
          </span>
        ))}
        <span className="ml-auto text-gray-600">
          {mems.length} memories · {links.length} edges
        </span>
      </div>

      <div
        className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden"
        style={{ height: 'calc(100vh - 210px)' }}
      >
        {loading
          ? <div className="flex items-center justify-center h-full"><Spinner /></div>
          : mems.length === 0
            ? <div className="flex items-center justify-center h-full"><Empty>No memories to visualize</Empty></div>
            : (
              <ReactEChartsCore
                ref={chartRef}
                echarts={echarts}
                option={option}
                style={{ height: '100%', width: '100%' }}
                theme="dark"
                opts={{ renderer: 'canvas' }}
                notMerge={false}
                lazyUpdate={false}
              />
            )
        }
      </div>
    </div>
  )
}
