// Tests for the payment→invoice matcher.
//
// This decides which invoices carry a payment date and method, and it feeds the
// rep statement's paid-invoice section. A silent miss here costs a rep visible
// evidence of what they earned, so the phases are pinned individually.

import test from 'node:test'
import assert from 'node:assert/strict'
import { matchPaymentsToInvoices, creditPoolFor, normCustomerName } from './paymentMatcher.js'

const inv = (num, customer, amount, openBalance = 0) => ({ num, customer, amount, openBalance })
const pay = (customer, date, amount, method = 'Check') => ({ customer, date, amount, method, type: 'Payment' })
const credit = (customer, date, amount) => ({ customer, date, amount: -Math.abs(amount), type: 'Credit Memo' })

const run = (paymentsTx, invoices, wsr = new Map()) =>
  matchPaymentsToInvoices({ paymentsTx, invoices, wsrInvoicePayments: wsr })

test('normalizes customer names the way the rest of the app does', () => {
  assert.equal(normCustomerName("Scotty's Ride Shop - Scott Moffatt"), 'SCOTTYS RIDE SHOP')
  assert.equal(normCustomerName('POWDER HOUSE INC - OR (WSR)'), 'POWDER HOUSE INC')
  // KNOWN QUIRK, pre-existing and deliberately pinned rather than changed here:
  // the strip-apostrophes character class holds only STRAIGHT quotes, so a
  // typographic apostrophe survives and splits the word. Same behaviour as the
  // app's other normalizers, so changing it would shift customer matching
  // everywhere at once — worth its own change, not this one.
  assert.equal(normCustomerName('Scotty\u2019s Ride Shop'), 'SCOTTY S RIDE SHOP')
})

test('Phase A: one payment settles one invoice', () => {
  const r = run([pay('Shop', '08/05/2026', 100)], [inv('SI-1', 'Shop', 100)])
  assert.equal(r.get('SI-1').length, 1)
  assert.equal(r.get('SI-1')[0].source, 'auto-single')
  assert.equal(r.get('SI-1')[0].method, 'Check')
})

test('Phase D: one payment settles a group of invoices', () => {
  const r = run(
    [pay('Shop', '08/05/2026', 150)],
    [inv('SI-1', 'Shop', 100), inv('SI-2', 'Shop', 50)],
  )
  assert.equal(r.get('SI-1')?.[0]?.source, 'auto-group')
  assert.equal(r.get('SI-2')?.[0]?.source, 'auto-group')
})

test('WSR remittance is authoritative and is never re-matched', () => {
  const wsr = new Map([['SI-1', [{ checkDate: '08/01/2026', amountPaid: 100 }]]])
  const r = run([pay('Shop', '08/05/2026', 100)], [inv('SI-1', 'Shop', 100)], wsr)
  assert.equal(r.get('SI-1').length, 1)
  assert.equal(r.get('SI-1')[0].source, 'wsr')
})

test('an unresolvable payment produces nothing rather than a guess', () => {
  // Strict no-manual-data policy: better absent than wrong.
  const r = run([pay('Shop', '08/05/2026', 61.11)], [inv('SI-1', 'Shop', 100)])
  assert.equal(r.has('SI-1'), false)
})

// ── Credit memos ──────────────────────────────────────────────────────────

test('sums credit memos into a positive pool, ignoring other rows', () => {
  const tx = [
    credit('EVO', '02/20/2026', 91.8),
    credit('EVO', '03/16/2026', 259.44),
    pay('EVO', '08/13/2026', 66779.96),
    { customer: 'EVO', type: 'Invoice', amount: 67453.2 },
  ]
  assert.equal(creditPoolFor(tx), 351.24)
})

test("EVO's real case: a credit memo no longer breaks the match", () => {
  // SI-127329 — invoiced $67,453.20, four credit memos totalling $673.24, paid
  // $66,779.96 by ACH on 8/13. The $673.24 shortfall is outside the $5
  // tolerance, so before this every phase missed and the invoice had no
  // payment date, no method, and was absent from Steve's statement.
  const tx = [
    credit('EVOLUCION INNOVATIONS INC.', '02/25/2026', 206.40),
    credit('EVOLUCION INNOVATIONS INC.', '02/20/2026', 91.80),
    credit('EVOLUCION INNOVATIONS INC.', '03/16/2026', 259.44),
    credit('EVOLUCION INNOVATIONS INC.', '03/16/2026', 115.60),
    pay('EVOLUCION INNOVATIONS INC.', '08/13/2026', 66779.96, 'ACH'),
  ]
  const r = run(tx, [inv('SI-127329', 'EVOLUCION INNOVATIONS INC.', 67453.20)])
  const events = r.get('SI-127329')
  assert.ok(events?.length, 'the invoice now has a payment event')
  assert.equal(events[0].method, 'ACH', 'and carries the method for the pill')
  assert.equal(events[0].date, '08/13/2026')
  assert.equal(events[0].amount, 66779.96, 'the recorded amount is what was actually paid')
})

test('the credit pool is consumed, not reused per invoice', () => {
  // One $50 credit must not explain a $50 shortfall on two different invoices.
  const tx = [
    credit('Shop', '01/01/2026', 50),
    pay('Shop', '08/05/2026', 50),
    pay('Shop', '08/06/2026', 50),
  ]
  const r = run(tx, [inv('SI-1', 'Shop', 100), inv('SI-2', 'Shop', 100)])
  const matched = ['SI-1', 'SI-2'].filter((n) => r.has(n))
  assert.equal(matched.length, 1, 'only one invoice can be explained by the single credit')
})

test('credits never bridge a shortfall larger than the pool', () => {
  const tx = [credit('Shop', '01/01/2026', 10), pay('Shop', '08/05/2026', 50)]
  const r = run(tx, [inv('SI-1', 'Shop', 100)])
  assert.equal(r.has('SI-1'), false, '$40 short with only $10 of credit is still unresolved')
})

test('a customer with no credits behaves exactly as before', () => {
  const r = run([pay('Shop', '08/05/2026', 100)], [inv('SI-1', 'Shop', 100)])
  assert.equal(r.get('SI-1')[0].source, 'auto-single')
  assert.equal(r.get('SI-1')[0].amount, 100)
})
