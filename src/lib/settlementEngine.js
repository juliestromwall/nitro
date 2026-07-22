// Step 2 of the payment-first rework: turn per-invoice Open Balance snapshots
// (balanceSnapshotsStore) plus the payment/credit transactions into dated
// SETTLEMENT EVENTS that the commission layer (step 3) consumes.
// See docs/payment-first-spec.md.
//
// A settlement event:
//   { invoiceNum, customer, date, amount, kind, method, txnNum, needsReview }
//
//   kind:
//     'cash'      a Payment explains (part of) the balance drop → COMMISSIONABLE,
//                 dated to the payment, carries its method.
//     'credit'    a Credit Memo explains it → NOT commissionable.
//     'unapplied' the balance dropped between two OBSERVED snapshots with no
//                 matching payment/credit — an overpayment draw-down. Cash-
//                 equivalent → commissionable, dated to the settlement week.
//     'prior'     part of the drop from the invoice total down to the FIRST
//                 snapshot that no available transaction explains — settled
//                 before our snapshot history began. Commissionable, but the
//                 date is unknown here; step 3 dates it by the fallback rule.
//     'reversal'  the balance INCREASED (credit reversed / invoice amended).
//                 Flagged for review; not commissionable.
//
// For any invoice, the emitted event amounts sum to the total settled (invoice
// amount − current open balance), so step 3 gets full coverage with no double
// counting. Pure and dependency-free so it runs under node for verification.

export const DEFAULT_TOLERANCE = 1.0   // tightened from the old ±$5 amount-matcher

const round2 = (x) => Math.round(x * 100) / 100
const near = (a, b, tol) => Math.abs(a - b) <= tol
const sumNear = (nums, target, tol) => near(nums.reduce((s, n) => s + n, 0), target, tol)

// Normalize ISO (YYYY-MM-DD…), US (M/D/YYYY), or Date-parseable strings to a
// sortable YYYYMMDD integer for cheap ordering/window checks.
function dnum(s) {
  if (!s) return 0
  const t = String(s).trim()
  let m
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return +(m[1] + m[2] + m[3])
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)))
    return +(m[3] + String(m[1]).padStart(2, '0') + String(m[2]).padStart(2, '0'))
  // A bare number (e.g. an unconverted Excel date serial) is NOT a date we can
  // read — return unknown rather than let new Date() misparse it as a year.
  if (/^\d+$/.test(t)) return 0
  const d = new Date(t)
  if (!isNaN(d.getTime())) return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
  return 0
}
const onOrBefore = (date, windowEnd) => !date || dnum(date) <= dnum(windowEnd)

function mkEvent(drop, fields) {
  return {
    invoiceNum: drop.invoiceNum,
    customer: drop.customer,
    amount: round2(fields.amount),
    kind: fields.kind,
    date: fields.date || '',
    method: fields.method || '',
    txnNum: fields.txnNum || '',
    needsReview: !!fields.needsReview,
  }
}
// Event sourced from a matched settler transaction.
const evFromSettler = (drop, s, windowEnd) =>
  mkEvent(drop, { amount: s.amount, kind: s.kind, date: s.date || windowEnd, method: s.method, txnNum: s.txnNum })

// Classify one balance drop (`drop.D`) against the customer's settler pool,
// pushing one or more events onto `out`. Settlers are consumed (marked used).
function classifyDrop(drop, pool, tol, out) {
  const D = drop.D
  const windowEnd = drop.windowEnd
  const avail = () => pool.filter((s) => !s.used && onOrBefore(s.date, windowEnd))

  // 1. A single settler explains the whole drop.
  const single = avail().find((s) => near(s.amount, D, tol))
  if (single) { single.used = true; out.push(evFromSettler(drop, single, windowEnd)); return }

  // 2. All available cash payments sum to the drop (one invoice, several payments).
  const cash = avail().filter((s) => s.kind === 'cash')
  if (cash.length && sumNear(cash.map((s) => s.amount), D, tol)) {
    for (const s of cash) { s.used = true; out.push(evFromSettler(drop, s, windowEnd)) }
    return
  }

  // 3. Partial: consume cash (most recent first) without overshooting the drop,
  //    then explain / classify the remainder.
  let rem = D
  const consumed = []
  for (const s of cash.sort((a, b) => dnum(b.date) - dnum(a.date))) {
    if (rem <= tol) break
    if (s.amount <= rem + tol) { s.used = true; consumed.push(s); rem -= s.amount }
  }
  for (const s of consumed) out.push(evFromSettler(drop, s, windowEnd))

  if (rem > tol) {
    // A credit memo for the remainder?
    const credit = avail().find((s) => s.kind === 'credit' && near(s.amount, rem, tol))
    if (credit) { credit.used = true; out.push(evFromSettler(drop, credit, windowEnd)); return }
    // Unexplained. Baseline (pre-first-snapshot) remainder is 'prior' (can't be
    // dated here); a drop observed BETWEEN snapshots with no payment is an
    // overpayment draw-down → 'unapplied'.
    const kind = drop.isBaseline ? 'prior' : 'unapplied'
    out.push(mkEvent(drop, { amount: rem, kind, date: windowEnd }))
  }
}

