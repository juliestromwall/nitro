// Commission engine for the Tony portal.
//
// Inputs:
//   - invoices       : array of { customer, num, date, dueDate, amount, openBalance, status }
//   - lineItems      : array of { num, sku, description, qty, salesPrice, amount, customer }
//   - accounts       : array of { id, name, territory } from paymentsDemoData (master list)
//   - repTerritories : { repId: [territory, ...] } (runtime state — may differ from seed)
//   - season         : default '2025-26'
//
// Output:
//   {
//     entries: [...]            // per-line-item, per-rep commission entries
//     excluded: [...]           // skipped fee/shipping/etc rows (for transparency)
//     unmatchedCustomers: [...] // invoice customers not found in accounts list
//     reviewCount: number       // shorthand for entries.filter(e => e.needsReview).length
//   }
//
// Key behaviors (see also: src/lib/commissionRules.js and memory file
// project_commission_framework.md):
//   - Excludes: Shipping, Shipping Item, Interest-fee, Service Fee,
//     Sales Tax Item, restock-fee, Surcharge
//   - Discount-like lines (Discount Item, Discount-Item, Coupon Item, RoundOff
//     Item) are NOT given their own commission entries. Instead, a per-invoice
//     pre-pass computes a discount fraction:
//       discountFraction = max(0, (productSubtotal + discountTotal) / productSubtotal)
//     where productSubtotal sums all non-fee, non-discount lines and
//     discountTotal sums the discount-like lines (negative). Each product
//     line's lineNet is multiplied by this fraction so commissions reflect
//     the net-of-discount basis you specified. Equivalent to allocating the
//     discount proportionally across brands by subtotal share.
//   - Generic SKU: flagged for review, no auto-attribution
//   - Rental NITRO SKUs (catalog.isRental): RENTAL_SPLIT — Adam 5% + territory
//     rep 5% (or Adam-full-cut exception when customer override sets it)
//   - Non-rental: customer override > rep rate > brand default
//   - Customer name matching: EXACT, case-insensitive
//   - Partial payment: commissionAvailable = commission * (paidAmount / amount)

import { lookupBrand } from './catalogs.js'
import { REP_RATES, BRAND_DEFAULTS, CUSTOMER_OVERRIDES, RENTAL_SPLIT, CURRENT_SEASON } from './commissionRules.js'
import { REPS, REP_BRANDS } from './paymentsDemoData.js'

// ─── Constants ────────────────────────────────────────────────────────

const ADAM_REP_ID = 'rep-adam'

const EXCLUDED_SKU_NAMES = new Set([
  'shipping', 'shipping item',
  'interest-fee',
  'service fee',
  'sales tax item',
  'restock-fee',
  'surcharge',
])

const DISCOUNT_LIKE_NAMES = new Set([
  'discount item', 'discount-item', 'coupon item', 'roundoff item',
])

const GENERIC_SKU_NAME = 'generic sku'

// ─── Helpers ──────────────────────────────────────────────────────────

const normCustomer = (s) => String(s || '').trim().toUpperCase()
const normSku = (s) => String(s || '').trim().toLowerCase()

function isExcluded(sku) { return EXCLUDED_SKU_NAMES.has(normSku(sku)) }
function isDiscountLike(sku) { return DISCOUNT_LIKE_NAMES.has(normSku(sku)) }
function isGenericSku(sku) { return normSku(sku) === GENERIC_SKU_NAME }

function findAccount(invoiceCustomer, accountsByName) {
  if (!invoiceCustomer) return null
  return accountsByName.get(normCustomer(invoiceCustomer)) || null
}

function getCustomerOverride(invoiceCustomer, brandId, season) {
  const seasonMap = CUSTOMER_OVERRIDES[season]
  if (!seasonMap) return null
  // Exact match (case-sensitive on key — keys are stored as they appear on invoices)
  const direct = seasonMap[invoiceCustomer]
  if (direct?.[brandId]) return direct[brandId]
  // Case-insensitive fallback
  const wanted = normCustomer(invoiceCustomer)
  for (const key of Object.keys(seasonMap)) {
    if (normCustomer(key) === wanted) {
      const entry = seasonMap[key]
      if (entry?.[brandId]) return entry[brandId]
    }
  }
  return null
}

