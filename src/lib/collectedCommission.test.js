// Tests for collected-commission routing (the PR#4 adapter over the engine).
// Run: npm test  (Node's built-in runner).
//
// Uses real catalog SKUs + real rate/brand config (REP_BRANDS / REP_RATES) with
// a minimal inline account + territory map, so it exercises the true routing:
// SOCAL/AZ Autumn → Carter Katz, NITRO → Steve Clare.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeCollectedCommission } from './collectedCommission.js'

const accounts = [{ id: 'a1', name: 'Test Shop', territory: 'SOCAL / AZ' }]
const repTerritories = { 'rep-carter-katz': ['SOCAL / AZ'], 'rep-steve-clare': ['SOCAL / AZ'] }

test('routes brands to the right reps, nets discounts, and applies the carry-over half-rate', () => {
  const lines = [
    // Autumn, current season → Carter, no half-rate.
    { customer: 'Test Shop', invoice: 'SI-1', sku: 'A26087-02M', paidAmount: 100, date: '08/01/2026' },
    // NITRO carry-over (2024-25) + a discount on the same invoice → Steve Clare,
    // base net of discount, half-rate applied.
    { customer: 'Test Shop', invoice: 'SI-2', sku: 'N833046-001142', paidAmount: 200, date: '08/01/2026' },
    { customer: 'Test Shop', invoice: 'SI-2', sku: 'Discount Item', description: 'Item Discount', paidAmount: -50, date: '08/01/2026' },
  ]
  const { entries, byRep } = computeCollectedCommission({ lines, accounts, repTerritories, season: '2025-26' })

  const autumn = entries.find((e) => e.brand === 'Autumn/Corduroy' && !e.needsReview)
  const nitro = entries.find((e) => e.brand === 'NITRO' && !e.needsReview)

  // Routing
  assert.ok(autumn, 'Autumn line routed to a rep')
  assert.equal(autumn.repId, 'rep-carter-katz')
  assert.ok(nitro, 'NITRO line routed to a rep')
  assert.equal(nitro.repId, 'rep-steve-clare')

  // Season half-rate: Autumn is current-season (no multiplier); NITRO 2024-25 → 0.5.
  assert.equal(autumn.seasonMultiplier, undefined)
  assert.equal(nitro.seasonMultiplier, 0.5)

  // Discount netted into the NITRO base: 200 − 50 = 150.
  assert.equal(Math.round(nitro.lineNet * 100) / 100, 150)

  // Commission = net × rate × halfRate — internally consistent whatever the rate.
  assert.equal(
    Math.round(nitro.commission * 1e6) / 1e6,
    Math.round(150 * (nitro.rate || 0) * 0.5 * 1e6) / 1e6,
  )

  assert.ok(byRep['rep-steve-clare'].totalCommission > 0, 'Steve Clare credited for NITRO')
  assert.ok(byRep['rep-carter-katz'].totalCommission > 0, 'Carter credited for Autumn')
})

test('an unknown SKU is flagged for review, not silently dropped', () => {
  const lines = [{ customer: 'Test Shop', invoice: 'SI-9', sku: 'NP841207-001', paidAmount: 120, date: '08/01/2026' }]
  const { entries } = computeCollectedCommission({ lines, accounts, repTerritories, season: '2025-26' })
  const rev = entries.find((e) => e.invoiceNum === 'SI-9')
  assert.ok(rev?.needsReview, 'rental/parts SKU not in catalog is flagged for review')
})

// ── Brightpearl order types ───────────────────────────────────────────────
// Order type comes from the Brightpearl Ref code (see brightpearlOrders.js).
// Dates here are AFTER ORDER_TYPE_RULES_EFFECTIVE so the forward-only rules bite;
// the cutoff itself is exercised separately below.

const AUTUMN_CURRENT = 'A26087-02M'      // current-season SKU → no season half-rate
const NITRO_CARRYOVER = 'N833046-001142' // 2024-25 SKU → season half-rate on its own
const AFTER = '08/25/2026'
const BEFORE = '08/01/2026'

const run = (lines, orderTypes) =>
  computeCollectedCommission({ lines, accounts, repTerritories, season: '2025-26', orderTypes })

