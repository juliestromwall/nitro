// Parser for the QuickBooks Online "A/R Aging Detail" report — the source of
// OPEN receivables (what customers still owe), used to drive "Pending (open
// invoices)" commission and the Collections view. Invoice-level only (no line
// items); brand attribution for open invoices comes from the line-items upload.
//
// The report mixes positive Invoices with negative Credit Memos / unapplied
// Payments, so balances must be netted per customer. See
// docs/… (Stage 1 proof: reproduces the report's own subtotals to the penny).

import { parseCSVLine, splitCSVRows } from './csv.js'

const toNum = (s) => {
  const n = parseFloat(String(s ?? '').replace(/[$,\s]/g, ''))
  return Number.isNaN(n) ? 0 : n
}
const isDate = (s) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(s ?? '').trim())

// Aging bucket label → key. QBO's standard five.
const BUCKETS = {
  'CURRENT': 'current',
  '1 - 30 days past due': 'd1_30',
  '31 - 60 days past due': 'd31_60',
  '61 - 90 days past due': 'd61_90',
  '91 or more days past due': 'd91',
}

// Column layout (0-indexed).
const COL = { date: 1, type: 2, num: 3, customer: 4, dueDate: 5, amount: 6, openBalance: 7 }

/**
 * Parse the "A/R Aging Detail" CSV text.
 * Returns:
 *   meta       { company, report, asOf }
 *   rows       [{ date, type, num, customer, dueDate, amount, openBalance, bucket }]
 *   totals     { grandOpen, byBucket:{bucket:open} }
 *   validation { ok, grandOk, mismatches:[{bucket, parsed, reported}] }
 */
export function parseArAging(csvText) {
  const lines = splitCSVRows(String(csvText || ''))
  const preHeader = []
  let started = false
  let bucket = null

  const rows = []
  const reportedByBucket = {}
  let grandReported = null

  for (const raw of lines) {
    if (!raw || !raw.trim()) continue
    const c = parseCSVLine(raw)
    const a = (c[0] || '').trim()

    if (!started) {
      if ((c[COL.date] || '').trim() === 'Date') { started = true; continue }
      if (a) preHeader.push(a)
      continue
    }

    if (a === 'TOTAL') { grandReported = toNum(c[COL.openBalance]); continue }
    if (a.startsWith('Total for ')) {
      const name = a.replace('Total for ', '').trim()
      if (BUCKETS[name] !== undefined) reportedByBucket[BUCKETS[name]] = toNum(c[COL.openBalance])
      continue
    }
    if (BUCKETS[a] !== undefined) { bucket = BUCKETS[a]; continue }   // bucket group header
    // Data row: blank col A, a real date.
    if (!a && isDate(c[COL.date])) {
      rows.push({
        date: (c[COL.date] || '').trim(),
        type: (c[COL.type] || '').trim(),
        num: (c[COL.num] || '').trim(),
        customer: (c[COL.customer] || '').trim(),
        dueDate: (c[COL.dueDate] || '').trim(),
        amount: toNum(c[COL.amount]),
        openBalance: toNum(c[COL.openBalance]),
        bucket,
      })
    }
  }

  // Totals + validation against the report's own subtotals.
  const byBucket = {}
  for (const r of rows) byBucket[r.bucket] = round2((byBucket[r.bucket] || 0) + r.openBalance)
  const mismatches = []
  for (const [k, reported] of Object.entries(reportedByBucket)) {
    const parsed = byBucket[k] || 0
    if (Math.abs(parsed - reported) > 0.01) mismatches.push({ bucket: k, parsed, reported })
  }
  const grandOpen = round2(rows.reduce((s, r) => s + r.openBalance, 0))
  const grandOk = grandReported == null ? null : Math.abs(grandOpen - grandReported) < 0.01

  const asOf = (preHeader.find(p => p.startsWith('As of')) || '').replace(/^As of\s*/, '')
  return {
    meta: { company: preHeader[0] || '', report: preHeader[1] || '', asOf },
    rows,
    totals: { grandOpen, grandReported, byBucket },
    validation: { ok: mismatches.length === 0 && grandOk !== false, grandOk, mismatches },
  }
}

const round2 = (n) => Math.round(n * 100) / 100

// Internal "- REP" accounts are rep draws, not customer receivables.
const isRepAccount = (name) => /\s-\s*REP\s*$/i.test(String(name).trim())

/**
 * Open invoices for commission/pending: Invoice-type rows with a positive open
 * balance, excluding internal REP accounts. Shaped for computeCommissions
 * (num, customer, amount, openBalance, dueDate).
 */
export function openInvoicesFromAging(parsed) {
  const out = []
  for (const r of parsed?.rows || []) {
    if (!/^invoice$/i.test(r.type)) continue
    if (r.openBalance <= 0.005) continue
    if (isRepAccount(r.customer)) continue
    out.push({ num: r.num, customer: r.customer, amount: r.amount, openBalance: r.openBalance, dueDate: r.dueDate })
  }
  return out
}
