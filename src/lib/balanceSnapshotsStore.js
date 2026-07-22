// Per-invoice Open Balance snapshots, captured on every upload that carries an
// open-balance column (the invoices report and the weekly "Invoices & Received
// Payments" report). FULL HISTORY is retained on purpose: the week-over-week
// DROP in an invoice's Open Balance is exactly what was settled that week, and
// the payment-first settlement engine reads those deltas to date and classify
// each settlement (cash / credit / unapplied). See docs/payment-first-spec.md.
//
// Shape: { [invoiceNum]: [{ asOf, openBalance, source }] }  — points ascending
// by asOf. Persisted in Supabase portal_data (see portalStore.js) so every
// authorized login shares the same history.

import { pget, pset, pdel } from './portalStore'

const KEY = 'invoice_balance_snapshots'

const sourceType = (s) => (String(s || '').split(':')[0] || 'upload')

export async function loadBalanceSnapshots() {
  try {
    const obj = await pget(KEY)
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}
  } catch {
    return {}
  }
}

// Append a snapshot point per invoice. `entries` = [{ num, openBalance }].
// Dedup is by (invoice, calendar day, source type): re-uploading the same file
// on the same day replaces that day's point instead of piling up duplicates,
// while distinct days or sources accrue as history.
export async function recordBalanceSnapshots(entries, { asOf, source } = {}) {
  const list = Array.isArray(entries) ? entries : []
  if (!list.length) return
  const stamp = asOf || new Date().toISOString()
  const day = stamp.slice(0, 10)
  const st = sourceType(source)
  const store = await loadBalanceSnapshots()
  let touched = 0
  for (const e of list) {
    const num = String(e?.num || '').trim()
    if (!num) continue
    const ob = e?.openBalance == null ? null : Number(e.openBalance)
    if (ob == null || Number.isNaN(ob)) continue
    const points = store[num] || []
    const filtered = points.filter(
      (p) => !(String(p.asOf).slice(0, 10) === day && sourceType(p.source) === st),
    )
    filtered.push({ asOf: stamp, openBalance: ob, source: source || 'upload' })
    filtered.sort((a, b) => String(a.asOf).localeCompare(String(b.asOf)))
    store[num] = filtered
    touched++
  }
  if (touched) await pset(KEY, store)
}

export async function clearBalanceSnapshots() {
  try { await pdel(KEY) } catch {}
}
