// Parser for the QuickBooks Online cash-basis "Sales by Customer Detail" report.
//
// This is the authoritative source for commission attribution (Stage 1): every
// row is dated to the payment date and the Amount column is the PAID portion of
// that line, so the report states exactly how each payment split across invoices
// and line items. We resolve each line to a brand, separate non-commissionable
// lines (shipping / tax / interest), and allocate discounts to their invoice's
// brand — turning "infer the split from Open-Balance deltas" into "read it".
//
// See docs/commission-attribution-spec.md. Validated against real QBO exports:
// reproduces the report's own per-customer and grand totals to the penny.

import { parseCSVLine, splitCSVRows } from './csv.js'
import { lookupBrand } from './catalogs.js'

const round2 = (n) => Math.round(n * 100) / 100
const toNum = (s) => {
  const n = parseFloat(String(s ?? '').replace(/[$,\s]/g, ''))
  return Number.isNaN(n) ? 0 : n
}
const isDate = (s) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(s ?? '').trim())

// Line kinds. 'brand' is commissionable; everything else is separated out.
export const LINE_KINDS = ['brand', 'shipping', 'tax', 'interest', 'discount', 'rental', 'unmatched']

// Classify a line that did NOT resolve to a catalog brand.
function classifyNonBrand(sku, description) {
  const s = String(sku ?? '').trim()
  const t = `${s} ${description ?? ''}`.toLowerCase()
  if (t.includes('shipping')) return 'shipping'
  if (/sales tax|total tax/.test(t)) return 'tax'
  if (t.includes('interest')) return 'interest'
  if (t.includes('discount')) return 'discount'
  if (/^np/i.test(s)) return 'rental' // Nitro parts / rental SKUs (NP…)
  if (/^[a-z]{1,4}\d/i.test(s)) return 'unmatched' // looks like a product SKU but no catalog match → review
  return 'rental' // misc non-brand items
}

// Column layout (0-indexed) of a data row in this report.
const COL = { date: 1, type: 2, num: 3, sku: 4, description: 5, qty: 6, price: 7, amount: 8 }

/**
 * Parse the cash-basis "Sales by Customer Detail" CSV text.
 *
 * Returns:
 *   meta      { company, report, period }
 *   lines     [{ customer, invoice, date, sku, description, qty, paidAmount, kind, brand, season }]
 *   customers [{ name, paidTotal, reportedTotal, byBrand:{brand:net}, other:{kind:amt}, invoices:[num] }]
 *   totals    { grandParsed, grandReported, byBrand:{brand:net} }
 *   review    [{ customer, invoice, sku, description, paidAmount }]   // unmatched brandable SKUs
 *   validation{ ok, grandOk, mismatches:[{customer, parsed, reported}] }
 */
