// Tests for the rep commission statement's paid-invoice section.
//
// Regression context — Steve Clare's 2026-08-12 statement reported
// "Earned by brand … $612.50" and, directly beneath it,
// "Paid invoices by customer — 0 customers, 0 invoices".
//
// Both numbers came from the same seven invoices. The summary used the
// COLLECTED (cash-basis) path; the invoice list used the invoice dataset's
// status plus the payment auto-matcher, and every invoice failed one of those
// two gates. The rep received a correct total with no evidence behind it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPaidSection } from './repReport.js'

// Steve's actual invoices, as the collected path saw them.
const STEVE_COLLECTED = [
  { invoiceNum: 'SI-124037', customer: 'Baker Street Snow', paymentDate: '08/08/2026', paymentAmount: 3961.99, commissionForEvent: 277.34 },
  { invoiceNum: 'SI-125529', customer: 'Baker Street Snow', paymentDate: '08/08/2026', paymentAmount: 2711.00, commissionForEvent: 189.77 },
  { invoiceNum: 'SI-124944', customer: 'INFLIGHT', paymentDate: '08/06/2026', paymentAmount: 1479.57, commissionForEvent: 103.57 },
  { invoiceNum: 'SI-127246', customer: 'Spoke X Bike co', paymentDate: '08/06/2026', paymentAmount: 296.00, commissionForEvent: 20.72 },
  { invoiceNum: 'SI-125930', customer: "Scotty's Ride Shop", paymentDate: '08/01/2026', paymentAmount: 201.43, commissionForEvent: 14.10 },
  { invoiceNum: 'SI-127247', customer: 'Spoke X Bike co', paymentDate: '08/06/2026', paymentAmount: 50.00, commissionForEvent: 3.50 },
  { invoiceNum: 'SI-127284', customer: 'Spoke X Bike co', paymentDate: '08/06/2026', paymentAmount: 50.00, commissionForEvent: 3.50 },
]

const round2 = (n) => Math.round(n * 100) / 100

test("Steve's statement: the paid section is no longer empty", () => {
  const { invoices, groups, total } = buildPaidSection({
    collectedEvents: STEVE_COLLECTED,
    paidSince: '2026-07-21',
  })
  assert.equal(invoices.length, 7, 'every paid invoice appears')
  assert.equal(round2(total), 612.50, 'and they add up to the figure the summary reports')
  // 4 customers: Baker Street, Inflight, Spoke X, Scotty's
  assert.equal(groups.length, 4)
  assert.equal(groups[0].customer, 'Baker Street Snow')
  assert.equal(round2(groups[0].commission), 467.11)
  assert.equal(groups[0].count, 2)
})

test('the old path is still used when nothing is collected yet', () => {
  // byInvoice + matcher dates — unchanged behaviour for older data.
  const byInvoice = {
    'SI-1': { invoiceNum: 'SI-1', customer: 'Shop', status: 'Paid', amount: 100, commission: 8 },
    'SI-2': { invoiceNum: 'SI-2', customer: 'Shop', status: 'Open', amount: 50, commission: 4 },
  }
  const { invoices, total } = buildPaidSection({
    byInvoice,
    paymentDatesByInvoiceNum: { 'SI-1': '08/05/2026' },
    paidSince: '2026-07-21',
  })
  assert.equal(invoices.length, 1, 'only the Paid one, dated by the matcher')
  assert.equal(invoices[0].invoiceNum, 'SI-1')
  assert.equal(total, 8)
})

test('collected events win over the invoice dataset when both are present', () => {
  // This is the whole point: an invoice still marked Open in the invoice export
  // but present in the collected report HAS been paid, and must be listed.
  const byInvoice = {
    'SI-124037': { invoiceNum: 'SI-124037', customer: 'Baker Street Snow', status: 'Open', amount: 3961.99, commission: 277.34 },
  }
  const { invoices } = buildPaidSection({
    byInvoice,
    collectedEvents: [STEVE_COLLECTED[0]],
    paymentDatesByInvoiceNum: {},   // matcher found nothing — the EVO failure mode
    paidSince: '2026-07-21',
  })
  assert.equal(invoices.length, 1)
  assert.equal(invoices[0].invoiceNum, 'SI-124037')
  assert.equal(invoices[0].paidOn, '08/08/2026')
})

test('the since filter still applies to collected events', () => {
  const { invoices } = buildPaidSection({
    collectedEvents: STEVE_COLLECTED,
    paidSince: '2026-08-07',
  })
  assert.equal(invoices.length, 2, 'only the two Baker Street payments on 08/08')
  assert.ok(invoices.every((i) => i.invoiceNum.startsWith('SI-12')))
})

test('invoices are listed newest-paid first', () => {
  const { invoices } = buildPaidSection({ collectedEvents: STEVE_COLLECTED, paidSince: '2026-07-21' })
  assert.equal(invoices[0].paidOn, '08/08/2026')
  assert.equal(invoices[invoices.length - 1].paidOn, '08/01/2026')
})
