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
