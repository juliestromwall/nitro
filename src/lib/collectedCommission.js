// Commission from the parsed cash-basis "Sales by Customer Detail" report
// (Stage 1, PR #4). Rather than reimplement routing, this drives the existing,
// battle-tested invoice-first engine (computeCommissions) with the collected
// lines: it already does brand resolution, per-invoice discount netting,
// fee/shipping exclusion, territory+brand rep routing, customer overrides, the
// NITRO rental split, and the older-season half-rate.
//
// The only adaptation is the INPUT: shape each collected line as a lineItem
// (amount = the PAID portion) and synthesize one invoice per invoice number.
// Feeding COLLECTED amounts yields COLLECTED-basis commission — the engine just
// applies rate × season to whatever net line amount it's given, so a payment
// that split four ways credits each brand's rep for exactly what was collected.
//
// See docs/commission-attribution-spec.md.

import { computeCommissions, aggregateByRep } from './commissionEngine.js'
import { seasonOf, combinedRateMultiplier, ORDER_TYPE_RULES_EFFECTIVE } from './commissionRules.js'

/**
 * @param lines           parser output `lines` (from parseSalesDetail): each
 *                        { customer, invoice, sku, paidAmount, date, ... }
 * @param accounts        ACCOUNTS master (name → territory)
 * @param repTerritories  REP_TERRITORIES (repId → [territory])
 * @param season          active selling season for the rate tables
 * @returns { byRep, entries, excluded, unmatchedCustomers, reviewCount }
 */
export function computeCollectedCommission({
  lines = [],
  accounts = [],
  repTerritories = {},
  season = '2025-26',
  orderTypes = {},
  orderTypeCutoff = ORDER_TYPE_RULES_EFFECTIVE,
} = {}) {
  const invoicesByNum = new Map()
  const lineItems = []
  for (const l of lines) {
    if (!l?.invoice) continue
    // Every collected line is dated to the PAYMENT — carry that as the invoice
    // date so the older-season half-rate can be judged at payment time below.
    if (!invoicesByNum.has(l.invoice)) {
      invoicesByNum.set(l.invoice, { num: l.invoice, customer: l.customer || '', date: l.date || '' })
    }
    lineItems.push({ num: l.invoice, sku: l.sku, amount: l.paidAmount, customer: l.customer || '' })
  }
  const invoices = [...invoicesByNum.values()]

  const result = computeCommissions({ invoices, lineItems, accounts, repTerritories, season, orderTypes, orderTypeCutoff })

  // The engine computes BASE commission and defers BOTH half-rate rules to here
  // (see makeCommissionEntry): the older-season rule because "older" depends on
  // the payment date, which the cash-basis report gives us per line (carried as
  // invoiceDate), and the closeout rule so it lands in the same place. They go
  // through combinedRateMultiplier together, which floors at 0.5 — a closeout
  // line carrying carry-over SKUs pays half, never a quarter.
  const entries = result.entries.map((e) => {
    if (e.needsReview || !e.repId) return e
    const mult = combinedRateMultiplier({
      skuSeason: e.skuSeason,
      refSeason: seasonOf(e.invoiceDate),
      isCloseout: e.isCloseout,
    })
    if (mult === 1) return e
    return {
      ...e,
      seasonMultiplier: mult,
      commission: (e.commission || 0) * mult,
      commissionAvailable: (e.commissionAvailable || 0) * mult,
    }
  })

  const byRep = aggregateByRep(entries)
  return { byRep, ...result, entries }
}