function getRepRate(repId, brandId, season) {
  const r = REP_RATES[season]?.[repId]?.[brandId]
  if (r != null) return { rate: r, source: 'rep-rate' }
  const d = BRAND_DEFAULTS[season]?.[brandId]
  if (d != null) return { rate: d, source: 'brand-default' }
  return null
}

// Returns reps in `territory` who (a) are assigned to `brandId` per REP_BRANDS
// AND (b) have a resolvable rate (per-rep or brand default).
function getEligibleRepsInTerritory(territory, brandId, season, repTerritories) {
  const out = []
  for (const [repId, territories] of Object.entries(repTerritories || {})) {
    if (!territories?.includes(territory)) continue
    if (repId === ADAM_REP_ID) continue   // Adam never collects non-rental NITRO via territory routing
    const assigned = REP_BRANDS.some(rb => rb.repId === repId && rb.brandId === brandId)
    if (!assigned) continue
    const r = REP_RATES[season]?.[repId]?.[brandId] ?? BRAND_DEFAULTS[season]?.[brandId]
    if (r != null) out.push({ repId, rate: r })
  }
  return out
}

function repName(repId) {
  return REPS.find(r => r.id === repId)?.name || repId
}

// ─── Main entry point ─────────────────────────────────────────────────

export function computeCommissions({
  invoices = [],
  lineItems = [],
  accounts = [],
  repTerritories = {},
  season = '2025-26',
} = {}) {
  // Index accounts by uppercase name for fast lookup
  const accountsByName = new Map()
  for (const a of accounts || []) {
    if (a?.name) accountsByName.set(normCustomer(a.name), a)
  }

  // Index invoices by num
  const invoicesByNum = new Map()
  for (const inv of invoices || []) {
    if (inv?.num) invoicesByNum.set(inv.num, inv)
  }

  // Pre-pass: compute discount fraction per invoice. discountFraction is 1.0
  // for invoices with no discount lines; otherwise reflects the proportional
  // markdown to apply to each product line's amount.
  const discountFractions = computeDiscountFractions(lineItems)

  const entries = []
  const excluded = []
  const unmatchedCustomers = new Set()
  let reviewCount = 0

  for (const item of lineItems || []) {
    const invoice = invoicesByNum.get(item.num)
    if (!invoice) continue   // line item with no matching invoice — skip silently
    const customer = invoice.customer || item.customer || ''
    const sku = item.sku || ''
    const amount = item.amount   // gross line amount as it appears on the invoice
    // Discount allocation: product lines get scaled by the invoice's discount
    // fraction so the commission base reflects net-of-discount. Fee/discount
    // lines themselves don't get this multiplication (they short-circuit below
    // and use `amount` only for transparency logging).
    const fraction = discountFractions[item.num] ?? 1
    const lineNet = amount != null ? amount * fraction : amount

    // 1. Excluded fee/shipping/etc — record but don't generate commission entry
    if (isExcluded(sku)) {
      excluded.push({ invoiceNum: invoice.num, sku, amount, reason: 'excluded-fee' })
      continue
    }

    // 2. Discount-like — already absorbed into product line amounts via the
    //    pre-pass discountFraction. Record for transparency, do not emit a
    //    commission entry of its own.
    if (isDiscountLike(sku)) {
      excluded.push({ invoiceNum: invoice.num, sku, amount, reason: 'discount-absorbed' })
      continue
    }

    // 3. Generic SKU — flag for review, no auto-commission
    if (isGenericSku(sku)) {
      entries.push(makeReviewEntry({
        invoice, sku, lineNet: lineNet,
        reason: 'Generic SKU — brand attribution required manually',
      }))
      reviewCount++
      continue
    }

    // 4. Look up brand from catalog
    const brandInfo = lookupBrand(sku)
    if (!brandInfo) {
      entries.push(makeReviewEntry({
        invoice, sku, lineNet: lineNet,
        reason: 'SKU not in any catalog',
      }))
      reviewCount++
      continue
    }
    const { brandId, brandName, isRental } = brandInfo
    // SKU's catalog season vs the active selling season. Older-season SKUs
    // get the half-rate adjustment applied in makeCommissionEntry.
    const isOlderSeason = brandInfo.season && brandInfo.season !== CURRENT_SEASON

    // 5. Resolve commission(s) for this line
    const account = findAccount(customer, accountsByName)
    if (!account) unmatchedCustomers.add(customer)
    const territory = account?.territory || null
    const override = getCustomerOverride(customer, brandId, season)

    // 5a. RENTAL — RENTAL_SPLIT path (always overrides other rules)
    if (isRental && brandId === 'brand-nitro') {
      const split = RENTAL_SPLIT[season]?.[brandId]
      if (!split) {
        entries.push(makeReviewEntry({
          invoice, sku, lineNet: lineNet,
          reason: 'RENTAL_SPLIT rule missing for this season/brand',
        }))
        reviewCount++
        continue
      }
      // Territory rep slot: from override.repId if set, else the territory's NITRO rep
      let territoryRepId = override?.repId || null
      if (!territoryRepId) {
        if (!territory) {
          entries.push(makeReviewEntry({
            invoice, sku, lineNet: lineNet, brand: brandName, brandId, isRental: true,
            reason: 'Rental — could not determine territory (customer not in accounts)',
          }))
          reviewCount++
          continue
        }
        const candidates = getEligibleRepsInTerritory(territory, brandId, season, repTerritories)
        if (candidates.length === 0) {
          entries.push(makeReviewEntry({
            invoice, sku, lineNet: lineNet, brand: brandName, brandId, isRental: true,
            reason: `Rental — no NITRO rep with a rate in territory "${territory}"`,
          }))
          reviewCount++
          continue
        }
        if (candidates.length > 1) {
          entries.push(makeReviewEntry({
            invoice, sku, lineNet: lineNet, brand: brandName, brandId, isRental: true,
            reason: `Rental — multiple NITRO reps eligible in "${territory}": ${candidates.map(c => repName(c.repId)).join(', ')}`,
          }))
          reviewCount++
          continue
        }
        territoryRepId = candidates[0].repId
      }

      if (override?.rentalAdamFullCut) {
        // Adam takes the full 10%, territory rep gets 0
        entries.push(makeCommissionEntry({
          invoice, sku, brand: brandName, brandId, isRental: true, isOlderSeason,
          lineNet: lineNet, repId: ADAM_REP_ID,
          rate: split.adamFullCutRate, source: 'rental-adam-full',
        }))
      } else {
        entries.push(makeCommissionEntry({
          invoice, sku, brand: brandName, brandId, isRental: true, isOlderSeason,
          lineNet: lineNet, repId: ADAM_REP_ID,
          rate: split.adamRate, source: 'rental-split',
        }))
        entries.push(makeCommissionEntry({
          invoice, sku, brand: brandName, brandId, isRental: true, isOlderSeason,
          lineNet: lineNet, repId: territoryRepId,
          rate: split.territoryRate, source: 'rental-split',
        }))
      }
      continue
    }

    // 5b. Non-rental — Customer override > territory routing
    // 5b.i. splitByTerritory override → one entry per territory rep
    if (override?.splitByTerritory?.length) {
      const splits = override.splitByTerritory
      const shareNet = (lineNet || 0) / splits.length
      let resolvedAll = true
      for (const terr of splits) {
        const candidates = getEligibleRepsInTerritory(terr, brandId, season, repTerritories)
        if (candidates.length !== 1) {
          entries.push(makeReviewEntry({
            invoice, sku, lineNet: shareNet, brand: brandName, brandId,
            reason: candidates.length === 0
              ? `Split — no rep with ${brandName} rate in territory "${terr}"`
              : `Split — multiple eligible reps in "${terr}": ${candidates.map(c => repName(c.repId)).join(', ')}`,
          }))
          reviewCount++
          resolvedAll = false
          continue
        }
        const { repId, rate } = candidates[0]
        entries.push(makeCommissionEntry({
          invoice, sku, brand: brandName, brandId, isOlderSeason,
          lineNet: shareNet, repId,
          rate, source: 'split-territory',
        }))
      }
      continue
    }

    // 5b.ii. repId override → route to that rep
    if (override?.repId) {
      const rate = override.rate != null
        ? override.rate
        : (REP_RATES[season]?.[override.repId]?.[brandId] ?? BRAND_DEFAULTS[season]?.[brandId])
      if (rate == null) {
        entries.push(makeReviewEntry({
          invoice, sku, lineNet: lineNet, brand: brandName, brandId,
          reason: `Customer override routes to ${repName(override.repId)} but no rate is set for ${brandName}`,
        }))
        reviewCount++
        continue
      }
      entries.push(makeCommissionEntry({
        invoice, sku, brand: brandName, brandId, isOlderSeason,
        lineNet: lineNet, repId: override.repId, rate,
        source: override.rate != null ? 'customer-override-rate-and-route' : 'customer-override-route',
      }))
      continue
    }

    // 5b.iii. rate-only customer override → use territory routing but override rate
    if (override?.rate != null) {
      const candidates = territory
        ? getEligibleRepsInTerritory(territory, brandId, season, repTerritories)
        : []
      if (candidates.length !== 1) {
        entries.push(makeReviewEntry({
          invoice, sku, lineNet: lineNet, brand: brandName, brandId,
          reason: !territory
            ? 'Customer override (rate) — customer has no territory'
            : candidates.length === 0
              ? `Customer override (rate) — no rep with ${brandName} rate in territory "${territory}"`
              : `Customer override (rate) — multiple eligible reps in "${territory}": ${candidates.map(c => repName(c.repId)).join(', ')}`,
        }))
        reviewCount++
        continue
      }
      entries.push(makeCommissionEntry({
        invoice, sku, brand: brandName, brandId, isOlderSeason,
        lineNet: lineNet, repId: candidates[0].repId, rate: override.rate,
        source: 'customer-override-rate',
      }))
      continue
    }

    // 5b.iv. No override → territory routing with the rep's normal rate
    if (!territory) {
      entries.push(makeReviewEntry({
        invoice, sku, lineNet: lineNet, brand: brandName, brandId,
        reason: 'Customer not in accounts master list — territory unknown',
      }))
      reviewCount++
      continue
    }
    const candidates = getEligibleRepsInTerritory(territory, brandId, season, repTerritories)
    if (candidates.length === 0) {
      entries.push(makeReviewEntry({
        invoice, sku, lineNet: lineNet, brand: brandName, brandId,
        reason: `No rep with ${brandName} rate covers "${territory}"`,
      }))
      reviewCount++
      continue
    }
    if (candidates.length > 1) {
      entries.push(makeReviewEntry({
        invoice, sku, lineNet: lineNet, brand: brandName, brandId,
        reason: `Multiple eligible reps for ${brandName} in "${territory}": ${candidates.map(c => repName(c.repId)).join(', ')}`,
      }))
      reviewCount++
      continue
    }
    const { repId, rate } = candidates[0]
    entries.push(makeCommissionEntry({
      invoice, sku, brand: brandName, brandId, isOlderSeason,
      lineNet: lineNet, repId, rate, source: 'rep-rate',
    }))
  }

  return {
    entries,
    excluded,
    unmatchedCustomers: Array.from(unmatchedCustomers).sort(),
    reviewCount,
  }
}

