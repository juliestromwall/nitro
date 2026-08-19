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
import { collectedPaymentMethod } from './paymentMethod.js'

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
