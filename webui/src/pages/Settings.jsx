import { useState } from 'react'
import { Card, PageHeader, Button, Input, toast } from '../components/UI'

export default function Settings() {
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [cfm, setCfm] = useState('')

  async function changePw(e) {
    e.preventDefault()
    if (!cur || !nw) return toast('Fill all fields', 'error')
    if (nw !== cfm) return toast('Passwords don\'t match', 'error')
    try {
      const r = await fetch('/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ current_password: cur, new_password: nw })
      })
      if (r.ok) { toast('Password updated'); setCur(''); setNw(''); setCfm('') }
      else { const d = await r.json(); toast(d.detail || 'Failed', 'error') }
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div className="p-8 animate-in fade-in duration-300">
      <PageHeader title="Settings" subtitle="Account & configuration" />

      <div className="max-w-md space-y-8">
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Change Password</h3>
          <Card hover={false}>
            <form onSubmit={changePw} className="space-y-3">
              <div><label className="text-xs font-medium text-gray-500 mb-1 block">Current password</label>
                <Input type="password" value={cur} onChange={e => setCur(e.target.value)} className="w-full" /></div>
              <div><label className="text-xs font-medium text-gray-500 mb-1 block">New password</label>
                <Input type="password" value={nw} onChange={e => setNw(e.target.value)} className="w-full" /></div>
              <div><label className="text-xs font-medium text-gray-500 mb-1 block">Confirm</label>
                <Input type="password" value={cfm} onChange={e => setCfm(e.target.value)} className="w-full" /></div>
              <Button type="submit" className="w-full justify-center">Update Password</Button>
            </form>
          </Card>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">API Access</h3>
          <Card hover={false}>
            <p className="text-xs text-gray-500 mb-3">Use this key for external tools. Set via <code className="text-violet-400 bg-violet-500/10 px-1 rounded text-[11px]">MEMOCLAW_API_KEY</code></p>
            <p className="text-xs text-gray-600">API key is configured server-side via environment variable.</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