// ─── Per-rep aggregation helpers (used by ledger views) ────────────────

/**
 * Aggregate engine entries by repId.
 * Returns { [repId]: { repName, totalCommission, totalAvailable, openCommission, ...byInvoice } }
 */
export function aggregateByRep(entries) {
  const out = {}
  for (const e of entries) {
    if (e.needsReview || !e.repId) continue
    const k = e.repId
    if (!out[k]) {
      out[k] = {
        repId: k,
        repName: e.repName,
        totalCommission: 0,           // commission earned on FULL invoice amounts
        totalAvailable: 0,            // commission earned * paidFraction (proportional)
        openCommission: 0,            // commission still locked behind unpaid balance
        byInvoice: {},
      }
    }
    out[k].totalCommission += e.commission || 0
    out[k].totalAvailable += e.commissionAvailable || 0
    out[k].openCommission += (e.commission || 0) - (e.commissionAvailable || 0)
    if (!out[k].byInvoice[e.invoiceNum]) {
      out[k].byInvoice[e.invoiceNum] = {
        invoiceNum: e.invoiceNum,
        customer: e.invoiceCustomer,
        date: e.invoiceDate,
        dueDate: e.invoiceDueDate,
        amount: e.invoiceAmount,
        openBalance: e.invoiceOpenBalance,
        status: e.invoiceStatus,
        commission: 0,
        commissionAvailable: 0,
        lines: [],
      }
    }
    const grp = out[k].byInvoice[e.invoiceNum]
    grp.commission += e.commission || 0
    grp.commissionAvailable += e.commissionAvailable || 0
    grp.lines.push(e)
  }
  return out
}