export function computeSettlementEvents({
  snapshots = {},
  transactions = [],
  invoices = [],
  tolerance = DEFAULT_TOLERANCE,
} = {}) {
  const invByNum = new Map()
  for (const inv of invoices) if (inv?.num) invByNum.set(String(inv.num).trim(), inv)

  // Consumable settler pool per customer (Payments and Credit Memos).
  const settlersByCustomer = new Map()
  for (const t of transactions) {
    const type = String(t.type || '').trim().toLowerCase()
    const isPayment = type === 'payment'
    const isCredit = type === 'credit memo' || /^sc/i.test(String(t.num || '').trim())
    if (!isPayment && !isCredit) continue
    const cust = String(t.customer || '').trim()
    if (!settlersByCustomer.has(cust)) settlersByCustomer.set(cust, [])
    settlersByCustomer.get(cust).push({
      date: t.date || '',
      amount: Math.abs(Number(t.amount) || 0),
      kind: isPayment ? 'cash' : 'credit',
      method: t.method || '',
      txnNum: t.num || '',
      used: false,
    })
  }

  // Derive balance drops per invoice, grouped by customer.
  const dropsByCustomer = new Map()
  for (const [rawNum, rawPoints] of Object.entries(snapshots)) {
    const num = String(rawNum).trim()
    const points = [...(rawPoints || [])].sort((a, b) => String(a.asOf).localeCompare(String(b.asOf)))
    if (!points.length) continue
    const inv = invByNum.get(num)
    const customer = inv?.customer || ''
    const amount = inv?.amount != null ? Number(inv.amount) : null
    const drops = []

    // Baseline: invoice total → first observed balance.
    if (amount != null) {
      const d0 = amount - Number(points[0].openBalance)
      if (d0 > tolerance) drops.push({ D: d0, windowEnd: points[0].asOf, isBaseline: true })
    }
    // Between consecutive snapshots.
    for (let i = 1; i < points.length; i++) {
      const d = Number(points[i - 1].openBalance) - Number(points[i].openBalance)
      if (d > tolerance) drops.push({ D: d, windowEnd: points[i].asOf, isBaseline: false })
      else if (d < -tolerance) drops.push({ D: d, windowEnd: points[i].asOf, isBaseline: false, reversal: true })
    }

    for (const dr of drops) {
      if (!dropsByCustomer.has(customer)) dropsByCustomer.set(customer, [])
      dropsByCustomer.get(customer).push({ invoiceNum: num, customer, ...dr })
    }
  }

  const events = []
  for (const [customer, drops] of dropsByCustomer.entries()) {
    // Oldest settlement first, so earlier windows consume earlier payments.
    drops.sort((a, b) => String(a.windowEnd).localeCompare(String(b.windowEnd)))
    const pool = settlersByCustomer.get(customer) || []
    for (const dr of drops) {
      if (dr.reversal) {
        events.push(mkEvent(dr, { amount: Math.abs(dr.D), kind: 'reversal', date: dr.windowEnd, needsReview: true }))
        continue
      }
      classifyDrop(dr, pool, tolerance, events)
    }
  }

  const byInvoice = {}
  for (const e of events) (byInvoice[e.invoiceNum] ||= []).push(e)

  const stats = { cash: 0, credit: 0, unapplied: 0, prior: 0, reversal: 0, total: events.length }
  const amountByKind = { cash: 0, credit: 0, unapplied: 0, prior: 0, reversal: 0 }
  for (const e of events) { stats[e.kind]++; amountByKind[e.kind] += e.amount }

  return { events, byInvoice, stats, amountByKind, tolerance }
}
