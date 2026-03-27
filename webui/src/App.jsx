import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Memories from './pages/Memories'
import Documents from './pages/Documents'
import GraphView from './pages/GraphView'
import Profiles from './pages/Profiles'
import Search from './pages/Search'
import Settings from './pages/Settings'
import { getMe } from './lib/api'

const VIEWS = { dashboard: Dashboard, memories: Memories, documents: Documents, graph: GraphView, profiles: Profiles, search: Search, settings: Settings }

export default function App() {
  const [view, setView] = useState('dashboard')
  const [user, setUser] = useState(null)

  useEffect(() => {
    getMe().then(u => { if (!u) window.location.href = '/login.html'; else setUser(u); })
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setView('search'); }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!user) return <div className="h-screen flex items-center justify-center text-gray-600"><div className="w-5 h-5 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin" /></div>

  const Page = VIEWS[view] || Dashboard

  return (
    <div className="flex h-screen overflow-hidden text-gray-100 antialiased">
      <Sidebar view={view} setView={setView} user={user} />
      <main className="flex-1 overflow-y-auto">
        <Page key={view} />
      </main>
    </div>
  )
}
