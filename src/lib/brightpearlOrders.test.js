import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ORDER_TYPE,
  parseOrderRef,
  orderTypeOfRef,
  poNumberFromRef,
  isNonCommissionable,
  parseBrightpearlOrders,
} from './brightpearlOrders.js'

test('reads the type code out of a conventional Ref', () => {
  assert.deepEqual(parseOrderRef('US - NB-2027 PO# 4532139166'), { code: 'NB', year: '2027' })
  assert.deepEqual(parseOrderRef('US - AIS-2026 Direct Uploads'), { code: 'AIS', year: '2026' })
  // "US" is the country prefix, never a type code — the scan must step past it.
  assert.equal(parseOrderRef('US - 2027 AUTUMN SAMPLES').code, null)
})

test('recovers Refs that deviate from the convention', () => {
  // Prefixed with unrelated text.
  assert.equal(parseOrderRef('REVIEW DEALER APP: US - AB-2027 PO#x').code, 'AB')
  // Year and code transposed.
  assert.equal(parseOrderRef('US - 2026-NIS-DAVE BENDER').code, 'NIS')
  // Lower case.
  assert.equal(parseOrderRef('us - nco-2026 po#123').code, 'NCO')
  // No year at all.
  assert.equal(parseOrderRef('NW promo- Ellery Srofe').code, 'NW')
})

test("L1's codes carry a digit — L1IS/L1B/L1P, not LIS/LB/LP", () => {
  // Regression: a position-based regex of [A-Z]{1,4} skipped every L1 order and
  // classed it uncoded, parking real commission in the review queue.
  assert.equal(orderTypeOfRef('US - L1IS-2026 PO#2526 Sale Rack'), ORDER_TYPE.ATS)
  assert.equal(orderTypeOfRef('US - L1B-2026 PO#l1fill'), ORDER_TYPE.PREBOOK)
  assert.equal(orderTypeOfRef('US - L1P-2026 Brad Alband'), ORDER_TYPE.PROMO)
})

test('the code need not sit next to the year', () => {
  // Real Autumn pre-books are written "US - AB - SPRING 2026 PO#…".
  assert.equal(orderTypeOfRef('US - AB - SPRING 2026 PO#OR-1095198'), ORDER_TYPE.PREBOOK)
  assert.equal(orderTypeOfRef('US - AB - SPRING 2026 PO#Spring hats 2526'), ORDER_TYPE.PREBOOK)
})

test('free text yields no code even when it contains letters that look like one', () => {
  // The legend is a closed set, which is what keeps the token scan safe.
  for (const ref of [
    'US - Tone Stallone hat promo',
    'tone stallone spring hat',
    '2026 - TONY FAMILY GEAR 2',
    '2026 - Credit Card fees',
    'US - 2027 AUTUMN SAMPLES BILL',
    'ChesterBowlFFPromoEvent',
    'New England Summit Registration Trade',
  ]) {
    assert.equal(orderTypeOfRef(ref), ORDER_TYPE.UNCODED, ref)
  }
})

test('classifies each code group', () => {
  assert.equal(orderTypeOfRef('US - NB-2027 PO#1'), ORDER_TYPE.PREBOOK)
  assert.equal(orderTypeOfRef('US - AB-2027 PO#1'), ORDER_TYPE.PREBOOK)
  assert.equal(orderTypeOfRef('US - NRB-2026 PO#1'), ORDER_TYPE.PREBOOK)
  assert.equal(orderTypeOfRef('US - NIS-2026 x'), ORDER_TYPE.ATS)
  assert.equal(orderTypeOfRef('US - AIS-2026 x'), ORDER_TYPE.ATS)
  // NC and NCO both mean closeout.
  assert.equal(orderTypeOfRef('US - NCO-2026 PO# OR-1097937'), ORDER_TYPE.CLOSEOUT)
  assert.equal(orderTypeOfRef('US - NC-2025-CBS-SPORTS'), ORDER_TYPE.CLOSEOUT)
  assert.equal(orderTypeOfRef('US - NP-2026-PROMO-CADE'), ORDER_TYPE.PROMO)
  assert.equal(orderTypeOfRef('US - AP-2026 Common Line Promo'), ORDER_TYPE.PROMO)
  assert.equal(orderTypeOfRef('US - NW-2027 Brad Foard'), ORDER_TYPE.WARRANTY)
  assert.equal(orderTypeOfRef('US - AW-2027 JUSTIN CAUBS WARRANTY'), ORDER_TYPE.WARRANTY)
})

