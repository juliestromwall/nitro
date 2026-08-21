// Weekly warehouse shipping report — the pipeline from booked to shipped.
//
// Replaces a hand-kept spreadsheet where each week meant duplicating a sheet,
// renaming it to the Friday date, and typing in new numbers. Two Brightpearl
// exports produce the whole thing.
//
// THE PIPELINE. An order's Brightpearl tag IS its stage, and it moves through
// exactly one at a time:
//
//   1. TO PRINT   2027 Booking · Back order · Internal Order US · US Promo Order
//   2. PRINTED    Order Printed — picked and packed, not yet invoiced
//   3. SHIPPED    Invoiced — out the door and billed
//
// SHIP DATE. Comes from Brightpearl's TAX DATE ("18 Aug 2026"), never from
// "Date created". Date created is when the ORDER was written; for a pre-book
// that's the January–February booking window, a median 180 days earlier. Using
// it would report pre-book entry activity as shipping.
//
// WHY VALUE MATTERS ALONGSIDE COUNT. Order count alone can't tell a heavy week
// from a light one: in real data, 24 Jul was 6 orders worth $217,873 ($36,312
// each) while 5 Jun was 8 orders worth $270. Every week therefore carries its
// value and average order size.

import { parseOrderRef } from './brightpearlOrders.js'

// Brand from the Ref code's first letter(s) — L1 carries a digit, so it is
// checked before the single-letter map.
const BRAND_BY_LETTER = { N: 'NITRO', A: 'Autumn', E: 'Eivy', C: 'Corduroy', L: 'L1' }
export const UNRESOLVED_BRAND = 'Unresolved Ref'

export function brandOfRef(ref) {
  const { code } = parseOrderRef(ref)
  if (!code) return UNRESOLVED_BRAND
  if (code.startsWith('L1')) return 'L1'
  return BRAND_BY_LETTER[code[0]] || UNRESOLVED_BRAND
}

// An order is "packed" when its tag says printed; everything else not yet
// invoiced is still waiting to be picked.
export function isPrinted(status) {
  return /printed/i.test(String(status || ''))
}

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }
const MONTH_LABEL = Object.keys(MONTHS)

/** Parse Brightpearl's tax date, "18 Aug 2026". Returns a UTC Date or null. */
export function parseTaxDate(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})/)
  if (!m || !(m[2] in MONTHS)) return null
  return new Date(Date.UTC(+m[3], MONTHS[m[2]], +m[1]))
}

/** The Friday ending the week a date falls in — how the warehouse counts weeks. */
export function weekEndingFriday(d) {
  const f = new Date(d)
  f.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7))
  return f
}

// Customer names arrive with bookkeeping noise attached.
function cleanCustomer(s) {
  return String(s || '')
    .replace(/\s+Accounts Payable/i, '')
    .replace(/\s+-\s+DIRECTIVE/i, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function tally(rows, keyFn) {
  const m = new Map()
  for (const r of rows) {
    const k = keyFn(r)
    if (k == null) continue
    const a = m.get(k) || { key: k, orders: 0, value: 0 }
    a.orders++; a.value += r.total || 0
    m.set(k, a)
  }
  return [...m.values()]
}

/**
 * @param openOrders  every order NOT yet invoiced (parse with requireInvoice:false)
 * @param shipped     invoiced orders, with the Tax date column
 * @returns the whole report — stages, weeks (with customers), brand and tag splits
 */
export function buildShippingReport({ openOrders = [], shipped = [] } = {}) {
  const printed = openOrders.filter((r) => isPrinted(r.status))
  const toPrint = openOrders.filter((r) => !isPrinted(r.status))

  const sum = (rows) => rows.reduce((s, r) => s + (r.total || 0), 0)
  const stages = {
    toPrint: { orders: toPrint.length, value: sum(toPrint) },
    printed: { orders: printed.length, value: sum(printed) },
    shipped: { orders: shipped.length, value: sum(shipped) },
  }
  const season = {
    orders: openOrders.length + shipped.length,
    value: sum(openOrders) + sum(shipped),
  }
  // Percentages are OF VALUE — a stage holding a few large orders matters more
  // than one holding many small ones.
  const pct = (v) => (season.value > 0 ? (v / season.value) * 100 : 0)
  const share = {
    shipped: pct(stages.shipped.value),
    printed: pct(stages.printed.value),
    toPrint: pct(stages.toPrint.value),
  }

  // ── Weeks, newest last, each with its own customer detail ────────────────
  const weekMap = new Map()
  let undated = 0
  for (const r of shipped) {
    const t = parseTaxDate(r.taxDate)
    if (!t) { undated++; continue }
    const f = weekEndingFriday(t)
    const key = f.toISOString().slice(0, 10)
    if (!weekMap.has(key)) {
      weekMap.set(key, {
        key,
        label: `${MONTH_LABEL[f.getUTCMonth()]} ${f.getUTCDate()}`,
        orders: 0, value: 0, custMap: new Map(),
      })
    }
    const w = weekMap.get(key)
    w.orders++; w.value += r.total || 0
    const name = cleanCustomer(r.customer)
    if (!w.custMap.has(name)) {
      w.custMap.set(name, {
        customer: name.replace(/\s*\(WSR\)/i, ''),
        wsr: /\(WSR\)/i.test(r.customer || ''),
        orders: 0, value: 0, brands: new Set(),
      })
    }
    const c = w.custMap.get(name)
    c.orders++; c.value += r.total || 0
    c.brands.add(brandOfRef(r.ref))
  }
  const weeks = [...weekMap.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((w) => ({
      key: w.key,
      label: w.label,
      orders: w.orders,
      value: w.value,
      avgOrder: w.orders ? w.value / w.orders : 0,
      customers: [...w.custMap.values()]
        .sort((a, b) => b.value - a.value)
        .map((c) => ({ ...c, brands: [...c.brands].sort() })),
    }))

  // ── Splits ───────────────────────────────────────────────────────────────
  const shippedByBrand = new Map(tally(shipped, (r) => brandOfRef(r.ref)).map((x) => [x.key, x]))
  const byBrand = tally(openOrders, (r) => brandOfRef(r.ref))
    .map((x) => ({
      brand: x.key,
      leftOrders: x.orders,
      leftValue: x.value,
      shippedOrders: shippedByBrand.get(x.key)?.orders || 0,
      shippedValue: shippedByBrand.get(x.key)?.value || 0,
    }))
    .sort((a, b) => b.leftValue - a.leftValue)

  const byTag = tally(toPrint, (r) => r.status || '(untagged)')
    .map((x) => ({ tag: x.key, orders: x.orders, value: x.value }))
    .sort((a, b) => b.orders - a.orders)

  const byOrderType = tally(openOrders, (r) => r.orderType)
    .map((x) => ({ type: x.key, orders: x.orders, value: x.value }))
    .sort((a, b) => b.value - a.value)

  return { stages, season, share, weeks, byBrand, byTag, byOrderType, undated }
}