const line = (invoice, sku, date = AFTER, paidAmount = 100) =>
  ({ customer: 'Test Shop', invoice, sku, paidAmount, date })

test('promo and warranty orders earn no commission at all', () => {
  const { entries } = run(
    [line('SI-P', AUTUMN_CURRENT), line('SI-W', AUTUMN_CURRENT), line('SI-OK', AUTUMN_CURRENT)],
    { 'SI-P': 'promo', 'SI-W': 'warranty' },
  )
  assert.equal(entries.filter((e) => e.invoiceNum === 'SI-P').length, 0, 'promo produces no entry')
  assert.equal(entries.filter((e) => e.invoiceNum === 'SI-W').length, 0, 'warranty produces no entry')
  const ok = entries.find((e) => e.invoiceNum === 'SI-OK')
  assert.ok(ok && ok.commission > 0, 'an untyped invoice is untouched')
})

test('an off-convention Ref is flagged for review, never silently zeroed', () => {
  const { entries, reviewCount } = run([line('SI-U', AUTUMN_CURRENT)], { 'SI-U': 'uncoded' })
  const rev = entries.find((e) => e.invoiceNum === 'SI-U')
  assert.ok(rev?.needsReview, 'uncoded surfaces for review')
  assert.match(rev.reviewReason, /Ref/)
  assert.equal(reviewCount, 1)
  assert.equal(rev.commission, 0, 'no commission is paid while it is unresolved')
})

test('a closeout order pays half rate', () => {
  const { entries } = run(
    [line('SI-CO', AUTUMN_CURRENT), line('SI-FULL', AUTUMN_CURRENT)],
    { 'SI-CO': 'closeout', 'SI-FULL': 'ats' },
  )
  const co = entries.find((e) => e.invoiceNum === 'SI-CO')
  const full = entries.find((e) => e.invoiceNum === 'SI-FULL')
  assert.equal(co.seasonMultiplier, 0.5)
  assert.equal(full.seasonMultiplier, undefined, 'ATS is unaffected')
  assert.equal(Math.round(co.commission * 1e6) / 1e6, Math.round(full.commission * 0.5 * 1e6) / 1e6)
})

test('closeout and carry-over do NOT stack — the floor is half, never a quarter', () => {
  // This is the whole reason combinedRateMultiplier uses Math.min. A carry-over
  // SKU on a closeout invoice qualifies for both half-rate rules; multiplying
  // them would pay 0.25x and quietly underpay the rep.
  const { entries } = run([line('SI-BOTH', NITRO_CARRYOVER, AFTER, 200)], { 'SI-BOTH': 'closeout' })
  const e = entries.find((x) => x.invoiceNum === 'SI-BOTH' && !x.needsReview)
  assert.ok(e, 'carry-over closeout line still produces an entry')
  assert.equal(e.isCloseout, true)
  assert.equal(e.seasonMultiplier, 0.5, 'floored at half, not 0.25')
  assert.equal(
    Math.round(e.commission * 1e6) / 1e6,
    Math.round(200 * (e.rate || 0) * 0.5 * 1e6) / 1e6,
  )
})

test('the rules are forward-only — lines paid before the cutoff keep old treatment', () => {
  const orderTypes = { 'SI-OLD': 'promo', 'SI-NEW': 'promo' }
  const { entries } = run([line('SI-OLD', AUTUMN_CURRENT, BEFORE), line('SI-NEW', AUTUMN_CURRENT, AFTER)], orderTypes)
  const old = entries.find((e) => e.invoiceNum === 'SI-OLD')
  assert.ok(old && old.commission > 0, 'already-settled promo commission is left alone')
  assert.equal(entries.filter((e) => e.invoiceNum === 'SI-NEW').length, 0, 'new promo earns nothing')
})

test('with no order types uploaded the engine is unchanged', () => {
  const lines = [line('SI-1', AUTUMN_CURRENT), line('SI-2', NITRO_CARRYOVER)]
  const withOut = computeCollectedCommission({ lines, accounts, repTerritories, season: '2025-26' })
  const withEmpty = run(lines, {})
  assert.deepEqual(
    withOut.entries.map((e) => e.commission),
    withEmpty.entries.map((e) => e.commission),
  )
})
