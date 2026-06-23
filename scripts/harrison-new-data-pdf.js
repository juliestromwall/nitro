// One-off PDF for Harrison's "new data" xlsx — production-style layout.
//
//   node scripts/harrison-new-data-pdf.js
//
// Reads docs/6.11.26 Commission Data/HARRISON/Harrison new data.xlsx,
// splits rows into paid invoices (positive COMMISSION) and samples /
// payments owed to Foundry (negative COMMISSION). Renders sections
// matching src/lib/repReport.js layout:
//   - Header (rep info)
//   - Summary KPIs (Earned / Owed / Net Available)
//   - Paid invoices by customer (with expanded sub-rows per invoice)
//   - Owed to Foundry (samples / personal orders)

import XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SRC = path.join(__dirname, '..', 'docs', '6.11.26 Commission Data', 'HARRISON', 'Harrison new data.xlsx')
const OUT = path.join(__dirname, '..', 'docs', '6.11.26 Commission Data', 'HARRISON', 'Harrison Montgomery — Commission Report (new data).pdf')

const REP = {
  name: 'Harrison Montgomery',
  agency: '',
  email: 'montyrepsnow@gmail.com',
  territories: ['SOUTHEAST'],
}

const TEAL_RGB = [0, 91, 91]
const RED_RGB = [180, 30, 30]

const fmtMoney = (n) => {
  if (n == null || isNaN(n)) return '—'
  const num = Number(n)
  const abs = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return num < 0 ? `-$${abs}` : `$${abs}`
}

const parseAmount = (v) => {
  if (v == null || v === '') return null
  const s = String(v).trim()
  if (!s) return null
  const isParen = /^\(.*\)$/.test(s)
  const cleaned = s.replace(/[$,()\s]/g, '')
  const n = parseFloat(cleaned)
  if (isNaN(n)) return null
  return isParen ? -n : n
}

// ── Read xlsx (no header — column order is fixed) ─────────────────────
const wb = XLSX.read(readFileSync(SRC), { cellDates: true })
const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })

const rows = []
for (const r of matrix) {
  if (!r || r.every(c => c == null || String(c).trim() === '')) continue
  const date = r[0] ? String(r[0]).trim() : ''
  const account = r[1] ? String(r[1]).trim() : ''
  const invoice = r[2] ? String(r[2]).trim() : ''
  const chk = r[3] ? String(r[3]).trim() : ''
  const amountPaid = parseAmount(r[4])
  const shipping = parseAmount(r[5])
  const actualPaid = parseAmount(r[6])
  const commission = parseAmount(r[7])
  if (!account && commission == null) continue
  rows.push({ date, account, invoice, chk, amountPaid, shipping, actualPaid, commission })
}

const positives = rows.filter(r => (r.commission || 0) > 0)
const negatives = rows.filter(r => (r.commission || 0) < 0)
const earned = positives.reduce((s, r) => s + (r.commission || 0), 0)
const owed = Math.abs(negatives.reduce((s, r) => s + (r.commission || 0), 0))
const net = earned - owed

// Group paid rows by canonical account name (uppercase, trimmed)
const canonAccount = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim()
const paidByCustomerMap = new Map()
for (const p of positives) {
  const k = canonAccount(p.account)
  if (!paidByCustomerMap.has(k)) paidByCustomerMap.set(k, { account: k, count: 0, amount: 0, commission: 0, rows: [] })
  const g = paidByCustomerMap.get(k)
  g.count += 1
  g.amount += p.actualPaid || 0
  g.commission += p.commission || 0
  g.rows.push(p)
}
const paidGrouped = Array.from(paidByCustomerMap.values()).sort((a, b) => b.commission - a.commission)

// ── PDF ───────────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10)
const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })

// Header
doc.setFontSize(18)
doc.setTextColor(...TEAL_RGB)
doc.text(`${REP.name} — Commission Report`, 40, 50)
doc.setTextColor(0)
doc.setFontSize(10)
let y = 70
if (REP.agency) { doc.text(REP.agency, 40, y); y += 14 }
if (REP.email) { doc.text(REP.email, 40, y); y += 14 }
if (REP.territories?.length) { doc.text(`Territories: ${REP.territories.join(', ')}`, 40, y); y += 14 }
doc.setTextColor(110)
doc.text(`Generated ${today}`, 40, y)
doc.setTextColor(0)
y += 20

// Summary KPIs
autoTable(doc, {
  startY: y,
  head: [['Earned', 'Owed to Foundry', 'Net Available']],
  body: [[
    { content: fmtMoney(earned), styles: { textColor: TEAL_RGB } },
    { content: fmtMoney(owed), styles: { textColor: RED_RGB } },
    { content: fmtMoney(net), styles: { textColor: net < 0 ? RED_RGB : TEAL_RGB } },
  ]],
  headStyles: { fillColor: TEAL_RGB, halign: 'center' },
  bodyStyles: { halign: 'center', fontStyle: 'bold', fontSize: 12 },
  styles: { fontSize: 10 },
  theme: 'grid',
})
y = doc.lastAutoTable.finalY + 20

