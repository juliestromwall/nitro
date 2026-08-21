// Matches PAYMENTS to INVOICES, per customer, from the payments-transaction
// upload. QuickBooks does not tell us which invoice a payment settled, so this
// infers it from amounts. Anything it cannot resolve stays absent — a strict
// no-manual-data policy, so a wrong guess never becomes a payment record.
//
// Extracted from PaymentsTracker so the phases can be tested. It decides which
// invoices show a payment date and payment method, and it feeds the rep
// statement, so silent misses here are expensive: see the CREDIT MEMO note on
// creditPoolFor below.
//
// Phases, per customer, in order:
//   A  one payment settles one invoice
//   B  N identical installments sum to one invoice
//   C  a small subset of payments sums to one invoice
//   D  one payment settles a GROUP of invoices (the inverse of C)

// Customer-name normalization — must match the app's other customer matching.
export function normCustomerName(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/['']/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+-\s.*$/, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// How close an amount has to be to count as a match.
const TOLERANCE = 5

/**
 * Credit memos issued to a customer, as a positive pool.
 *
 * WHY: a credit memo reduces what the customer actually pays, but the invoice
 * still carries its full amount. The matcher compares a payment against the
 * invoice within $5, so any credit larger than that breaks the match and the
 * invoice ends up with NO payment event at all — no date, no method, and
 * missing from the rep's statement.
 *
 * Real case, EVO / SI-127329: invoiced $67,453.20, four credit memos totalling
 * $673.24, paid $66,779.96. $673.24 outside tolerance, so every phase missed.
 *
 * The pool is consumed as it is used, so a customer's credits can explain a
 * shortfall once, not once per invoice.
 */
export function creditPoolFor(transactions) {
  let pool = 0
  for (const tx of transactions || []) {
    if (!/credit memo/i.test(tx?.type || '')) continue
    pool += Math.abs(tx.amount || 0)
  }
  return pool
}

/**
 * @param paymentsTx          parsed payments-transaction rows
 * @param invoices            invoice dataset ({ num, customer, amount, openBalance })
 * @param wsrInvoicePayments  Map<invoiceNum, [{ checkDate, amountPaid }]> — authoritative
 * @returns Map<invoiceNum, [{ date, amount, source, method }]>
 */
export function matchPaymentsToInvoices({ paymentsTx = [], invoices = [], wsrInvoicePayments = new Map() } = {}) {
  const result = new Map()
  const add = (num, ev) => {
    if (!result.has(num)) result.set(num, [])
    result.get(num).push(ev)
  }
  // 1. WSR remittance — push each line as an event.
  for (const [num, events] of wsrInvoicePayments.entries()) {
    for (const ev of events) add(num, { date: ev.checkDate, amount: ev.amountPaid || 0, source: 'wsr', method: 'WSR' })
  }
  if (!paymentsTx?.length || !invoices?.length) {
    for (const arr of result.values()) arr.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    return result
  }
  const norm = normCustomerName
  const paymentsByCust = new Map()
  for (const tx of paymentsTx) {
    if (tx.type !== 'Payment') continue
    if (!tx.customer || !tx.date) continue
    const k = norm(tx.customer)
    if (!paymentsByCust.has(k)) paymentsByCust.set(k, [])
    paymentsByCust.get(k).push(tx)
  }
  for (const arr of paymentsByCust.values()) arr.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  // Credit memos, pooled per customer. See creditPoolFor: a credit reduces what
  // the customer pays while the invoice keeps its full amount, so without this
  // the shortfall reads as a failed match and the invoice gets no payment event.
  const creditByCust = new Map()
  for (const tx of paymentsTx) {
    if (!/credit memo/i.test(tx?.type || '')) continue
    if (!tx.customer) continue
    const k = norm(tx.customer)
    creditByCust.set(k, (creditByCust.get(k) || 0) + Math.abs(tx.amount || 0))
  }
  const invoicesByCust = new Map()
  for (const inv of invoices) {
    if (!inv.customer || !inv.num || !inv.amount) continue
    const paidPortion = (inv.amount || 0) - (inv.openBalance || 0)
    if (paidPortion <= 0.005) continue
    if (result.has(inv.num)) continue   // WSR already covers this invoice
    const k = norm(inv.customer)
    if (!invoicesByCust.has(k)) invoicesByCust.set(k, [])
    invoicesByCust.get(k).push({ ...inv, paidPortion })
  }
  for (const [custKey, invs] of invoicesByCust.entries()) {
    const payments = paymentsByCust.get(custKey) || []
    if (!payments.length) continue
    invs.sort((a, b) => b.paidPortion - a.paidPortion)
    const used = new Set()
    // Credit available to explain shortfalls for THIS customer. Consumed as it
    // is used, so one credit cannot excuse the same gap on two invoices.
    let creditLeft = creditByCust.get(custKey) || 0
    // Phase A: single-payment match.
    for (const inv of invs) {
      const target = inv.paidPortion
      let bestIdx = -1, bestDiff = Infinity
      for (let i = 0; i < payments.length; i++) {
        if (used.has(i)) continue
        const diff = Math.abs((payments[i].amount || 0) - target)
        if (diff <= TOLERANCE && diff < bestDiff) { bestIdx = i; bestDiff = diff }
      }
      // Nothing landed within tolerance. A payment that falls SHORT by no more
      // than the remaining credit is still this invoice — the customer paid the
      // balance after credits were applied. Only a shortfall qualifies; an
      // OVERpayment is a different situation and stays unmatched.
      if (bestIdx < 0 && creditLeft > TOLERANCE) {
        let shortIdx = -1, bestShortfall = Infinity
        for (let i = 0; i < payments.length; i++) {
          if (used.has(i)) continue
          const shortfall = target - (payments[i].amount || 0)
          if (shortfall > TOLERANCE && shortfall <= creditLeft + TOLERANCE && shortfall < bestShortfall) {
            shortIdx = i; bestShortfall = shortfall
          }
        }
        if (shortIdx >= 0) {
          const p = payments[shortIdx]
          // Record what was actually PAID, not the invoice total — a credit is
          // not money received.
          add(inv.num, { date: p.date, amount: p.amount || 0, source: 'auto-single-credited', method: p.method || '' })
          used.add(shortIdx)
          creditLeft = Math.max(0, creditLeft - bestShortfall)
          continue
        }
      }
      if (bestIdx >= 0) {
        const p = payments[bestIdx]
        add(inv.num, { date: p.date, amount: p.amount || 0, source: 'auto-single', method: p.method || '' })
        used.add(bestIdx)
      }
    }
    // Phase B: N identical installments sum to paid portion.
    for (const inv of invs) {
      if (result.has(inv.num)) continue
      const target = inv.paidPortion
      const byAmt = new Map()
      for (let i = 0; i < payments.length; i++) {
        if (used.has(i)) continue
        const cents = Math.round((payments[i].amount || 0) * 100)
        if (!byAmt.has(cents)) byAmt.set(cents, [])
        byAmt.get(cents).push(i)
      }
      for (const [cents, indices] of byAmt) {
        const amt = cents / 100
        if (amt <= 0) continue
        const n = Math.round(target / amt)
        if (n < 2 || n > indices.length) continue
        if (Math.abs(n * amt - target) > 5) continue
        for (let j = 0; j < n; j++) {
          const p = payments[indices[j]]
          add(inv.num, { date: p.date, amount: p.amount || 0, source: 'auto-installments', method: p.method || '' })
          used.add(indices[j])
        }
        break
      }
    }
    // Phase C: small subset of distinct payments summing to paid portion.
    for (const inv of invs) {
      if (result.has(inv.num)) continue
      const target = inv.paidPortion
      const available = []
      for (let i = 0; i < payments.length; i++) if (!used.has(i)) available.push(i)
      if (available.length === 0 || available.length > 12) continue
      const n = available.length
      let bestMask = 0, bestDiff = Infinity, bestCount = Infinity
      for (let mask = 1; mask < (1 << n); mask++) {
        let sum = 0, count = 0
        for (let i = 0; i < n; i++) {
          if (mask & (1 << i)) { sum += payments[available[i]].amount || 0; count++ }
        }
        const diff = Math.abs(sum - target)
        if (diff <= 5 && (diff < bestDiff || (diff === bestDiff && count < bestCount))) {
          bestMask = mask
          bestDiff = diff
          bestCount = count
        }
      }
      if (bestMask) {
        for (let i = 0; i < n; i++) {
          if (bestMask & (1 << i)) {
            const idx = available[i]
            const p = payments[idx]
            add(inv.num, { date: p.date, amount: p.amount || 0, source: 'auto-subset', method: p.method || '' })
            used.add(idx)
          }
        }
      }
    }
    // Phase D: one payment settles a GROUP of invoices (a single lump-sum
    // check covering several invoices at once — the inverse of Phase C).
    // Match an unused payment to a subset of still-unmatched invoices whose
    // paid portions sum to the payment amount, then date each of those
    // invoices to that payment. Without this, a customer who clears several
    // invoices with one check leaves them all unmatched (no payment date),
    // and their commission never flows into the rep's earned/available.
    for (let pi = 0; pi < payments.length; pi++) {
      if (used.has(pi)) continue
      const payAmt = payments[pi].amount || 0
      if (payAmt <= 0) continue
      const open = invs.filter(inv => !result.has(inv.num))
      if (open.length < 2 || open.length > 14) continue   // single-invoice case is Phase A's job
      const m = open.length
      let bestMask = 0, bestDiff = Infinity, bestCount = -1
      for (let mask = 1; mask < (1 << m); mask++) {
        let sum = 0, count = 0
        for (let i = 0; i < m; i++) if (mask & (1 << i)) { sum += open[i].paidPortion; count++ }
        if (count < 2) continue   // need 2+ invoices to be a "group"
        const diff = Math.abs(sum - payAmt)
        // Prefer the closest sum; break ties toward covering MORE invoices.
        if (diff <= 5 && (diff < bestDiff || (diff === bestDiff && count > bestCount))) {
          bestMask = mask; bestDiff = diff; bestCount = count
        }
      }
      if (bestMask) {
        for (let i = 0; i < m; i++) {
          if (bestMask & (1 << i)) add(open[i].num, { date: payments[pi].date, amount: open[i].paidPortion, source: 'auto-group', method: payments[pi].method || '' })
        }
        used.add(pi)
      }
    }
  }
  for (const arr of result.values()) arr.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  return result
}
