// Unit tests for the cash-basis "Sales by Customer Detail" parser.
// Run: npm test   (uses Node's built-in test runner — no extra deps)
//
// The real QBO export lives in the gitignored `Invoice data/` folder, so these
// tests use an inline fixture with REAL catalog SKUs (A26… → Autumn, N833… →
// NITRO, NP… → rental) to exercise brand resolution against the actual
// catalogMap.json.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSalesDetail } from './salesDetailParser.js'

// Mirrors the QBO layout: title block, header, customer groups with per-line
// PAID amounts, "Total for" subtotals, grand TOTAL, footer.
const FIXTURE = [
  '"Foundry Distribution, Inc",,,,,,,,,',
  'Sales by Customer Detail,,,,,,,,,',
  '"July 1-August 3, 2026",,,,,,,,,',
  '',
  ',Transaction date,Transaction type,Num,Product/Service full name,Description,Quantity,Sales price,Amount,Balance',
  // Single-brand invoice + shipping
  'Test Shop,,,,,,,,,',
  ',08/01/2026,Invoice,SI-100001,A26087-02M,2026 SHADOW PANT,3.00,110.00,100.00,100.00',
  ',08/01/2026,Invoice,SI-100001,Shipping,Shipping cost,1.00,10.00,10.00,110.00',
  // NITRO invoice with a discount (→ allocate to NITRO) and interest (excluded)
  ',08/01/2026,Invoice,SI-100002,N833046-001142,2025 LECTRA BRUSH,10.00,210.00,200.00,310.00',
  ',08/01/2026,Invoice,SI-100002,Discount Item,Item Discount,1.00,-50.00,-50.00,260.00',
  ',08/01/2026,Invoice,SI-100002,Interest-fee,MONTHLY INTEREST FEE,1.00,5.00,5.00,265.00',
  // Rental / parts (NP… SKU, no catalog match)
  ',08/01/2026,Invoice,SI-100003,NP841207-001,RENTAL TOE CABLE,80.00,1.50,20.00,285.00',
  'Total for Test Shop,,,,,,,,285.00,',
  // Multi-brand invoice with a discount → pro-rata split
  'Multi Brand Shop,,,,,,,,,',
  ',08/01/2026,Invoice,SI-200001,A26087-02M,2026 SHADOW PANT,1.00,100.00,100.00,100.00',
  ',08/01/2026,Invoice,SI-200001,N833046-001142,2025 LECTRA BRUSH,1.00,300.00,300.00,400.00',
  ',08/01/2026,Invoice,SI-200001,Discount Item,Item Discount,1.00,-40.00,-40.00,360.00',
  'Total for Multi Brand Shop,,,,,,,,360.00,',
  'TOTAL,,,,,,,,645.00,',
  '" Monday, August 03, 2026 04:19 PM GMT-06:00",,,,,,,,,',
].join('\n')

test('reads meta and validates against QBO totals to the penny', () => {
  const r = parseSalesDetail(FIXTURE)
  assert.equal(r.meta.report, 'Sales by Customer Detail')
  assert.equal(r.meta.period, 'July 1-August 3, 2026')
  assert.equal(r.totals.grandParsed, 645)
  assert.equal(r.totals.grandReported, 645)
  assert.equal(r.validation.grandOk, true)
  assert.equal(r.validation.ok, true)
  assert.deepEqual(r.validation.mismatches, [])
})

test('allocates a single-brand invoice discount to that brand', () => {
  const r = parseSalesDetail(FIXTURE)
  const shop = r.customers.find((c) => c.name === 'Test Shop')
  // Autumn = $100 (no discount). NITRO = $200 gross − $50 discount = $150.
  assert.equal(shop.byBrand['Autumn/Corduroy'], 100)
  assert.equal(shop.byBrand['NITRO'], 150)
  // Non-commissionable lines are separated out, not attributed to a brand.
  assert.equal(shop.other.shipping, 10)
  assert.equal(shop.other.interest, 5)
  assert.equal(shop.other.rental, 20)
  // Everything reconciles to the report's own customer total.
  assert.equal(shop.paidTotal, 285)
  assert.equal(shop.reportedTotal, 285)
})

test('splits a multi-brand invoice discount pro-rata by gross', () => {
  const r = parseSalesDetail(FIXTURE)
  const shop = r.customers.find((c) => c.name === 'Multi Brand Shop')
  // Gross Autumn 100 / NITRO 300 (total 400); −$40 → Autumn −10, NITRO −30.
  assert.equal(shop.byBrand['Autumn/Corduroy'], 90)
  assert.equal(shop.byBrand['NITRO'], 270)
  assert.equal(shop.paidTotal, 360)
})

test('rolls up commissionable totals by brand across the report', () => {
  const r = parseSalesDetail(FIXTURE)
  assert.equal(r.totals.byBrand['Autumn/Corduroy'], 190) // 100 + 90
  assert.equal(r.totals.byBrand['NITRO'], 420) // 150 + 270
  assert.equal(r.review.length, 0) // every SKU resolved or classified
})
