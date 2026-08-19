// Which payment method to show against a COLLECTED payment event.
//
// The cash-basis "Sales by Customer Detail" report says an invoice was paid and
// when, but not HOW. The method lives in the payments-transaction upload, which
// PaymentsTracker already joins to invoices as paymentEventsByInvoiceNum.
//
// Regression this exists to prevent: the method pill was added to the rep
// ledger, then silently died when that ledger moved to collected data — the new
// path built every event with `paymentMethod: ''` hardcoded, so the render
// guard never fired and the pill vanished with nothing to explain why.
//
// One collected event can cover several payments, so:
//   - prefer the payment whose date matches the collected event's date
//   - else, when every payment used the same method, use it
//   - else show them all ("Check / Sky ACH") rather than picking one and lying

// Normalize to YYYY-MM-DD. Payment dates arrive ISO from some sources and
// M/D/YYYY from the QBO report, so both shapes have to compare equal.
function isoDay(s) {
  if (!s) return ''
  const str = String(s)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return ''
  const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${yyyy}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

/**
 * @param events       payment events for the invoice — [{ date, method, ... }]
 * @param paymentDate  the collected event's payment date
 * @returns a display string, or '' when nothing is known (render guards on this)
 */
export function collectedPaymentMethod(events, paymentDate) {
  const withMethod = (events || []).filter((e) => e?.method)
  if (!withMethod.length) return ''

  const day = isoDay(paymentDate)
  if (day) {
    const sameDay = withMethod.filter((e) => isoDay(e.date) === day)
    if (sameDay.length) return [...new Set(sameDay.map((e) => e.method))].join(' / ')
  }

  // No payment on that exact day — the collected report and the payments file
  // can disagree (deposit vs clearing date). Showing what we know beats
  // showing nothing.
  return [...new Set(withMethod.map((e) => e.method))].join(' / ')
}

/**
 * Index a payments-transaction upload by normalized customer, for the fallback
 * below. Only rows that actually carry a method are worth keeping.
 *
 * @param transactions  parsed paymentsTx — [{ customer, date, type, amount, method }]
 * @param normCustomer  the app's customer-name normalizer
 */
export function paymentsByCustomer(transactions, normCustomer) {
  const out = new Map()
  for (const t of transactions || []) {
    if (!t?.method || !t.customer) continue
    if (t.type && /invoice|credit memo/i.test(t.type)) continue   // not a payment
    const k = normCustomer(t.customer)
    if (!k) continue
    if (!out.has(k)) out.set(k, [])
    out.get(k).push({ date: t.date, amount: t.amount, method: t.method })
  }
  return out
}

/**
 * The method for a collected payment event, preferring the invoice-level link
 * and falling back to "what this customer paid with on this day".
 *
 * The fallback is needed because the invoice→payment auto-matcher compares a
 * payment against the invoice total within $5, and CREDIT MEMOS break that: EVO's
 * SI-127329 was invoiced at $67,453.20, credited $673.24, and paid $66,779.96 —
 * $673.24 outside tolerance, so no phase matched and the method was unreachable
 * even though it sat in the same upload.
 *
 * Customer + day is a weaker key than invoice number, but it cannot invent a
 * method that the customer didn't use that day, and when they used more than
 * one it shows all of them rather than guessing.
 */
export function paymentMethodForEvent({ invoiceEvents, customerPayments, paymentDate }) {
  const direct = collectedPaymentMethod(invoiceEvents, paymentDate)
  if (direct) return direct

  const day = isoDay(paymentDate)
  if (!day) return ''
  const sameDay = (customerPayments || []).filter((p) => p?.method && isoDay(p.date) === day)
  if (!sameDay.length) return ''
  return [...new Set(sameDay.map((p) => p.method))].join(' / ')
}