// Paid invoices by customer (with sub-rows)
doc.setFontSize(13)
doc.setTextColor(...TEAL_RGB)
doc.text(`Paid invoices by customer — ${paidGrouped.length} ${paidGrouped.length === 1 ? 'customer' : 'customers'}, ${positives.length} ${positives.length === 1 ? 'invoice' : 'invoices'}`, 40, y)
doc.setTextColor(0)
y += 6

const paidBody = []
for (const g of paidGrouped) {
  paidBody.push([
    g.account,
    g.count,
    fmtMoney(g.amount),
    { content: fmtMoney(g.commission), styles: { fontStyle: 'bold', textColor: TEAL_RGB } },
  ])
  for (const inv of g.rows) {
    paidBody.push([
      '',
      { content: `•  ${inv.invoice || '—'}   ${inv.date || ''}`, styles: { textColor: 60, fontSize: 9, halign: 'left' } },
      { content: fmtMoney(inv.actualPaid), styles: { textColor: 60, fontSize: 9, halign: 'right' } },
      { content: fmtMoney(inv.commission), styles: { textColor: 60, fontSize: 9, halign: 'right' } },
    ])
  }
}
autoTable(doc, {
  startY: y,
  head: [[
    { content: 'Customer', styles: { halign: 'left' } },
    { content: 'Invoices Paid', styles: { halign: 'left' } },
    { content: 'Amount', styles: { halign: 'right' } },
    { content: 'Commission', styles: { halign: 'right' } },
  ]],
  body: paidBody,
  headStyles: { fillColor: TEAL_RGB },
  columnStyles: {
    0: { halign: 'left' },
    1: { halign: 'left' },
    2: { halign: 'right' },
    3: { halign: 'right' },
  },
  styles: { fontSize: 9, cellPadding: 5 },
  theme: 'striped',
  showFoot: 'lastPage',
  foot: [[
    { content: 'Total', styles: { fontStyle: 'bold', halign: 'left', textColor: [255, 255, 255] } },
    { content: positives.length, styles: { fontStyle: 'bold', halign: 'left', textColor: [255, 255, 255] } },
    { content: fmtMoney(positives.reduce((s, r) => s + (r.actualPaid || 0), 0)), styles: { fontStyle: 'bold', halign: 'right', textColor: [255, 255, 255] } },
    { content: fmtMoney(earned), styles: { fontStyle: 'bold', halign: 'right', textColor: [255, 255, 255] } },
  ]],
})
y = doc.lastAutoTable.finalY + 20

// Owed to Foundry (samples / personal orders)
doc.setFontSize(13)
doc.setTextColor(...TEAL_RGB)
doc.text(`Owed to Foundry (samples / personal orders) — ${negatives.length} ${negatives.length === 1 ? 'entry' : 'entries'}`, 40, y)
doc.setTextColor(0)
y += 6
autoTable(doc, {
  startY: y,
  head: [[
    { content: 'Date', styles: { halign: 'center' } },
    { content: 'Account', styles: { halign: 'left' } },
    { content: 'Notes', styles: { halign: 'left' } },
    { content: 'Amount', styles: { halign: 'right' } },
  ]],
  body: negatives.length === 0
    ? [[{ content: 'None.', colSpan: 4, styles: { halign: 'center', textColor: 120, fontStyle: 'italic' } }]]
    : negatives.map(r => [
        r.date,
        r.account,
        r.chk || '—',
        { content: fmtMoney(r.commission), styles: { fontStyle: 'bold', textColor: RED_RGB } },
      ]),
  headStyles: { fillColor: TEAL_RGB },
  columnStyles: {
    0: { halign: 'center' },
    1: { halign: 'left' },
    2: { halign: 'left' },
    3: { halign: 'right' },
  },
  styles: { fontSize: 10, cellPadding: 5 },
  theme: 'striped',
  showFoot: 'lastPage',
  foot: negatives.length > 0 ? [[
    { content: 'Total', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', textColor: [255, 255, 255] } },
    { content: fmtMoney(negatives.reduce((s, r) => s + (r.commission || 0), 0)), styles: { fontStyle: 'bold', halign: 'right', textColor: [255, 255, 255] } },
  ]] : undefined,
})

const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
writeFileSync(OUT, pdfBuffer)

console.log(`[Harrison] ${REP.name}`)
console.log(`  Earned:          ${fmtMoney(earned)} (${positives.length} invoices, ${paidGrouped.length} customers)`)
console.log(`  Owed to Foundry: ${fmtMoney(owed)} (${negatives.length} entries)`)
console.log(`  Net Available:   ${fmtMoney(net)}`)
console.log(`  → ${OUT}`)
