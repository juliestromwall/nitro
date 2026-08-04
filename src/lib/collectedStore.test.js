// Tests for collected-line accumulation / de-dup. The guarantee under test:
// overlapping weekly reports never double-count a paid line, but a newly-recorded
// payment (and a corrected amount) IS captured. Run: npm test.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSalesDetail, mergeCollectedLines } from './salesDetailParser.js'
import { computeCollectedCommission } from './collectedCommission.js'

const HEAD = [
  '"Foundry Distribution, Inc",,,,,,,,,',
  'Sales by Customer Detail,,,,,,,,,',
  '"July 21-August 3, 2026",,,,,,,,,',
  '',
  ',Transaction date,Transaction type,Num,Product/Service full name,Description,Quantity,Sales price,Amount,Balance',
]
const report = (rows, total) => [...HEAD, ...rows, `TOTAL,,,,,,,,${total},`].join('\n')

// Week 1: one NITRO payment on SI-1.
const A = report([
  'Test Shop,,,,,,,,,',
  ',08/01/2026,Invoice,SI-1,N833046-001142,LECTRA,10,210,200.00,200.00',
  'Total for Test Shop,,,,,,,,200.00,',
], '200.00')

// Week 2 OVERLAPS week 1 (SI-1 again, identical) and adds a new Autumn line (SI-2).
const B = report([
  'Test Shop,,,,,,,,,',
  ',08/01/2026,Invoice,SI-1,N833046-001142,LECTRA,10,210,200.00,200.00',
  ',08/02/2026,Invoice,SI-2,A26087-02M,SHADOW PANT,3,110,100.00,300.00',
  'Total for Test Shop,,,,,,,,300.00,',
], '300.00')

test('parser assigns a stable fingerprint; the same line re-parses to the same key', () => {
  const a = parseSalesDetail(A).lines.find(l => l.invoice === 'SI-1')
  const b = parseSalesDetail(B).lines.find(l => l.invoice === 'SI-1')
  assert.ok(a.key && a.key === b.key, 'SI-1 has the same key across both reports')
})

test('identical lines on one invoice stay distinct (occurrence index)', () => {
  const dup = report([
    'Dup Shop,,,,,,,,,',
    ',08/01/2026,Invoice,SI-9,N833046-001142,LECTRA,1,100,100.00,100.00',
    ',08/01/2026,Invoice,SI-9,N833046-001142,LECTRA,1,100,100.00,200.00',
    'Total for Dup Shop,,,,,,,,200.00,',
  ], '200.00')
  const keys = parseSalesDetail(dup).lines.filter(l => l.invoice === 'SI-9').map(l => l.key)
  assert.equal(keys.length, 2)
  assert.notEqual(keys[0], keys[1], 'two identical lines get distinct occurrence keys')
})

test('overlapping reports merge without double-counting; new payments are added', () => {
  const merged = mergeCollectedLines(parseSalesDetail(A).lines, parseSalesDetail(B).lines)
  // SI-1 appears in both reports but collapses to one; SI-2 is added → 2 lines.
  assert.equal(merged.filter(l => l.kind === 'brand').length, 2)
  assert.equal(merged.filter(l => l.invoice === 'SI-1').length, 1)

  const accounts = [{ id: 'a1', name: 'Test Shop', territory: 'SOCAL / AZ' }]
  const repTerritories = { 'rep-carter-katz': ['SOCAL / AZ'], 'rep-steve-clare': ['SOCAL / AZ'] }
  const { entries } = computeCollectedCommission({ lines: merged, accounts, repTerritories, season: '2025-26' })

  // NITRO (SI-1) counted ONCE for Steve Clare, not twice.
  const nitro = entries.filter(e => e.brand === 'NITRO' && !e.needsReview)
  assert.equal(nitro.length, 1, 'SI-1 NITRO line produces exactly one commission entry')
  assert.equal(nitro[0].repId, 'rep-steve-clare')
  // Autumn (SI-2, the newly-added payment) is present.
  assert.ok(entries.some(e => e.brand === 'Autumn/Corduroy' && !e.needsReview), 'new SI-2 payment captured')
})

test('a re-uploaded corrected amount wins (later upload replaces the line)', () => {
  const corrected = report([
    'Test Shop,,,,,,,,,',
    ',08/01/2026,Invoice,SI-1,N833046-001142,LECTRA,10,210,150.00,150.00',  // was 200, now 150
    'Total for Test Shop,,,,,,,,150.00,',
  ], '150.00')
  const merged = mergeCollectedLines(parseSalesDetail(A).lines, parseSalesDetail(corrected).lines)
  const si1 = merged.filter(l => l.invoice === 'SI-1')
  assert.equal(si1.length, 1)
  assert.equal(si1[0].paidAmount, 150, 'the corrected amount replaces the original')
})
