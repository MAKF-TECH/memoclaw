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
  mems.forEach((m) => {
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

  // ── Nodes ─────────────────────────────────────────────────────────────────
  const nodes = mems.map(m => {
    const deg = degree[m.id] || 0
    const norm = deg / maxDeg
    // Size range 6–38: hubs are clearly bigger, leaves are small dots
    const size = 6 + norm * 32
    const color = COLORS[m.type] || COLORS.fact
    const isHub = deg >= maxDeg * 0.4

    return {
      id: m.id,
      name: m.memory,
      symbolSize: size,
      category: m.type === 'fact' ? 0 : m.type === 'preference' ? 1 : 2,
      value: deg,
      itemStyle: {
        color,
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: isHub ? 1.5 : 0,
        shadowBlur: isHub ? 10 : 0,
        shadowColor: color + '55',
      },
      label: {
        show: isHub || mems.length < 20,
        fontSize: isHub ? 10 : 9,
        fontWeight: isHub ? 600 : 400,
        color: '#d1d5db',
        distance: 5,
        formatter: ({ data }) => {
          const t = data.name || ''
          return t.length > 38 ? t.slice(0, 35) + '…' : t
        },
      },
    }
  })

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0f0f1a',
      borderColor: 'rgba(255,255,255,0.07)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#e5e7eb', fontSize: 12 },
      formatter(params) {
        if (params.dataType !== 'node') return ''
        const m = mems.find(x => x.id === params.data.id)
        if (!m) return ''
        const deg = degree[m.id] || 0
        return `
          <div style="max-width:290px">
            <div style="font-weight:600;margin-bottom:5px;color:#f3f4f6;line-height:1.45">${m.memory}</div>
            <div style="font-size:11px;color:#6b7280;display:flex;gap:6px;flex-wrap:wrap">
              <span style="background:rgba(255,255,255,0.05);padding:1px 6px;border-radius:3px;text-transform:capitalize">${m.type}</span>
              ${m.isStatic ? '<span style="background:rgba(255,255,255,0.05);padding:1px 6px;border-radius:3px">static</span>' : ''}
              <span style="background:rgba(255,255,255,0.05);padding:1px 6px;border-radius:3px">${m.containerTag || 'untagged'}</span>
              <span style="background:rgba(124,58,237,0.18);color:#a78bfa;padding:1px 6px;border-radius:3px">${deg} links</span>
            </div>
          </div>`
      },
    },
    legend: {
      data: ['Fact', 'Preference', 'Episode'],
      bottom: 12,
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
      scaleLimit: { min: 0.25, max: 4 },

      force: {
        // More repulsion for hubs — spread them apart naturally
        repulsion: mems.length > 80 ? 160 : mems.length > 40 ? 250 : 380,
        gravity: 0.12,
        edgeLength: mems.length > 80 ? 60 : mems.length > 40 ? 90 : 130,
        friction: 0.6,
        layoutAnimation: true,
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
          color: 'rgba(148,163,184,0.2)',
          width: 1,
          curveness: 0.1,
        },
      })),

      emphasis: {
        focus: 'adjacency',
        blurScope: 'coordinateSystem',
        label: { show: true, fontSize: 11, color: '#f9fafb' },
        lineStyle: { width: 2, color: 'rgba(148,163,184,0.7)' },
      },

      blur: {
        itemStyle: { opacity: 0.1 },
        lineStyle: { opacity: 0.04 },
        label: { show: false },
      },

      animationDuration: 1500,
      animationEasingUpdate: 'quinticInOut',
    }],
  }

  return (
    <div className="p-8 animate-in fade-in duration-300">
      <PageHeader title="Memory Graph" subtitle="Force-directed — node size = connection degree">
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
