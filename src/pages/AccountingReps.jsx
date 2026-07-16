import { useState, useEffect, useCallback } from 'react'
import { Users, Copy, Check, Trash2, Plus, Link2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  fetchConnections, fetchPendingInvites, fetchRepDetails,
  createRepInvite, revokeConnection, inviteLink,
} from '@/lib/accountingDb'

function CopyLink({ code }) {
  const [copied, setCopied] = useState(false)
  const link = inviteLink(code)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked — user can select manually */ }
  }
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 truncate rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300">
        {link}
      </code>
      <Button variant="outline" size="sm" onClick={copy} className="shrink-0">
        {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
        <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
      </Button>
    </div>
  )
}

function AccountingReps() {
  const [connections, setConnections] = useState([])
  const [pending, setPending] = useState([])
  const [repDetails, setRepDetails] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [conns, invites] = await Promise.all([fetchConnections(), fetchPendingInvites()])
      setConnections(conns)
      setPending(invites)
      const repIds = [...new Set(conns.map((c) => c.rep_id))]
      if (repIds.length) setRepDetails(await fetchRepDetails(repIds))
    } catch (err) {
      setError(err.message || 'Failed to load reps.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const create = async (e) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      await createRepInvite(email.trim() || null)
      setEmail('')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to create invite.')
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (id) => {
    if (!confirm('Revoke this connection? The rep will no longer be linked and you\'ll lose access to their data.')) return
    try {
      await revokeConnection(id)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to revoke.')
    }
  }

  const active = connections.filter((c) => c.status === 'active')

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#005b5b]/10 flex items-center justify-center">
          <Users className="size-5 text-[#005b5b]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Connected Reps</h1>
          <p className="text-sm text-zinc-500">Invite reps and manage who you're linked to.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="ml-auto" title="Refresh">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Invite a rep */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Connect a rep</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Generate an invite link and send it to the rep. When they open it while signed in, they'll be connected.
        </p>
        <form onSubmit={create} className="flex items-center gap-2">
          <Input
            type="email"
            placeholder="Rep's email (optional — for your reference)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={creating}>
            <Plus className="size-4 mr-1" />
            {creating ? 'Generating…' : 'Generate link'}
          </Button>
        </form>
      </section>

      {/* Pending invites */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
            <Link2 className="size-4 text-zinc-400" /> Pending invites
          </h2>
          <div className="space-y-3">
            {pending.map((inv) => (
              <div key={inv.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
                {inv.rep_email && <div className="text-sm text-zinc-600 dark:text-zinc-300">For: {inv.rep_email}</div>}
                <CopyLink code={inv.invite_code} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active connections */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <Users className="size-4 text-zinc-400" /> Linked reps ({active.length})
        </h2>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : active.length === 0 ? (
          <p className="text-sm text-zinc-500">No reps connected yet. Generate an invite link above to get started.</p>
        ) : (
          <div className="space-y-2">
            {active.map((c) => {
              const rep = repDetails[c.rep_id]
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                    {rep?.avatar_url
                      ? <img src={rep.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-200">{(rep?.name || '?').charAt(0).toUpperCase()}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{rep?.name || 'Rep'}</div>
                    <div className="text-xs text-zinc-500 truncate">{rep?.email || c.rep_id}</div>
                  </div>
                  {!c.sharing_enabled && (
                    <span className="text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5">
                      sharing paused
                    </span>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => revoke(c.id)} title="Revoke" className="text-red-600 hover:text-red-700">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export default AccountingReps
