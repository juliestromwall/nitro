// "Send Available to reps" — pushes accounting's computed per-rep Available
// figure through to the rep side, so reps request against a real number rather
// than their own sales maths.
//
// Reps are matched to their app logins by email. Anything that doesn't match is
// shown plainly rather than silently dropped, because a rep who isn't matched
// simply never receives a figure.
import { useState } from 'react'
import { Loader2, Send, Check, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { matchPortalRepsToConnections, publishAvailability } from '@/lib/payoutAvailability'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)

export default function PublishAvailabilityButton({ reps, repSummary }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(0)
  const [preview, setPreview] = useState(null)   // { matched, unmatched }

  const start = async () => {
    setOpen(true); setLoading(true); setError(''); setDone(0); setPreview(null)
    try {
      const res = await matchPortalRepsToConnections(reps)
      setPreview(res)
    } catch (err) {
      setError(err.message || 'Could not check rep connections.')
    } finally {
      setLoading(false)
    }
  }

  const send = async () => {
    setBusy(true); setError('')
    try {
      const rows = preview.matched.map((m) => ({
        repId: m.repId,
        portalRepKey: m.portalRep.id,
        amount: repSummary?.[m.portalRep.id]?.available ?? 0,
      }))
      const written = await publishAvailability(rows)
      setDone(written.length)
    } catch (err) {
      setError(err.message || 'Could not publish.')
    } finally {
      setBusy(false)
    }
  }

  const amountFor = (portalRepId) => repSummary?.[portalRepId]?.available ?? 0

  return (
    <>
      <Button variant="outline" size="sm" onClick={start}>
        <Send className="size-4 mr-1.5" />
        Send Available to reps
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); setDone(0) } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send Available to reps</DialogTitle>
            <DialogDescription>
              Each connected rep will see this as their <strong>Available to be paid</strong> and can
              request a payout against it. Sending again replaces the previous figure.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Checking rep connections…
            </div>
          ) : done > 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm">
              <Check className="size-5 text-emerald-600" />
              Sent to {done} rep{done === 1 ? '' : 's'}. They'll see the new figure next time they open their dashboard.
            </div>
          ) : preview ? (
            <div className="space-y-4 py-1 max-h-[50vh] overflow-y-auto">
              {preview.matched.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None of your reps are connected in the app yet. Connect them from
                  the Reps tab first, then send.
                </p>
              ) : (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    Will receive ({preview.matched.length})
                  </p>
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
                    {preview.matched.map((m) => (
                      <div key={m.repId} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium">{m.portalRep.name}</span>
                          <span className="text-xs text-muted-foreground ml-2 truncate">{m.email}</span>
                        </div>
                        <span className="font-semibold tabular-nums">{fmt(amountFor(m.portalRep.id))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.unmatched.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-600 mb-2">
                    <AlertTriangle className="size-3.5" />
                    Not connected — will NOT receive ({preview.unmatched.length})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {preview.unmatched.map((r) => r.name).join(', ')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Either they haven't accepted a connection invite, or the email on their
                    portal record doesn't match the one they log in with.
                  </p>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 py-6">{error}</p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setDone(0) }}>
              {done > 0 ? 'Close' : 'Cancel'}
            </Button>
            {done === 0 && (
              <Button
                onClick={send}
                disabled={busy || loading || !preview?.matched?.length}
                className="bg-[#005b5b] hover:bg-[#004848]"
              >
                {busy ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Send className="size-4 mr-1.5" />}
                Send to {preview?.matched?.length ?? 0} rep{preview?.matched?.length === 1 ? '' : 's'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
