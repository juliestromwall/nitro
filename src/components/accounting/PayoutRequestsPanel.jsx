// Accounting-side queue of commission payout requests from connected reps.
//
// The rep's figure is what THEY think they're owed. Accounting is the authority
// on what's actually payable, because that depends on which customer invoices
// have been paid — so approving lets you enter a different (usually lower)
// amount and say why.
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Check, Ban, Banknote, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  fetchIncomingPayoutRequests, approvePayoutRequest,
  rejectPayoutRequest, markPayoutPaid, PAYOUT_STATUS,
} from '@/lib/payoutRequests'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)

const TONE = {
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  teal: 'bg-[#005b5b]/10 text-[#005b5b] dark:bg-[#005b5b]/30 dark:text-teal-200',
  zinc: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

function StatusPill({ status }) {
  const meta = PAYOUT_STATUS[status] ?? PAYOUT_STATUS.pending
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${TONE[meta.tone]}`}>
      {meta.label}
    </span>
  )
}

export default function PayoutRequestsPanel({ repDetails = {}, onViewSales }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [reviewing, setReviewing] = useState(null)   // the request being approved
  const [approveAmount, setApproveAmount] = useState('')
  const [responseNote, setResponseNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setRequests(await fetchIncomingPayoutRequests()) }
    catch (err) { setError(err.message || 'Failed to load payout requests.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const nameOf = (repId) => repDetails[repId]?.name || repDetails[repId]?.email || 'Rep'

  const openReview = (r) => {
    setReviewing(r)
    setApproveAmount(String(r.amount_requested))
    setResponseNote('')
    setError('')
  }

  const doApprove = async () => {
    const value = Number(approveAmount)
    if (!(value >= 0)) { setError('Enter a valid amount.'); return }
    setBusyId(reviewing.id)
    try {
      await approvePayoutRequest(reviewing.id, { amountApproved: value, responseNote })
      setReviewing(null)
      await load()
    } catch (err) { setError(err.message || 'Could not approve.') }
    finally { setBusyId(null) }
  }

  const doReject = async (r) => {
    setBusyId(r.id)
    try { await rejectPayoutRequest(r.id, { responseNote: '' }); await load() }
    catch (err) { setError(err.message || 'Could not reject.') }
    finally { setBusyId(null) }
  }

  const doMarkPaid = async (r) => {
    setBusyId(r.id)
    try { await markPayoutPaid(r.id); await load() }
    catch (err) { setError(err.message || 'Could not mark paid.') }
    finally { setBusyId(null) }
  }

  const open = requests.filter((r) => r.status === 'pending')
  const approved = requests.filter((r) => r.status === 'approved')
  const history = requests.filter((r) => ['paid', 'rejected', 'cancelled'].includes(r.status)).slice(0, 8)

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="size-4 animate-spin" /> Loading payout requests…</div>
  }

  const Row = ({ r, children }) => (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{nameOf(r.rep_id)}</span>
          <StatusPill status={r.status} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          asked <span className="font-medium text-foreground">{fmt(r.amount_requested)}</span>
          {r.amount_approved != null && <> · approved <span className="font-medium text-foreground">{fmt(r.amount_approved)}</span></>}
          {r.season_label && <> · {r.season_label}</>}
          {' · '}{new Date(r.requested_at).toLocaleDateString()}
        </p>
        {r.note && <p className="text-xs text-muted-foreground italic mt-1 truncate">“{r.note}”</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  )

  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Banknote className="size-4 text-[#005b5b]" />
        <h2 className="font-semibold">Payout Requests</h2>
        {open.length > 0 && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            {open.length} awaiting you
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Reps request against the Available figure you publish from the accounting page
        (<em>Send Available to reps</em>), so these asks should already reflect what customers have paid.
      </p>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      {requests.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Inbox className="size-4" /> No payout requests yet.
        </div>
      ) : (
        <div>
          {open.map((r) => (
            <Row key={r.id} r={r}>
              {onViewSales && (
                <Button variant="outline" size="sm" onClick={() => onViewSales({ id: r.rep_id, name: nameOf(r.rep_id) })}>
                  View sales
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => doReject(r)} disabled={busyId === r.id} className="text-red-600 hover:text-red-700">
                <Ban className="size-4" />
              </Button>
              <Button size="sm" onClick={() => openReview(r)} disabled={busyId === r.id} className="bg-[#005b5b] hover:bg-[#004848]">
                {busyId === r.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                <span className="ml-1">Approve</span>
              </Button>
            </Row>
          ))}
          {approved.map((r) => (
            <Row key={r.id} r={r}>
              <Button size="sm" variant="outline" onClick={() => doMarkPaid(r)} disabled={busyId === r.id}>
                {busyId === r.id ? <Loader2 className="size-4 animate-spin" /> : <Banknote className="size-4" />}
                <span className="ml-1">Mark paid</span>
              </Button>
            </Row>
          ))}
          {history.map((r) => <Row key={r.id} r={r} />)}
        </div>
      )}

      <Dialog open={!!reviewing} onOpenChange={(o) => { if (!o) setReviewing(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve payout — {reviewing && nameOf(reviewing.rep_id)}</DialogTitle>
            <DialogDescription>
              They asked for {reviewing && fmt(reviewing.amount_requested)}. Approve the amount that's
              actually eligible — normally only the commission on invoices the customer has paid.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Approved amount</label>
              <Input type="number" min="0" step="0.01" value={approveAmount}
                onChange={(e) => setApproveAmount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Note to the rep (optional)</label>
              <Input value={responseNote} onChange={(e) => setResponseNote(e.target.value)}
                placeholder="e.g. balance follows once Boyne pays SI-12345" className="mt-1" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button onClick={doApprove} disabled={!!busyId} className="bg-[#005b5b] hover:bg-[#004848]">
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
