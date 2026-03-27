export function Badge({ type, children }) {
  const colors = {
    fact: 'bg-violet-500/15 text-violet-300',
    preference: 'bg-amber-500/15 text-amber-300',
    episode: 'bg-sky-500/15 text-sky-300',
    done: 'bg-emerald-500/15 text-emerald-300',
    queued: 'bg-amber-500/15 text-amber-300',
    error: 'bg-red-500/15 text-red-300',
    extracting: 'bg-cyan-500/15 text-cyan-300',
    embedding: 'bg-cyan-500/15 text-cyan-300',
    indexing: 'bg-cyan-500/15 text-cyan-300',
    chunking: 'bg-cyan-500/15 text-cyan-300',
    static: 'bg-violet-500/15 text-violet-300',
    latest: 'bg-emerald-500/15 text-emerald-300',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${colors[type] || 'bg-gray-500/15 text-gray-400'}`}>
      {children || type}
    </span>
  )
}

export function Card({ children, className = '', onClick, hover = true }) {
  return (
    <div onClick={onClick}
      className={`bg-white/[0.02] border border-white/[0.06] rounded-xl transition-all duration-150
        ${hover ? 'hover:border-white/[0.1] hover:bg-white/[0.03]' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function Spinner() {
  return <div className="w-5 h-5 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin" />
}

export function Empty({ children }) {
  return <div className="text-center py-16 text-sm text-gray-600">{children || 'Nothing here yet'}</div>
}

export function SimScore({ value }) {
  const pct = Math.round(value * 100)
  const color = value > 0.6 ? 'text-emerald-400' : value > 0.3 ? 'text-amber-400' : 'text-gray-500'
  return <span className={`text-[11px] font-bold tabular-nums ${color}`}>{pct}%</span>
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  )
}

export function StatCard({ value, label, color = 'text-violet-400' }) {
  return (
    <Card hover={false} className="p-5">
      <div className={`text-3xl font-extrabold tracking-tight ${color}`}>{value ?? '—'}</div>
      <div className="text-xs text-gray-500 mt-1 font-medium">{label}</div>
    </Card>
  )
}

export function Input({ className = '', ...props }) {
  return <input className={`bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all ${className}`} {...props} />
}

export function Select({ className = '', children, ...props }) {
  return <select className={`bg-[#0d0d16] border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-gray-300 outline-none cursor-pointer focus:border-violet-500/50 transition-colors ${className}`} {...props}>{children}</select>
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all resize-y min-h-[100px] font-[inherit] ${className}`} {...props} />
}

export function Button({ variant = 'primary', className = '', children, ...props }) {
  const styles = {
    primary: 'bg-violet-600 hover:bg-violet-500 text-white font-semibold shadow-sm',
    ghost: 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] border border-white/[0.06]',
    danger: 'text-red-400 hover:text-red-300 hover:bg-red-500/10',
  }
  return <button className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs rounded-lg transition-colors duration-150 cursor-pointer ${styles[variant]} ${className}`} {...props}>{children}</button>
}

export function Modal({ title, open, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-[#0e0e18] border border-white/[0.08] rounded-xl w-full max-w-lg shadow-2xl animate-in slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none cursor-pointer">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

export function Drawer({ title, open, onClose, children }) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[420px] max-w-[90vw] bg-[#0c0c16]/95 backdrop-blur-xl border-l border-white/[0.06] shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none cursor-pointer">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </>
  )
}

export function toast(msg, type = 'success') {
  const el = document.createElement('div')
  el.className = `fixed bottom-5 right-5 z-[200] px-4 py-3 rounded-lg text-xs shadow-lg border border-white/[0.08] animate-in slide-in-from-bottom-2 duration-200
    ${type === 'error' ? 'bg-[#13131d] border-l-2 border-l-red-400' : 'bg-[#13131d] border-l-2 border-l-emerald-400'}`
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300) }, 3000)
}
