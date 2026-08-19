// Tests for the payment-method pill on the collected (cash-basis) rep ledger.
//
// Regression context: the pill was added in "Payments: capture & show payment
// method", then silently died when the rep ledger moved to collected data —
// that path built every event with paymentMethod: '' hardcoded, so the render
// guard never fired. This covers the join that brings it back.
//
// The helper lives in src/lib/paymentMethod.js; PaymentsTracker joins it onto
// each collected event from paymentEventsByInvoiceNum.

import test from 'node:test'
import assert from 'node:assert/strict'
import { collectedPaymentMethod, paymentsByCustomer, paymentMethodForEvent } from './paymentMethod.js'

test('no payment data means no pill, not a blank one', () => {
  assert.equal(collectedPaymentMethod(undefined, '08/14/2026'), '')
  assert.equal(collectedPaymentMethod([], '08/14/2026'), '')
  // Events exist but carry no method (older uploads without the column).
  assert.equal(collectedPaymentMethod([{ date: '08/14/2026', amount: 10 }], '08/14/2026'), '')
})

test('a single payment shows its method', () => {
  assert.equal(
    collectedPaymentMethod([{ date: '08/14/2026', method: 'Check' }], '08/14/2026'),
    'Check',
  )
})

test('the method is matched to the payment on that date', () => {
  // An invoice paid twice: the pill should reflect THIS event's payment, not
  // whichever happens to sort first.
  const events = [
    { date: '07/01/2026', method: 'Check' },
    { date: '08/14/2026', method: 'Sky ACH' },
  ]
  assert.equal(collectedPaymentMethod(events, '08/14/2026'), 'Sky ACH')
  assert.equal(collectedPaymentMethod(events, '07/01/2026'), 'Check')
})

test('ISO and US dates match each other', () => {
  // Payment dates arrive ISO from some sources, M/D/YYYY from the QBO report.
  const events = [{ date: '2026-08-14', method: 'Sky CC' }]
  assert.equal(collectedPaymentMethod(events, '08/14/2026'), 'Sky CC')
  assert.equal(collectedPaymentMethod([{ date: '08/14/2026', method: 'Sky CC' }], '2026-08-14'), 'Sky CC')
})

test('several methods on one day are all shown rather than one being picked', () => {
  const events = [
    { date: '08/14/2026', method: 'Check' },
    { date: '08/14/2026', method: 'Sky ACH' },
  ]
  assert.equal(collectedPaymentMethod(events, '08/14/2026'), 'Check / Sky ACH')
})

test('the same method twice is not repeated', () => {
  const events = [
    { date: '08/14/2026', method: 'Check' },
    { date: '08/14/2026', method: 'Check' },
  ]
  assert.equal(collectedPaymentMethod(events, '08/14/2026'), 'Check')
})

test('falls back to every known method when no payment matches the date', () => {
  // The collected event's date can disagree with the payments file (deposit vs
  // clearing date). Better to show what we know than to show nothing.
  const events = [
    { date: '07/01/2026', method: 'Check' },
    { date: '07/02/2026', method: 'Check' },
  ]
  assert.equal(collectedPaymentMethod(events, '12/25/2026'), 'Check')
  assert.equal(collectedPaymentMethod(events, ''), 'Check')
})

// ── Customer+day fallback ─────────────────────────────────────────────────
// Needed because the invoice→payment auto-matcher compares a payment to the
// invoice total within $5, and credit memos push it outside that window.

const NORM = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

test('indexes payments by customer, ignoring non-payment rows', () => {
  const tx = [
    { customer: 'EVO INC.', date: '08/13/2026', type: 'Payment', amount: 66779.96, method: 'ACH' },
    { customer: 'EVO INC.', date: '04/28/2026', type: 'Invoice', amount: 67453.2, method: 'ACH' },
    { customer: 'EVO INC.', date: '02/20/2026', type: 'Credit Memo', amount: -91.8, method: 'ACH' },
    { customer: 'Other Co', date: '08/13/2026', type: 'Payment', amount: 10, method: 'Check' },
    { customer: 'No Method', date: '08/13/2026', type: 'Payment', amount: 10, method: '' },
  ]
  const idx = paymentsByCustomer(tx, NORM)
  assert.equal(idx.size, 2, 'only customers with a real payment method')
  assert.equal(idx.get(NORM('EVO INC.')).length, 1, 'the invoice and credit memo rows are not payments')
  assert.equal(idx.get(NORM('EVO INC.'))[0].method, 'ACH')
})

test("EVO's credit-memo case: no invoice match, method still found", () => {
  // SI-127329 — invoiced 67,453.20, credited 673.24, paid 66,779.96. The
  // matcher's $5 tolerance can't bridge that, so invoiceEvents is empty.
  const customerPayments = [{ date: '08/13/2026', amount: 66779.96, method: 'ACH' }]
  assert.equal(
    paymentMethodForEvent({ invoiceEvents: [], customerPayments, paymentDate: '08/13/2026' }),
    'ACH',
  )
})

test('the invoice-level match always outranks the fallback', () => {
  // A precise link must never be overridden by the weaker customer+day key.
  assert.equal(
    paymentMethodForEvent({
      invoiceEvents: [{ date: '08/13/2026', method: 'Check' }],
      customerPayments: [{ date: '08/13/2026', method: 'ACH' }],
      paymentDate: '08/13/2026',
    }),
    'Check',
  )
})

test('the fallback cannot invent a method from another day', () => {
  const customerPayments = [{ date: '07/01/2026', method: 'ACH' }]
  assert.equal(
    paymentMethodForEvent({ invoiceEvents: [], customerPayments, paymentDate: '08/13/2026' }),
    '',
    'a payment on a different day says nothing about this one',
  )
})

test('two methods from one customer on one day are both shown', () => {
  const customerPayments = [
    { date: '08/13/2026', method: 'Check' },
    { date: '08/13/2026', method: 'ACH' },
  ]
  assert.equal(
    paymentMethodForEvent({ invoiceEvents: [], customerPayments, paymentDate: '08/13/2026' }),
    'Check / ACH',
    'ambiguous is shown as ambiguous rather than guessed',
  )
})
