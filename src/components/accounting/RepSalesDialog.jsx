import { useState, useEffect, useMemo, useCallback } from 'react'
import { Check, Loader2, RotateCcw } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { fetchRepSales, updateRepCommission } from '@/lib/accountingDb'

const fmtMoney = (n) =>
  (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// Brand/category default rate for an order — mirrors the rep app's getExpectedRate.
function expectedRate(order, companiesById) {
  const c = companiesById[order.company_id]
  const cat = c?.category_commissions?.[order.order_type]
  return cat != null ? Number(cat) : Number(c?.commission_percent || 0)
}

// The rate actually applied to a sale: the rep's override, else the default.
const effectiveRate = (order, companiesById) =>
  order.commission_override != null ? Number(order.commission_override) : expectedRate(order, companiesById)

export default function RepSalesDialog({ repId, repName, open, onOpenChange }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState({})     // orderId -> string being edited
  const [savingId, setSavingId] = useState(null)
  const [savedId, setSavedId] = useState(null)

  const load = useCallback(async () => {
    if (!repId) return
    setLoading(true); setError('')
    try {
      setData(await fetchRepSales(repId))
      setDrafts({})
    } catch (err) {
      setError(err.message || 'Failed to load this rep\'s sales.')
    } finally {
      setLoading(false)
    }
  }, [repId])

  useEffect(() => { if (open) load() }, [open, load])

  const companiesById = useMemo(
    () => Object.fromEntries((data?.companies ?? []).map((c) => [c.id, c])),
    [data],
  )
  const clientsById = useMemo(
    () => Object.fromEntries((data?.clients ?? []).map((c) => [c.id, c])),
    [data],
  )
  const seasonsById = useMemo(
    () => Object.fromEntries((data?.seasons ?? []).map((s) => [s.id, s])),
    [data],
  )

  const orders = useMemo(
    () => [...(data?.orders ?? [])].sort((a, b) =>
      (b.close_date || '').localeCompare(a.close_date || '')),
    [data],
  )

  const save = async (order, rawValue) => {
    // Empty input clears the override (revert to default); otherwise parse a number.
    const trimmed = String(rawValue).trim()
    const pct = trimmed === '' ? null : parseFloat(trimmed)
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      setError('Commission % must be between 0 and 100.')
      return
    }
    setError(''); setSavingId(order.id)
    try {
      const { order: updated } = await updateRepCommission(order.id, pct)
      setData((prev) => ({
        ...prev,
        orders: prev.orders.map((o) => (o.id === order.id ? { ...o, ...updated } : o)),
      }))
      setDrafts((prev) => { const next = { ...prev }; delete next[order.id]; return next })
      setSavedId(order.id)
      setTimeout(() => setSavedId((s) => (s === order.id ? null : s)), 1600)
    } catch (err) {
      setError(err.message || 'Failed to update commission.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!savingId) onOpenChange(o) }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{repName || 'Rep'} — sales &amp; commission</DialogTitle>
          <DialogDescription>
            Adjust a sale's commission % if the rep entered the wrong rate. Blank the field to
            reset it to the brand's default. Changes save to the rep's ledger.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <p className="py-10 text-center text-sm text-zinc-500">Loading sales…</p>
        ) : orders.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">No sales found for this rep.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-zinc-950">
                <tr className="text-left text-xs text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-2 pr-2 font-medium">Account</th>
                  <th className="py-2 px-2 font-medium">Brand</th>
                  <th className="py-2 px-2 font-medium text-right">Total</th>
                  <th className="py-2 px-2 font-medium">Comm&nbsp;%</th>
                  <th className="py-2 px-2 font-medium text-right">Commission</th>
                  <th className="py-2 pl-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const rate = effectiveRate(o, companiesById)
                  const overridden = o.commission_override != null
                  const draft = drafts[o.id]
                  const shownVal = draft != null ? draft : (overridden ? String(o.commission_override) : '')
                  const changed = draft != null && draft !== (overridden ? String(o.commission_override) : '')
                  const commission = (Number(o.total) || 0) * rate / 100
                  return (
                    <tr key={o.id} className="border-b border-zinc-100 dark:border-zinc-800/60">
                      <td className="py-2 pr-2">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[190px]">
                          {clientsById[o.client_id]?.name || 'Unknown account'}
                        </div>
                        <div className="text-xs text-zinc-400 truncate">
                          {seasonsById[o.season_id]?.label || ''}{o.order_number ? ` · #${o.order_number}` : ''}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-zinc-600 dark:text-zinc-300">
                        {companiesById[o.company_id]?.name || '—'}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtMoney(o.total)}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number" min="0" max="100" step="0.5"
                            value={shownVal}
                            placeholder={String(expectedRate(o, companiesById))}
                            onChange={(e) => setDrafts((p) => ({ ...p, [o.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') save(o, shownVal) }}
                            className="w-20 h-8"
                          />
                          <span className="text-zinc-400 text-xs">%</span>
                        </div>
                        {!overridden && (
                          <div className="text-[10px] text-zinc-400 mt-0.5">brand default</div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtMoney(commission)}</td>
                      <td className="py-2 pl-2">
                        {savingId === o.id ? (
                          <Loader2 className="size-4 animate-spin text-zinc-400" />
                        ) : savedId === o.id ? (
                          <Check className="size-4 text-green-600" />
                        ) : changed ? (
                          <Button size="sm" className="h-7" onClick={() => save(o, shownVal)}>Save</Button>
                        ) : overridden ? (
                          <button
                            title="Reset to brand default"
                            onClick={() => save(o, '')}
                            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                          >
                            <RotateCcw className="size-4" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