// ─── Internal: discount fraction pre-pass ──────────────────────────────

function computeDiscountFractions(lineItems) {
  const productSubtotals = {}   // num -> sum of product-line amounts
  const discountTotals = {}     // num -> sum of discount-line amounts (negative)
  for (const item of lineItems || []) {
    if (!item?.num) continue
    const sku = item.sku || ''
    const amount = item.amount || 0
    if (isExcluded(sku)) continue   // fees/shipping never enter the math
    if (isDiscountLike(sku)) {
      discountTotals[item.num] = (discountTotals[item.num] || 0) + amount
    } else {
      // products (and Generic SKU / unmatched-SKU lines — still count toward
      // the invoice's "stuff being commissioned on" subtotal)
      productSubtotals[item.num] = (productSubtotals[item.num] || 0) + amount
    }
  }
  const fractions = {}
  for (const num of Object.keys(productSubtotals)) {
    const ps = productSubtotals[num]
    const dt = discountTotals[num] || 0
    if (ps <= 0) fractions[num] = 1
    else fractions[num] = Math.max(0, (ps + dt) / ps)
  }
  return fractions
}

// ─── Internal: shape constructors ──────────────────────────────────────

function paidFraction(amount, openBalance) {
  if (amount == null || amount === 0) return 0
  const paid = (amount - (openBalance || 0))
  const f = paid / amount
  return Math.max(0, Math.min(1, f))
}

