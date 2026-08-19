// Parser for the Brightpearl "Invoiced" sales-order export.
//
// WHY THIS EXISTS
// Brightpearl is where an order's TYPE lives — pre-book, ATS, closeout, promo,
// warranty — and that type changes what commission is owed. The obvious carrier,
// the order's tag ("2027 Booking"), is destroyed at invoicing: it flips to
// "Invoiced" and Brightpearl keeps no tag history. So the tag cannot be read
// after the fact, which is exactly when commission is computed.
//
// The durable carrier is the Ref field, which survives invoicing and encodes
// brand + order type as a short code:
//
//     US - NB-2027 PO# 4532139166
//          ^^ ^^^^     ^^^^^^^^^^
//          |  season   PO / customer reference
//          Nitro Booking
//
// Measured against 1252 orders known to be pre-book (they still carried the
// tag) and 662 invoiced orders: the code identifies pre-book on 98.7% of them.
// The order NOTES are a much weaker signal and must not be used — NB orders say
// "PREBOOK" in the notes 97.8% of the time but AB (Autumn, the LARGEST pre-book
// brand at 617 orders) says it only 17.9% of the time. Classifying on notes
// would silently misclassify ~4 of every 5 Autumn pre-books.
//
// The export also carries Order ID (the Brightpearl sales-order number) and the
// PO number inside Ref — the two fields that would otherwise have to be pushed
// into QuickBooks custom fields to reach this app.

// Explicit .js so this module resolves under `node --test` as well as Vite.
import { parseCSVLine, splitCSVRows } from './csv.js'

// ── Ref code taxonomy ─────────────────────────────────────────────────────
// Codes are <BRAND><TYPE>: brand is N=Nitro, A=Autumn, E=Eivy, C=Corduroy,
// L=L1; type is B=Booking, IS=In-Stock, P/PD=Promo, CO/C=CloseOut, W=Warranty,
// RB=Rental Booking. Legend confirmed by Tony 2026-08-19.
export const ORDER_TYPE = {
  PREBOOK: 'prebook',
  ATS: 'ats',
  CLOSEOUT: 'closeout',
  PROMO: 'promo',
  WARRANTY: 'warranty',
  UNCODED: 'uncoded',
}

const CODE_TYPES = {
  // Pre-book (a sales order written in the Jan–Feb booking window)
  AB: ORDER_TYPE.PREBOOK, NB: ORDER_TYPE.PREBOOK, EB: ORDER_TYPE.PREBOOK,
  CB: ORDER_TYPE.PREBOOK, LB: ORDER_TYPE.PREBOOK, NRB: ORDER_TYPE.PREBOOK,
  // Available-to-ship / in-stock
  NIS: ORDER_TYPE.ATS, AIS: ORDER_TYPE.ATS, EIS: ORDER_TYPE.ATS,
  CIS: ORDER_TYPE.ATS, LIS: ORDER_TYPE.ATS,
  // Closeout — NC and NCO both mean closeout.
  NCO: ORDER_TYPE.CLOSEOUT, NC: ORDER_TYPE.CLOSEOUT,
  ACO: ORDER_TYPE.CLOSEOUT, ECO: ORDER_TYPE.CLOSEOUT, CCO: ORDER_TYPE.CLOSEOUT,
  // Promo — no commission.
  NP: ORDER_TYPE.PROMO, AP: ORDER_TYPE.PROMO, EP: ORDER_TYPE.PROMO,
  CP: ORDER_TYPE.PROMO, LP: ORDER_TYPE.PROMO,
  NPD: ORDER_TYPE.PROMO, APD: ORDER_TYPE.PROMO,
  // L1's brand letter carries a DIGIT, so its codes are L1B / L1IS / L1P
  // rather than LB / LIS / LP. Missing these classed real L1 orders as
  // uncoded and parked their commission in review.
  L1B: ORDER_TYPE.PREBOOK, L1IS: ORDER_TYPE.ATS, L1P: ORDER_TYPE.PROMO,
  L1W: ORDER_TYPE.WARRANTY, L1CO: ORDER_TYPE.CLOSEOUT,
  // Warranty — no commission.
  NW: ORDER_TYPE.WARRANTY, AW: ORDER_TYPE.WARRANTY,
  EW: ORDER_TYPE.WARRANTY, CW: ORDER_TYPE.WARRANTY,
  // Rare one-offs Tony classed as typos/promo — treated as promo (no
  // commission) rather than review, so they don't create noise. Revisit if
  // volume climbs.
  NRO: ORDER_TYPE.PROMO, ARO: ORDER_TYPE.PROMO, NOS: ORDER_TYPE.PROMO,
}

// Codes that earn nothing at all.
const NON_COMMISSIONABLE = new Set([ORDER_TYPE.PROMO, ORDER_TYPE.WARRANTY])

export function isNonCommissionable(orderType) {
  return NON_COMMISSIONABLE.has(orderType)
}