export function parseSalesDetail(csvText) {
  const rows = splitCSVRows(String(csvText || ''))
  const preHeader = []
  let started = false
  let customer = null

  const lines = []
  const reportedByCustomer = {}
  const occ_ = new Map()   // per-report occurrence counts for the de-dup key
  let grandReported = null

  for (const raw of rows) {
    if (!raw || !raw.trim()) continue
    const c = parseCSVLine(raw)
    const a = (c[0] || '').trim()

    if (!started) {
      if ((c[COL.date] || '').trim() === 'Transaction date') { started = true; continue }
      if (a) preHeader.push(a)
      continue
    }

    if (a === 'TOTAL') { grandReported = toNum(c[COL.amount]); continue }
    if (a.startsWith('Total for ')) {
      reportedByCustomer[a.replace('Total for ', '').trim()] = toNum(c[COL.amount])
      continue
    }
    // Customer group header: name in col A, no date in the date column.
    if (a && !isDate(c[COL.date])) { customer = a; continue }
    // Data line: blank col A, a real date, an Invoice transaction.
    if (!a && isDate(c[COL.date]) && /invoice/i.test(c[COL.type] || '')) {
      if (!customer) continue
      const invoice = (c[COL.num] || '').trim()
      const date = (c[COL.date] || '').trim()
      const sku = (c[COL.sku] || '').trim()
      const description = (c[COL.description] || '').trim()
      const paidAmount = toNum(c[COL.amount])
      const info = lookupBrand(sku)
      const kind = info ? 'brand' : classifyNonBrand(sku, description)
      // Stable de-dup fingerprint: invoice + sku + payment date + an occurrence
      // index (0-based, by row order) so identical lines on one invoice stay
      // distinct while the SAME line across overlapping reports collapses to one.
      const occKey = `${invoice}|${sku}|${date}`
      const occ = occ_ ? (occ_.get(occKey) || 0) : 0
      if (occ_) occ_.set(occKey, occ + 1)
      lines.push({
        key: `${occKey}|${occ}`,
        customer,
        invoice,
        date,
        sku,
        description,
        qty: toNum(c[COL.qty]),
        paidAmount,
        kind,
        brand: info ? info.brandName : null,
        season: info ? info.season : null,
      })
    }
  }

  // Roll up per customer, allocating each invoice's discount to its brand(s).
  const byCustomer = {}
  const linesByInvoice = new Map()
  for (const ln of lines) {
    const key = `${ln.customer} ${ln.invoice}`
    if (!linesByInvoice.has(key)) linesByInvoice.set(key, [])
    linesByInvoice.get(key).push(ln)
    byCustomer[ln.customer] ||= { name: ln.customer, paidTotal: 0, reportedTotal: reportedByCustomer[ln.customer] ?? null, byBrand: {}, other: {}, invoices: new Set() }
    byCustomer[ln.customer].paidTotal += ln.paidAmount
    byCustomer[ln.customer].invoices.add(ln.invoice)
  }

  for (const group of linesByInvoice.values()) {
    const cust = byCustomer[group[0].customer]
    const gross = {}
    let discount = 0
    for (const ln of group) {
      if (ln.kind === 'brand') gross[ln.brand] = (gross[ln.brand] || 0) + ln.paidAmount
      else if (ln.kind === 'discount') discount += ln.paidAmount // negative
      else cust.other[ln.kind] = (cust.other[ln.kind] || 0) + ln.paidAmount
    }
    const brands = Object.keys(gross)
    const grossTotal = brands.reduce((s, b) => s + gross[b], 0)
    for (const b of brands) {
      // Single-brand invoice → full discount; multi-brand → pro-rata by gross.
      const share = brands.length === 1 ? discount : (grossTotal ? (gross[b] / grossTotal) * discount : 0)
      cust.byBrand[b] = (cust.byBrand[b] || 0) + gross[b] + share
    }
    // Discount on an invoice with no brand line stays visible in `other`.
    if (!brands.length && discount) cust.other.discount = (cust.other.discount || 0) + discount
  }

  // Finalize: round, convert sets to arrays, build totals + validation.
  const totalsByBrand = {}
  const mismatches = []
  const customers = Object.values(byCustomer).map((cst) => {
    for (const b of Object.keys(cst.byBrand)) {
      cst.byBrand[b] = round2(cst.byBrand[b])
      totalsByBrand[b] = round2((totalsByBrand[b] || 0) + cst.byBrand[b])
    }
    for (const k of Object.keys(cst.other)) cst.other[k] = round2(cst.other[k])
    cst.paidTotal = round2(cst.paidTotal)
    cst.invoices = [...cst.invoices]
    if (cst.reportedTotal != null && Math.abs(cst.paidTotal - cst.reportedTotal) > 0.01) {
      mismatches.push({ customer: cst.name, parsed: cst.paidTotal, reported: cst.reportedTotal })
    }
    return cst
  })

  const grandParsed = round2(lines.reduce((s, l) => s + l.paidAmount, 0))
  const grandOk = grandReported == null ? null : Math.abs(grandParsed - grandReported) < 0.01
  const review = lines
    .filter((l) => l.kind === 'unmatched')
    .map(({ customer, invoice, sku, description, paidAmount }) => ({ customer, invoice, sku, description, paidAmount }))

  return {
    meta: { company: preHeader[0] || '', report: preHeader[1] || '', period: preHeader[2] || '' },
    lines,
    customers,
    totals: { grandParsed, grandReported, byBrand: totalsByBrand },
    review,
    validation: { ok: mismatches.length === 0 && grandOk !== false, grandOk, mismatches },
  }
}

/**
 * Merge freshly-parsed lines into the accumulated set, de-duped by each line's
 * fingerprint (`key`). Later (incoming) wins, so a re-uploaded/corrected line
 * updates in place — overlapping weekly reports never double-count.
 */
export function mergeCollectedLines(existing, incoming) {
  const byKey = new Map()
  for (const l of existing || []) if (l?.key) byKey.set(l.key, l)
  for (const l of incoming || []) if (l?.key) byKey.set(l.key, l)
  return [...byKey.values()]
}
