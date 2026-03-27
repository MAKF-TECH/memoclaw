import { logout } from '../lib/api'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /> },
  { id: 'memories', label: 'Memories', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /> },
  { id: 'documents', label: 'Documents', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
  { id: 'graph', label: 'Graph', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /> },
  { id: 'profiles', label: 'Profiles', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> },
  { id: 'search', label: 'Search', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /> },
]

export default function Sidebar({ view, setView, user }) {
  return (
    <nav className="w-[220px] flex-shrink-0 bg-[#0b0b12]/80 backdrop-blur-sm border-r border-white/[0.06] flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-2.5">
        <span className="text-xl">🧠</span>
        <span className="text-[15px] font-bold tracking-tight text-white">MemoClaw</span>
        <span className="ml-auto text-[10px] font-medium text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded">v0.2</span>
      </div>

      {/* Nav */}
      <div className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {NAV.map(n => (
          <button key={n.id} onClick={() => setView(n.id)}
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 text-left
              ${view === n.id ? 'text-violet-400 bg-violet-500/[0.08]' : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.04]'}`}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">{n.icon}</svg>
            {n.label}
          </button>
        ))}

        <div className="h-px bg-white/[0.06] my-3" />

        <button onClick={() => setView('settings')}
          className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 text-left
            ${view === 'settings' ? 'text-violet-400 bg-violet-500/[0.08]' : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.04]'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          Settings
        </button>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-white/[0.06] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 text-xs font-bold">
              {user?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <span className="text-xs font-medium text-gray-400 truncate">{user?.username || '—'}</span>
          </div>
          <button onClick={logout} className="text-[10px] text-gray-600 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded hover:bg-white/[0.04]">logout</button>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Connected</span>
          <span className="ml-auto text-gray-700">⌘K search</span>
        </div>
      </div>
    </nav>
  )
}
