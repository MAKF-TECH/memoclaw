import { useState, useEffect, useRef } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { GraphChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { api } from '../lib/api'
import { PageHeader, Empty, Spinner, Select } from '../components/UI'

echarts.use([GraphChart, TooltipComponent, LegendComponent, CanvasRenderer])

const COLORS = {
  fact: '#7c3aed',
  preference: '#f59e0b',
  episode: '#06b6d4',
}

// How many top-degree nodes get a permanent visible label
const MAX_LABELS = 10

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

  // ── Build edges: chain within same container ─────────────────────────────
  const links = []
  const byContainer = {}
  mems.forEach(m => {
    const tag = m.containerTag || '__none__'
    ;(byContainer[tag] = byContainer[tag] || []).push(m.id)
  })
  Object.values(byContainer).forEach(ids => {
    for (let i = 0; i < ids.length - 1 && i < 60; i++) {
      links.push({ source: ids[i], target: ids[i + 1] })
    }
  })

  // ── Degree map ────────────────────────────────────────────────────────────
  const degree = {}
  mems.forEach(m => { degree[m.id] = 0 })
  links.forEach(l => {
    degree[l.source] = (degree[l.source] || 0) + 1
    degree[l.target] = (degree[l.target] || 0) + 1
  })
  const maxDeg = Math.max(1, ...Object.values(degree))

  // Top-N ids that get permanent labels
  const topIds = new Set(
    [...mems]
      .sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0))
      .slice(0, mems.length <= 15 ? mems.length : MAX_LABELS)
      .map(m => m.id)
  )

  // ── Nodes ─────────────────────────────────────────────────────────────────
  const nodes = mems.map(m => {
    const deg = degree[m.id] || 0
    const norm = deg / maxDeg
    // Size: 5px leaf → 40px top hub
    const size = 5 + norm * 35
    const color = COLORS[m.type] || COLORS.fact
    const isTopHub = topIds.has(m.id)

    return {
      id: m.id,
      name: m.memory,
      symbolSize: size,
      category: m.type === 'fact' ? 0 : m.type === 'preference' ? 1 : 2,
      value: deg,
      itemStyle: {
        color,
        borderColor: isTopHub ? 'rgba(255,255,255,0.25)' : 'transparent',
        borderWidth: isTopHub ? 1.5 : 0,
        shadowBlur: isTopHub ? 12 : 0,
        shadowColor: color + '44',
        opacity: 1,
      },
      // Only top-N get permanent labels; rest show on hover via emphasis
      label: {
        show: isTopHub,
        position: 'right',
        distance: 6,
        fontSize: isTopHub ? 11 : 10,
        fontWeight: isTopHub ? 600 : 400,
        color: '#e5e7eb',
        // Truncate to 28 chars max — short enough to avoid overlap
        formatter: ({ data }) => {
          const t = data.name || ''
          return t.length > 28 ? t.slice(0, 25) + '…' : t
        },
        // Hard overflow clip so label never exceeds its budget
        overflow: 'truncate',
        width: 160,
      },
    }
  })

  const n = mems.length
  const option = {
    backgroundColor: 'transparent',

    tooltip: {
      trigger: 'item',
      backgroundColor: '#0f0f1a',
      borderColor: 'rgba(255,255,255,0.07)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#e5e7eb', fontSize: 12 },
      confine: true,
      formatter(params) {
        if (params.dataType !== 'node') return ''
        const m = mems.find(x => x.id === params.data.id)
        if (!m) return ''
        const deg = degree[m.id] || 0
        return `
          <div style="max-width:280px">
            <div style="font-weight:600;margin-bottom:5px;color:#f3f4f6;line-height:1.45">${m.memory}</div>
            <div style="font-size:11px;color:#6b7280;display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
              <span style="background:rgba(255,255,255,0.06);padding:1px 7px;border-radius:3px;text-transform:capitalize">${m.type}</span>
              ${m.isStatic ? '<span style="background:rgba(255,255,255,0.06);padding:1px 7px;border-radius:3px">static</span>' : ''}
              <span style="background:rgba(255,255,255,0.06);padding:1px 7px;border-radius:3px">${m.containerTag || 'untagged'}</span>
              <span style="background:rgba(124,58,237,0.2);color:#a78bfa;padding:1px 7px;border-radius:3px">${deg} links</span>
            </div>
          </div>`
      },
    },

    legend: {
      data: ['Fact', 'Preference', 'Episode'],
      bottom: 10,
      left: 'center',
      textStyle: { color: '#6b7280', fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
      icon: 'circle',
    },

    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      scaleLimit: { min: 0.2, max: 5 },

      force: {
        repulsion: n > 100 ? 120 : n > 50 ? 200 : 320,
        gravity: 0.15,
        edgeLength: n > 100 ? 45 : n > 50 ? 70 : 110,
        friction: 0.65,
        layoutAnimation: true,
      },

      // labelLayout: prevent overlap — hide colliding labels automatically
      labelLayout: {
        hideOverlap: true,
      },

      categories: [
        { name: 'Fact',       itemStyle: { color: COLORS.fact } },
        { name: 'Preference', itemStyle: { color: COLORS.preference } },
        { name: 'Episode',    itemStyle: { color: COLORS.episode } },
      ],

      data: nodes,

      links: links.map(l => ({
        source: l.source,
        target: l.target,
        lineStyle: {
          color: 'rgba(148,163,184,0.15)',
          width: 0.8,
          curveness: 0.08,
        },
      })),

      emphasis: {
        focus: 'adjacency',
        blurScope: 'coordinateSystem',
        // Show label on any hovered node
        label: {
          show: true,
          fontSize: 11,
          fontWeight: 600,
          color: '#f9fafb',
          formatter: ({ data }) => {
            const t = data.name || ''
            return t.length > 40 ? t.slice(0, 37) + '…' : t
          },
          overflow: 'truncate',
          width: 200,
        },
        itemStyle: {
          shadowBlur: 16,
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.4)',
        },
        lineStyle: { width: 1.5, opacity: 0.6 },
      },

      blur: {
        itemStyle: { opacity: 0.08 },
        lineStyle: { opacity: 0.03 },
        label: { show: false },
      },

      animationDuration: 1800,
      animationEasingUpdate: 'quinticInOut',
    }],
  }

  return (
    <div className="p-8 animate-in fade-in duration-300">
      <PageHeader title="Memory Graph" subtitle={`Top ${MAX_LABELS} hubs labelled · hover any node to reveal · size = degree`}>
        <Select value={container} onChange={e => setContainer(e.target.value)}>
          <option value="">All containers</option>
          {containers.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>

        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          {Object.entries(COLORS).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="rounded-full" style={{ width: 8, height: 8, background: c }} />
              <span className="capitalize">{k}</span>
            </span>
          ))}
        </div>

        <span className="text-[11px] text-gray-600 tabular-nums">
          {mems.length} nodes · {links.length} edges
        </span>
      </PageHeader>

      <div
        className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden"
        style={{ height: 'calc(100vh - 180px)' }}
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
                notMerge={true}
              />
            )
        }
      </div>
    </div>
  )
}
