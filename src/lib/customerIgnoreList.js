// Customer names to skip entirely when parsing QuickBooks CSV exports.
// These are NOT real customer accounts — they're internal QB entries, rep
// placeholders, promo/sample orders, employee orders, etc. Skipping them at
// parse time means they never enter the dataset → no clutter in invoice lists,
// no spurious entries in unmatched-customers banners, no commission calc.
//
// Each entry is either an EXACT match (case-insensitive) or a CONTAINS match
// (substring, case-insensitive). Use `exact` for short / generic names where
// substring would over-match (e.g. "PROMO" shouldn't kill "PROMOTIONAL ITEM").
// Use `contains` for patterns that have variants (e.g. "Nitro AG" matches
// "Nitro AG, Customer USD" and any future variant).
//
// Changes take effect on the NEXT CSV upload — existing in-memory data
// isn't filtered retroactively.

export const CUSTOMER_IGNORE_LIST = {
  exact: [
    '00 - PayInvoice',
    'PROMO',
    'NITRO SNOWBOARDS CANADA',
  ],
  contains: [
    'Nitro AG',          // catches "Nitro AG, Customer USD" and variants
    'Foundry Employee',  // catches all employee-order customer records
  ],
}

const norm = (s) => String(s || '').trim().toLowerCase()

export function shouldIgnoreCustomer(name) {
  if (!name) return false
  const n = norm(name)
  for (const e of CUSTOMER_IGNORE_LIST.exact) {
    if (norm(e) === n) return true
  }
  for (const c of CUSTOMER_IGNORE_LIST.contains) {
    if (n.includes(norm(c))) return true
  }
  return false
}

// WSR buying-group quirk:
// When an invoice for a WSR member gets paid, QuickBooks rewrites the customer
// name on that invoice to just "WSR" (dropping the member's name). The invoice
// number stays the same. We detect that rename on append and preserve the
// original member name so the same invoice doesn't lose its territory routing
// when it flips from Open → Paid.
export function isWsrPostPaymentCustomer(name) {
  if (!name) return false
  const n = norm(name)
  return n === 'wsr' || n === 'wsr group' || n === 'wsr buying group'
}
