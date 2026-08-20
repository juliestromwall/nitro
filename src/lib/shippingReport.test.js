import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildShippingReport, brandOfRef, isPrinted, parseTaxDate, weekEndingFriday, UNRESOLVED_BRAND,
} from './shippingReport.js'

const order = (o) => ({ status: '2027 Booking', ref: '', customer: 'Shop', total: 0, taxDate: '', ...o })

test('reads the brand off the Ref code', () => {
  assert.equal(brandOfRef('US - NB-2027 PO#1'), 'NITRO')
  assert.equal(brandOfRef('US - AB - SPRING 2026 PO#x'), 'Autumn')
  assert.equal(brandOfRef('US - EIS-2026 x'), 'Eivy')
  assert.equal(brandOfRef('US - CIS-2026 x'), 'Corduroy')
  // L1's code carries a digit, so it must not be read as the letter L alone.
  assert.equal(brandOfRef('US - L1IS-2026 PO#Sale Rack'), 'L1')
  assert.equal(brandOfRef('tony friends order'), UNRESOLVED_BRAND)
})

test('an order is packed only when its tag says printed', () => {
  assert.equal(isPrinted('Order Printed'), true)
  assert.equal(isPrinted('2027 Booking'), false)
  assert.equal(isPrinted('Back order'), false)
  assert.equal(isPrinted(''), false)
})

test('parses the tax date, and rejects anything else', () => {
  assert.equal(parseTaxDate('18 Aug 2026').toISOString().slice(0, 10), '2026-08-18')
  assert.equal(parseTaxDate('3 Jun 2026').toISOString().slice(0, 10), '2026-06-03')
  // "Date created" is a different format AND a different meaning — never a ship date.
  assert.equal(parseTaxDate('2026-08-18 13:33:41'), null)
  assert.equal(parseTaxDate('18 Xyz 2026'), null)
  assert.equal(parseTaxDate(''), null)
})

test('weeks end on Friday', () => {
  const fri = (iso) => weekEndingFriday(new Date(iso + 'T00:00:00Z')).toISOString().slice(0, 10)
  assert.equal(fri('2026-08-18'), '2026-08-21', 'Tuesday rolls to that Friday')
  assert.equal(fri('2026-08-21'), '2026-08-21', 'Friday is its own week end')
  assert.equal(fri('2026-08-22'), '2026-08-28', 'Saturday belongs to the next week')
})

test('splits the pipeline by tag and shares by VALUE', () => {
  const openOrders = [
    order({ status: '2027 Booking', total: 700 }),
    order({ status: 'Back order', total: 100 }),
    order({ status: 'Order Printed', total: 100 }),
  ]
  const shipped = [order({ status: 'Invoiced', total: 100, taxDate: '14 Aug 2026' })]
  const r = buildShippingReport({ openOrders, shipped })

  assert.equal(r.stages.toPrint.orders, 2)
  assert.equal(r.stages.printed.orders, 1)
  assert.equal(r.stages.shipped.orders, 1)
  assert.equal(r.season.orders, 4)
  assert.equal(r.season.value, 1000)
  // 800 / 100 / 100 of $1,000 — by value, not by order count.
  assert.equal(Math.round(r.share.toPrint), 80)
  assert.equal(Math.round(r.share.printed), 10)
  assert.equal(Math.round(r.share.shipped), 10)
})

test('groups shipments into weeks with their customers and brands', () => {
  const shipped = [
    order({ status: 'Invoiced', customer: 'Baker Street (WSR)', ref: 'US - NB-2027 PO#a', total: 1000, taxDate: '10 Aug 2026' }),
    order({ status: 'Invoiced', customer: 'Baker Street (WSR)', ref: 'US - AB-2027 PO#b', total: 500, taxDate: '12 Aug 2026' }),
    order({ status: 'Invoiced', customer: 'Spoke X', ref: 'US - NB-2027 PO#c', total: 250, taxDate: '13 Aug 2026' }),
    order({ status: 'Invoiced', customer: 'Later Shop', ref: 'US - NB-2027 PO#d', total: 50, taxDate: '18 Aug 2026' }),
  ]
  const r = buildShippingReport({ openOrders: [], shipped })

  assert.equal(r.weeks.length, 2, 'two Fridays')
  const [w1, w2] = r.weeks
  assert.equal(w1.label, 'Aug 14')
  assert.equal(w1.orders, 3)
  assert.equal(w1.value, 1750)
  assert.equal(Math.round(w1.avgOrder), 583)
  assert.equal(w1.customers.length, 2, 'Baker Street collapses to one row')

  const baker = w1.customers[0]
  assert.equal(baker.customer, 'Baker Street', 'the (WSR) marker moves to its own flag')
  assert.equal(baker.wsr, true)
  assert.equal(baker.orders, 2)
  assert.deepEqual(baker.brands, ['Autumn', 'NITRO'], 'both brands shipped to them that week')

  assert.equal(w2.label, 'Aug 21')
  assert.equal(w2.orders, 1)
})

test('a shipment with no tax date is counted as undated, never guessed into a week', () => {
  const shipped = [
    order({ status: 'Invoiced', total: 100, taxDate: '14 Aug 2026' }),
    order({ status: 'Invoiced', total: 900, taxDate: '' }),
  ]
  const r = buildShippingReport({ openOrders: [], shipped })
  assert.equal(r.undated, 1)
  assert.equal(r.weeks.length, 1)
  assert.equal(r.weeks[0].orders, 1)
  // It still counts toward the shipped stage — it shipped, we just don't know when.
  assert.equal(r.stages.shipped.orders, 2)
  assert.equal(r.stages.shipped.value, 1000)
})

test('brand table pairs what is waiting against what has shipped', () => {
  const openOrders = [
    order({ ref: 'US - NB-2027 PO#a', total: 5000 }),
    order({ ref: 'US - AB-2027 PO#b', total: 1000 }),
  ]
  const shipped = [order({ status: 'Invoiced', ref: 'US - NB-2027 PO#c', total: 800, taxDate: '14 Aug 2026' })]
  const r = buildShippingReport({ openOrders, shipped })

  const nitro = r.byBrand.find((b) => b.brand === 'NITRO')
  assert.deepEqual(
    { l: nitro.leftOrders, lv: nitro.leftValue, s: nitro.shippedOrders, sv: nitro.shippedValue },
    { l: 1, lv: 5000, s: 1, sv: 800 },
  )
  // Autumn is waiting but hasn't started shipping — the zero must be real, not absent.
  const autumn = r.byBrand.find((b) => b.brand === 'Autumn')
  assert.equal(autumn.shippedOrders, 0)
  assert.equal(autumn.shippedValue, 0)
})

test('empty input produces an empty report rather than throwing', () => {
  const r = buildShippingReport({})
  assert.equal(r.season.orders, 0)
  assert.equal(r.weeks.length, 0)
  assert.equal(r.share.shipped, 0, 'no divide-by-zero')
})