test('anything off-convention is UNCODED, not silently non-commissionable', () => {
  // These must surface for review rather than quietly zeroing a rep's commission.
  assert.equal(orderTypeOfRef('tone stallone spring hat'), ORDER_TYPE.UNCODED)
  assert.equal(orderTypeOfRef(''), ORDER_TYPE.UNCODED)
  assert.equal(orderTypeOfRef('New England Summit Registration'), ORDER_TYPE.UNCODED)
  // An unknown-but-well-formed code is also UNCODED, so a new code Tony starts
  // using shows up for review instead of being guessed at.
  assert.equal(orderTypeOfRef('US - XYZ-2026 something'), ORDER_TYPE.UNCODED)

  assert.equal(isNonCommissionable(ORDER_TYPE.UNCODED), false)
  assert.equal(isNonCommissionable(ORDER_TYPE.PROMO), true)
  assert.equal(isNonCommissionable(ORDER_TYPE.WARRANTY), true)
  assert.equal(isNonCommissionable(ORDER_TYPE.CLOSEOUT), false)
})

test('pulls the PO number out of the Ref', () => {
  assert.equal(poNumberFromRef('US - NCO-2026 PO# OR-1097937'), 'OR-1097937')
  assert.equal(poNumberFromRef('US - NB-2027 PO#4532139166'), '4532139166')
  assert.equal(poNumberFromRef('US - AIS-2026 Direct Uploads'), '')
})

const CSV = [
  '"Order ID",Invoice,Ref,Status,Customer,Total,Paid,"Date created","Order Notes"',
  '137100,SI-127329,"US - NCO-2026 PO# OR-1097937",Invoiced,"EVOLUCION INNOVATIONS","USD 67,453.20","USD 67,453.20",2026-04-14,"EVO Closeout ATS"',
  '137815,SI-127689,"US - NB-2027 PO#Nitro-26/27",Invoiced,"SPORTHAUS INC.","USD 1,000.00","USD 500.00",2026-08-12,"PREBOOK ORDER"',
  '137825,SI-127641,"US - AIS-2026 Direct Uploads",Invoiced,"Autumn Headwear","USD 200.00","USD 200.00",2026-08-13,""',
  '137999,,"US - AB-2027 PO#notyet",Invoiced,"Not Invoiced Yet","USD 10.00","USD 0.00",2026-08-14,""',
].join('\n')

test('parses a Brightpearl export and indexes it by invoice number', () => {
  const { byInvoice, rows, counts, skipped } = parseBrightpearlOrders(CSV)
  assert.equal(rows.length, 3)
  assert.equal(skipped, 1, 'the row with no invoice number is not yet invoiced')

  const co = byInvoice['SI-127329']
  assert.equal(co.orderType, ORDER_TYPE.CLOSEOUT)
  assert.equal(co.orderId, '137100')       // the Brightpearl sales-order number
  assert.equal(co.poNumber, 'OR-1097937')  // the customer PO
  assert.equal(co.paid, 67453.2)           // "USD 67,453.20" parses to a number

  assert.equal(byInvoice['SI-127689'].orderType, ORDER_TYPE.PREBOOK)
  assert.equal(byInvoice['SI-127641'].orderType, ORDER_TYPE.ATS)
  assert.deepEqual(counts, { closeout: 1, prebook: 1, ats: 1 })
})

test('rejects a CSV that is not a Brightpearl order export', () => {
  assert.throws(() => parseBrightpearlOrders('Date,Customer,Amount\n1/1/26,Bob,10'), /Brightpearl/)
})

test('an omitted order is non-commissionable and no longer asks for review', () => {
  // Tony reviews an uncoded invoice, decides it genuinely earns nothing, and
  // omits it. It must stop nagging AND stop paying — but stay distinguishable
  // from promo, because the reason it earns nothing is a judgement, not a code.
  assert.equal(isNonCommissionable(ORDER_TYPE.OMITTED), true)
  assert.notEqual(ORDER_TYPE.OMITTED, ORDER_TYPE.UNCODED)
  assert.notEqual(ORDER_TYPE.OMITTED, ORDER_TYPE.PROMO)
  // Still non-commissionable is NOT the same as review-worthy.
  assert.equal(isNonCommissionable(ORDER_TYPE.UNCODED), false)
})