// ── Ref parsing ───────────────────────────────────────────────────────────
// Real Refs vary more than the convention suggests. All of these are valid and
// all appear in production data:
//
//   US - NB-2027 PO# 4532139166             the convention
//   US - L1IS-2026 PO#2526 Sale Rack        L1's brand letter carries a DIGIT
//   US - AB - SPRING 2026 PO#OR-1095198     words between the code and the year
//   US - 2026-NIS-DAVE BENDER               year and code transposed
//   REVIEW DEALER APP: US - AB-2027 PO#x    prefixed with unrelated text
//   NW promo- Ellery Srofe                  no country prefix, no year at all
//
// So rather than pin the code to a position or require it to sit next to the
// year, TOKENIZE and take the first token that is a KNOWN code. The legend is a
// closed set, which is what makes this safe: free text like "Tone Stallone hat
// promo" or "TONY FAMILY GEAR" yields no known token and stays UNCODED. An
// earlier position-based regex silently misclassified every L1 order and every
// "AB - SPRING" order as uncoded, parking real commission in review.
const NOT_A_CODE = new Set(['US', 'PO', 'CA', 'INV', 'SI', 'USA'])

const RE_YEAR = /\b(20\d{2})\b/

/**
 * Pull the type code and season year out of a Brightpearl Ref.
 * @returns { code, year } — code is null when no known code token is present.
 */
export function parseOrderRef(ref) {
  const s = String(ref || '').toUpperCase()
  if (!s.trim()) return { code: null, year: null }

  const year = (RE_YEAR.exec(s) || [])[1] || null

  // Split on anything that isn't alphanumeric, so "L1IS-2026", "AB - SPRING"
  // and "PO#NB" all surrender their tokens.
  for (const tok of s.split(/[^A-Z0-9]+/)) {
    if (!tok || NOT_A_CODE.has(tok)) continue
    if (Object.prototype.hasOwnProperty.call(CODE_TYPES, tok)) {
      return { code: tok, year }
    }
  }
  return { code: null, year }
}

/**
 * Classify a Ref into an ORDER_TYPE. Refs that don't follow the convention, and
 * codes outside the legend, come back UNCODED — those are flagged for review
 * rather than silently zeroed, so a mistyped Ref is visible instead of quietly
 * costing a rep their commission.
 */
export function orderTypeOfRef(ref) {
  const { code } = parseOrderRef(ref)
  if (!code) return ORDER_TYPE.UNCODED
  return CODE_TYPES[code] || ORDER_TYPE.UNCODED
}

// The customer's PO sits after "PO#" in the Ref on most orders.
const RE_PO = /PO\s*#\s*([^\s].*)$/i

export function poNumberFromRef(ref) {
  const m = RE_PO.exec(String(ref || '').trim())
  return m ? m[1].trim() : ''
}

// ── CSV ───────────────────────────────────────────────────────────────────
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

// Header names as Brightpearl exports them.
const COLS = {
  orderId: ['order id'],
  invoice: ['invoice'],
  ref: ['ref'],
  status: ['status'],
  customer: ['customer'],
  total: ['total'],
  paid: ['paid'],
  dateCreated: ['date created'],
  notes: ['order notes'],
}

function headerIndex(cells) {
  const idx = {}
  const lower = cells.map(norm)
  for (const [key, names] of Object.entries(COLS)) {
    for (const name of names) {
      const i = lower.indexOf(name)
      if (i >= 0) { idx[key] = i; break }
    }
  }
  return idx
}

const money = (s) => {
  const n = parseFloat(String(s || '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Parse a Brightpearl invoiced-orders CSV export.
 *
 * @returns {
 *   byInvoice: { [invoiceNum]: { invoice, orderId, ref, code, orderType, poNumber, customer, total, paid, dateCreated } },
 *   rows:      the same records as an array,
 *   counts:    { [orderType]: n },
 *   skipped:   rows with no invoice number (not yet invoiced),
 * }
 */
export function parseBrightpearlOrders(text) {
  const rows = splitCSVRows(String(text || ''))
  if (!rows.length) return { byInvoice: {}, rows: [], counts: {}, skipped: 0 }

  // Strip a BOM if the export carries one.
  const header = parseCSVLine(rows[0].replace(/^\uFEFF/, ''))
  const idx = headerIndex(header)
  if (idx.invoice == null || idx.ref == null) {
    throw new Error('Not a Brightpearl order export — expected "Invoice" and "Ref" columns.')
  }

  const out = []
  const byInvoice = {}
  const counts = {}
  let skipped = 0

  for (let i = 1; i < rows.length; i++) {
    const cells = parseCSVLine(rows[i])
    if (!cells.length) continue
    const at = (k) => (idx[k] != null ? (cells[idx[k]] || '').trim() : '')

    const invoice = at('invoice')
    if (!invoice) { skipped++; continue }   // still open — no invoice assigned yet

    const ref = at('ref')
    const { code } = parseOrderRef(ref)
    const orderType = orderTypeOfRef(ref)

    const rec = {
      invoice,
      orderId: at('orderId'),
      ref,
      code,
      orderType,
      poNumber: poNumberFromRef(ref),
      customer: at('customer'),
      total: money(at('total')),
      paid: money(at('paid')),
      dateCreated: at('dateCreated'),
      notes: at('notes'),
    }
    out.push(rec)
    byInvoice[invoice] = rec
    counts[orderType] = (counts[orderType] || 0) + 1
  }

  return { byInvoice, rows: out, counts, skipped }
}