function baseInvoiceFields(invoice) {
  return {
    invoiceNum: invoice.num,
    invoiceCustomer: invoice.customer,
    invoiceDate: invoice.date || '',
    invoiceDueDate: invoice.dueDate || '',
    invoiceAmount: invoice.amount ?? null,
    invoiceOpenBalance: invoice.openBalance ?? null,
    invoiceStatus: invoice.status || '',
  }
}

function makeCommissionEntry({ invoice, sku, brand, brandId, isRental = false, isOlderSeason = false, lineNet, repId, rate, source }) {
  // Older-season SKUs are paid at half rate. The original `rate` is kept on
  // the entry for transparency; `effectiveRate` is what's actually applied.
  const effectiveRate = isOlderSeason ? (rate || 0) * 0.5 : (rate || 0)
  const commission = (lineNet || 0) * effectiveRate
  const pf = paidFraction(invoice.amount, invoice.openBalance)
  return {
    ...baseInvoiceFields(invoice),
    sku,
    brand,
    brandId,
    isRental,
    isOlderSeason,
    lineNet,
    repId,
    repName: repName(repId),
    rate,
    effectiveRate,
    rateSource: isOlderSeason ? `${source}-half` : source,
    commission,
    commissionAvailable: commission * pf,
    paidFraction: pf,
    needsReview: false,
    reviewReason: null,
  }
}

function makeReviewEntry({ invoice, sku, brand = null, brandId = null, isRental = false, lineNet, reason }) {
  return {
    ...baseInvoiceFields(invoice),
    sku,
    brand,
    brandId,
    isRental,
    lineNet,
    repId: null,
    repName: null,
    rate: null,
    rateSource: null,
    commission: 0,
    commissionAvailable: 0,
    paidFraction: paidFraction(invoice.amount, invoice.openBalance),
    needsReview: true,
    reviewReason: reason,
  }
}
