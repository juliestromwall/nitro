// Rep-side "Request Commission Payout".
//
// The headline figure is NOT the rep's own sales maths — it's the Available
// amount their accountant published, which is commission on invoices customers
// have actually paid, less what's already been paid out. Reps can't see any of
// those inputs, so this is the only trustworthy number, and requests are capped
// to it. Their own "owed" total is shown underneath purely for context.
import { useState, useEffect, useCallback } from 'react'
import { Send, Loader2, X, Check, Clock, Ban, AlertCircle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  fetchMyAccountants, fetchMyPayoutRequests, createPayoutRequest,
  cancelPayoutRequest, PAYOUT_STATUS,
} from '@/lib/payoutRequests'
import { fetchMyAvailability } from '@/lib/payoutAvailability'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)

const TONE = {
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  teal: 'bg-[#005b5b]/10 text-[#005b5b] dark:bg-[#005b5b]/30 dark:text-teal-200',
  zinc: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

const ICON = { pending: Clock, approved: Check, rejected: Ban, paid: Check, cancelled: X }

function StatusPill({ status }) {
  const meta = PAYOUT_STATUS[status] ?? PAYOUT_STATUS.pending
  const Icon = ICON[status] ?? Clock
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${TONE[meta.tone]}`}>
      <Icon className="size-3" />
      {meta.label}
    </span>
  )
}

export default function RequestPayoutCard({ owed = 0, seasonLabel }) {
  const [accountants, setAccountants] = useState([])
  const [requests, setRequests] = useState([])
  const [availability, setAvailability] = useState(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [conns, reqs, avail] = await Promise.all([
        fetchMyAccountants(), fetchMyPayoutRequests(), fetchMyAvailability(),
      ])
      setAccountants(conns)
      setRequests(reqs)
      setAvailability(avail)
    } catch (err) {
      setError(err.message || 'Could not load payout information.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const pending = requests.find((r) => r.status === 'pending')
  const recent = requests.filter((r) => r.status !== 'pending').slice(0, 3)
  const available = Number(availability?.amount_available ?? 0)
  const canRequest = !!availability && available > 0

  const openDialog = () => {
    setAmount(String(Math.round(available * 100) / 100))
    setNote('')
    setError('')
    setOpen(true)
  }

  const submit = async () => {
    const value = Number(amount)
    if (!(value > 0)) { setError('Enter an amount greater than zero.'); return }
    if (value > available + 0.005) {
      setError(`You can request up to ${fmt(available)} — that's what your accountant has confirmed is available.`)
      return
    }
    setBusy(true); setError('')
    try {
      const conn = accountants[0]
      await createPayoutRequest({
        accountingId: conn.accounting_id,
        connectionId: conn.id,
        amount: value,
        note,
        seasonLabel,
      })
      setOpen(false)
      await load()
    } catch (err) {
      setError(err.message || 'Could not send the request.')
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async (id) => {
    setBusy(true)
    try { await cancelPayoutRequest(id); await load() }
    catch (err) { setError(err.message || 'Could not withdraw the request.') }
    finally { setBusy(false) }
  }

  if (loading) return null

  if (!accountants.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-5 py-4 flex items-start gap-3">
        <AlertCircle className="size-4 text-zinc-400 mt-0.5 shrink-0" />
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">No accountant connected.</span>{' '}
          Once your accounting contact connects with you, you can request commission payouts here.
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-5 py-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Available to be paid</p>
          {availability ? (
            <>
              <p className="text-2xl font-bold text-[#005b5b] dark:text-teal-300 tabular-nums">{fmt(available)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Confirmed by your accountant as of {new Date(availability.as_of).toLocaleDateString()}
                {owed > 0 && <> · your total commission owed is {fmt(owed)}</>}
              </p>
              {availability.note && (
                <p className="text-xs text-muted-foreground italic mt-1">“{availability.note}”</p>
              )}
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-muted-foreground tabular-nums">—</p>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                Your accountant hasn't confirmed an available amount yet. This depends on which of
                your accounts have actually paid their invoices.
              </p>
            </>
          )}
        </div>

        {pending ? (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <StatusPill status="pending" />
              <p className="text-sm font-semibold mt-1">{fmt(pending.amount_requested)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => withdraw(pending.id)} disabled={busy}>
              Withdraw
            </Button>
          </div>
        ) : (
          <Button
            size="sm" onClick={openDialog} disabled={!canRequest}
            className="bg-[#005b5b] hover:bg-[#004848]"
            title={canRequest ? undefined : 'Nothing available to request yet'}
          >
            <Send className="size-4 mr-1.5" />
            Request Payout
          </Button>
        )}
      </div>

      {recent.length > 0 && (
        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
          {recent.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <StatusPill status={r.status} />
                <span className="text-muted-foreground truncate">
                  asked {fmt(r.amount_requested)}
                  {r.amount_approved != null && r.amount_approved !== r.amount_requested && (
                    <> · approved <span className="font-medium text-foreground">{fmt(r.amount_approved)}</span></>
                  )}
                </span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(r.requested_at).toLocaleDateString()}
              </span>
            </div>
          ))}
          {recent.some((r) => r.response_note) && (
            <p className="text-xs text-muted-foreground italic pt-1">
              “{recent.find((r) => r.response_note).response_note}”
            </p>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a commission payout</DialogTitle>
            <DialogDescription>
              Your accountant has confirmed {fmt(available)} is available — that's commission on
              invoices your accounts have already paid. Request up to that amount.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Amount requested</label>
              <Input
                type="number" min="0" max={available} step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Maximum {fmt(available)}.</p>
            </div>
            <div>
              <label className="text-sm font-medium">Note (optional)</label>
              <Input
                value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Anything your accountant should know"
                className="mt-1"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy} className="bg-[#005b5b] hover:bg-[#004848]">
              {busy ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Send className="size-4 mr-1.5" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
