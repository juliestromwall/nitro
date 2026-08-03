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
