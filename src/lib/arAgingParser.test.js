// Tests for the A/R Aging Detail parser. Run: npm test.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseArAging, openInvoicesFromAging } from './arAgingParser.js'

const FIXTURE = [
  '"Foundry Distribution, Inc",,,,,,,',
  'A/R Aging Detail Report,,,,,,,',
  '"As of Jul 25, 2026",,,,,,,',
  '',
  ',Date,Transaction type,Num,Customer full name,Due date,Amount,Open balance',
  '91 or more days past due,,,,,,,',
  ',11/11/2025,Invoice,SI-1,TACTICS,12/11/2025,"1,000.00",800.00',
  ',01/23/2023,Credit Memo,SC-1,ZUMIEZ,01/23/2023,-100.00,-100.00',
  'Total for 91 or more days past due,,,,,,,700.00',
  'CURRENT,,,,,,,',
  ',08/01/2026,Invoice,SI-2,Sports Basement,09/01/2026,500.00,500.00',
  ',08/01/2026,Invoice,SI-3,Carter Katz - REP,09/01/2026,200.00,200.00',
  'Total for CURRENT,,,,,,,700.00',
  'TOTAL,,,,,,,"1,400.00"',
  '" Thursday, July 30, 2026 04:19 PM GMT-06:00",,,,,,,',
].join('\n')

test('parses meta and validates open balances against the report subtotals', () => {
  const r = parseArAging(FIXTURE)
  assert.equal(r.meta.report, 'A/R Aging Detail Report')
  assert.equal(r.meta.asOf, 'Jul 25, 2026')
  assert.equal(r.totals.byBucket.d91, 700)      // 800 invoice − 100 credit
  assert.equal(r.totals.byBucket.current, 700)  // 500 + 200 (incl. REP, matches QBO)
  assert.equal(r.totals.grandOpen, 1400)
  assert.equal(r.totals.grandReported, 1400)
  assert.equal(r.validation.grandOk, true)
  assert.equal(r.validation.ok, true)
  assert.deepEqual(r.validation.mismatches, [])
})

test('open invoices exclude credits, zero/negative balances, and REP accounts', () => {
  const open = openInvoicesFromAging(parseArAging(FIXTURE))
  const nums = open.map(o => o.num).sort()
  assert.deepEqual(nums, ['SI-1', 'SI-2'])              // SC-1 (credit) + SI-3 (REP) excluded
  const si1 = open.find(o => o.num === 'SI-1')
  assert.equal(si1.customer, 'TACTICS')
  assert.equal(si1.amount, 1000)
  assert.equal(si1.openBalance, 800)
})
