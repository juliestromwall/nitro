// One-off generator for the 6.11.26 monthly commission PDFs.
//   node scripts/build-rep-commission-pdf.js "<repNameKey>"
// Example: node scripts/build-rep-commission-pdf.js ADAM
//
// Reads the xlsx from Docs/6.11.26 Commission Data/<repKey>/*.xlsx, expects
// these columns (case-insensitive): DATE, ACCOUNT, INVOICE, CHK#, AMOUNT PAID,
// SHIPPING CHARGE, ACTUAL PAID, COMMISSION, RUNNING TOTAL, NOTES.
//
// Splits rows into Paid (positive COMMISSION) and Promo/Samples/Owed
// (negative COMMISSION). Writes a PDF next to the source xlsx.

import XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { lookupBrand } from '../src/lib/catalogs.js'
import { ACCOUNTS, REP_BRANDS } from '../src/lib/paymentsDemoData.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_ROOT = path.join(__dirname, '..', 'Docs', '6.11.26 Commission Data')

// Rep display info — keyed by folder name. `brandFilter` (when set) limits
// the "Open / unpaid invoices by customer" section to only invoices whose
// line items resolve to that brand via the catalog map.
const REPS = {
  ADAM:     { repId: 'rep-adam',                  name: 'Adam Stromwall',       agency: 'Stromwall Group, LLC',  email: 'adam@foundrydist.com',         territories: ['MIDWEST PLAINS'],                              rentalNitroOnly: true },
  CARTER:   { repId: 'rep-carter-katz',           name: 'Carter Katz',          agency: 'Kaleidoscope',          email: 'contactcarternow@yahoo.com',   territories: ['SOCAL / AZ'] },
  CLARE:    { repId: 'rep-steve-clare',           name: 'Steve Clare',          agency: "Don't Clare At Me",     email: 'dontclare@me.com',             territories: ['SOCAL / AZ'] },
  CODY:     { repId: 'rep-cody-prudoehl',         name: 'Cody Prudoehl',        agency: '',                       email: 'cody.p.mw@gmail.com',          territories: ['MIDWEST PLAINS'] },
  COOPER:   { repId: 'rep-chris-cooper',          name: 'Chris Cooper',         agency: 'Spraying Gravy',        email: 'coops@sprayinggravy.com',      territories: ['EAST COAST (PA, NY, NJ, DE)'] },
  DAVE:     { repId: 'rep-dave-spruill',          name: 'Dave Spruill',         agency: 'Dark Blizzard',         email: 'darkblizzardsales@gmail.com',  territories: ['EAST COAST (PA, NY, NJ, DE)'] },
  HARRISON: { repId: 'rep-harrison-montgomery',   name: 'Harrison Montgomery',  agency: '',                       email: 'montyrepsnow@gmail.com',       territories: ['SOUTHEAST'] },
  JASON:    { repId: 'rep-jason',                 name: 'Jason Martin',         agency: 'Blue Collar',           email: 'jmartin@gmail.com',            territories: ['NORCAL'] },
  JJ:       { repId: 'rep-jj-catlett',            name: 'JJ Catlett',           agency: '',                       email: 'jj_catlett@mac.com',           territories: ['SOUTHEAST'] },
  KULAK:    { repId: 'rep-bryan-kulak',           name: 'Bryan Kulak',          agency: 'Kulak Sales',           email: 'Kulaksales@gmail.com',         territories: ['MIDWEST PLAINS'] },
  RICKER:   { repId: 'rep-evan-ricker',           name: 'Evan Ricker',          agency: '',                       email: 'e.ricker@icloud.com',          territories: ['NEW ENGLAND'] },
  ROB:      { repId: 'rep-rob',                   name: 'Rob Aragon',           agency: 'Something Clever',      email: 'rob@somethingclever.com',      territories: ['PNW'] },
  TREVOR:   { repId: 'rep-trevor-stockhausen',    name: 'Trevor Stockhausen',   agency: '',                       email: '',                              territories: ['NEW ENGLAND'] },
  WISE:     { repId: 'rep-andy-wise',             name: 'Andy Wise',            agency: 'NickelandDiamond Sales', email: 'nickelndiamondsales@gmail.com', territories: ['SOUTHWEST (UT, CO, NM, TX)'] },
}

// Brands each rep covers, derived from REP_BRANDS in paymentsDemoData.js.
function brandsForRep(repId) {
  return Array.from(new Set(REP_BRANDS.filter(rb => rb.repId === repId).map(rb => rb.brandId)))
}

const BRAND_DISPLAY = {
  'brand-autumn': 'Autumn',
  'brand-nitro':  'NITRO',
  'brand-l1':     'L1',
  'brand-eivy':   'EIVY',
}

const TEAL_RGB = [0, 91, 91]
const fmtMoney = (n) => {
  if (n == null || isNaN(n)) return '—'
  const num = Number(n)
  const abs = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return num < 0 ? `-$${abs}` : `$${abs}`
}
const fmtDate = (v) => {
  if (v == null) return ''
  if (v instanceof Date) {
    const mm = String(v.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(v.getUTCDate()).padStart(2, '0')
    const yy = String(v.getUTCFullYear()).slice(-2)
    return `${mm}/${dd}/${yy}`
  }
  return String(v).trim()
}
const parseAmount = (v) => {
  if (v == null || v === '') return null
  const n = parseFloat(String(v).replace(/[$,]/g, ''))
  return isNaN(n) ? null : n
}

function findXlsx(folder, predicate) {
  const files = readdirSync(folder).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'))
  const match = predicate ? files.find(predicate) : files[0]
  return match ? path.join(folder, match) : null
}

// One-time prefix fallback for the 6.11.26 reports — applied ONLY when the
// catalog lookup misses (i.e. SKU not in any catalog xlsx). Tony's call for
// this single run. NOT mirrored in the in-app commission engine.
//   A26* → Autumn   (covers 2026-27 carry-over not yet in catalog)
//   N*   → NITRO    (covers older-season Nitro + NP-prefix parts)
function fallbackBrandFromPrefix(sku) {
  if (!sku) return null
  const u = sku.toUpperCase()
  if (u.startsWith('A26')) return 'brand-autumn'
  if (u.startsWith('N'))   return 'brand-nitro'
  return null
}

// Rental-NITRO identification — used to filter Adam's PDF (he's the rental
// specialist). An invoice qualifies as rental-NITRO if ANY of its line items:
//   (a) catalog match with brandId 'brand-nitro' AND isRental === true, OR
//   (b) NP* prefix SKU (Nitro Parts — rental gear consumables)
function isRentalNitroSku(sku, info) {
  if (info?.brandId === 'brand-nitro' && info?.isRental) return true
  if (sku && sku.toUpperCase().startsWith('NP')) return true
  return false
}

let _rentalNitroNumsCache = null
function loadRentalNitroNums() {
  if (_rentalNitroNumsCache) return _rentalNitroNumsCache
  if (!existsSync(LINE_ITEMS_CSV)) return _rentalNitroNumsCache = new Set()
  const wb = XLSX.read(readFileSync(LINE_ITEMS_CSV), { cellDates: true })
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
  const headerIdx = matrix.findIndex(r => {
    if (!r) return false
    const cells = r.map(c => String(c || '').toLowerCase().trim())
    return cells.includes('num') && cells.some(c => c.includes('product/service'))
  })
  const headers = matrix[headerIdx].map(c => String(c || '').toLowerCase().trim())
  const numCol = headers.indexOf('num')
  const skuCol = headers.findIndex(h => h.includes('product/service'))
  const out = new Set()
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i]
    if (!row) continue
    const num = String(row[numCol] || '').trim()
    if (!num) continue
    const sku = String(row[skuCol] || '').trim()
    if (isRentalNitroSku(sku, lookupBrand(sku))) out.add(num)
  }
  _rentalNitroNumsCache = out
  return out
}

// Build a map: invoiceNum → Set of brandIds, derived from the line items CSV
// + catalog map (with the prefix fallback above as a safety net for this run).
const LINE_ITEMS_CSV = path.join(__dirname, '..', 'Invoice data', '2025-26', 'Foundry Distribution, Inc line items 8.1 - 5.27.26.csv')
let _brandsByNumCache = null
function loadBrandsByInvoiceNum() {
  if (_brandsByNumCache) return _brandsByNumCache
  if (!existsSync(LINE_ITEMS_CSV)) {
    console.warn(`Line items CSV missing at ${LINE_ITEMS_CSV} — Open Invoices brand filter will treat everything as unknown.`)
    return _brandsByNumCache = {}
  }
  const wb = XLSX.read(readFileSync(LINE_ITEMS_CSV), { cellDates: true })
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
  const headerIdx = matrix.findIndex(r => {
    if (!r) return false
    const cells = r.map(c => String(c || '').toLowerCase().trim())
    return cells.includes('num') && cells.some(c => c.includes('product/service'))
  })
  const headers = matrix[headerIdx].map(c => String(c || '').toLowerCase().trim())
  const numCol = headers.indexOf('num')
  const skuCol = headers.findIndex(h => h.includes('product/service'))
  const map = {}
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i]
    if (!row) continue
    const num = String(row[numCol] || '').trim()
    if (!num) continue
    const sku = String(row[skuCol] || '').trim()
    const info = lookupBrand(sku)
    const brandId = info?.brandId || fallbackBrandFromPrefix(sku)
    if (!brandId) continue
    if (!map[num]) map[num] = new Set()
    map[num].add(brandId)
  }
  // Convert sets to arrays for stable output
  const out = {}
  for (const k of Object.keys(map)) out[k] = Array.from(map[k])
  _brandsByNumCache = out
  return out
}

function parseOpenInvoicesReport(filePath) {
  const wb = XLSX.read(readFileSync(filePath), { cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const headerIdx = matrix.findIndex(r => {
    if (!r) return false
    const cells = r.map(c => String(c || '').toLowerCase().trim())
    return cells.includes('customer') && cells.includes('num') && cells.includes('open balance')
  })
  if (headerIdx === -1) throw new Error('Open Invoices Report: could not find header row with Customer / Num / Open balance')
  const headers = matrix[headerIdx].map(c => String(c || '').toLowerCase().trim())
  const col = {
    customer: headers.indexOf('customer'),
    date: headers.indexOf('date'),
    dueDate: headers.indexOf('due date'),
    num: headers.indexOf('num'),
    amount: headers.indexOf('amount'),
    openBalance: headers.indexOf('open balance'),
  }
  const rows = []
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i]
    if (!r || r.every(c => c == null || String(c).trim() === '')) continue
    const num = String(r[col.num] || '').trim()
    if (!num) continue
    rows.push({
      customer: String(r[col.customer] || '').trim(),
      date: fmtDate(r[col.date]),
      dueDate: fmtDate(r[col.dueDate]),
      num,
      amount: parseAmount(r[col.amount]),
      openBalance: parseAmount(r[col.openBalance]),
    })
  }
  return rows
}

// Match an invoice customer name → account → territory. Uses the same
// normalization as the commission engine (strips "- Contact" suffix, parens,
// apostrophes) plus a substring fallback so name variants still match.
const normCustomerName = (s) => String(s || '')
  .toUpperCase()
  .replace(/['']/g, '')
  .replace(/\([^)]*\)/g, '')
  .replace(/\s+-\s.*$/, '')
  .replace(/[^A-Z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

let _accountsByNormName = null
function getAccountsByName() {
  if (_accountsByNormName) return _accountsByNormName
  const m = new Map()
  for (const a of ACCOUNTS) {
    if (a?.name) m.set(normCustomerName(a.name), a)
  }
  _accountsByNormName = m
  return m
}

function findTerritory(customerName) {
  const byName = getAccountsByName()
  const n = normCustomerName(customerName)
  if (!n) return null
  const exact = byName.get(n)
  if (exact) return exact.territory
  for (const [key, a] of byName.entries()) {
    if (Math.min(key.length, n.length) >= 4 && (key.includes(n) || n.includes(key))) {
      return a.territory
    }
  }
  return null
}

// Filter open invoices by brand AND territory. Tracks exclusion reasons.
// `allowedBrands` is an array (rep can cover multiple brands).
// When `rentalNitroOnly` is true, additionally restrict to invoices that
// contain at least one rental NITRO line item (Adam's filter).
function filterOpenInvoices(openRows, allowedBrands, allowedTerritories, rentalNitroOnly = false) {
  const brandsByNum = (allowedBrands && allowedBrands.length) ? loadBrandsByInvoiceNum() : null
  const rentalNitroSet = rentalNitroOnly ? loadRentalNitroNums() : null
  const matched = []
  const reasons = { unattributedBrand: [], otherBrand: [], noTerritory: [], otherTerritory: [], notRental: [] }
  const territorySet = allowedTerritories ? new Set(allowedTerritories) : null
  const brandSet = allowedBrands ? new Set(allowedBrands) : null
  for (const row of openRows) {
    if (brandSet) {
      const brands = brandsByNum[row.num]
      if (!brands || brands.length === 0) { reasons.unattributedBrand.push(row); continue }
      if (!brands.some(b => brandSet.has(b))) { reasons.otherBrand.push(row); continue }
    }
    if (rentalNitroSet && !rentalNitroSet.has(row.num)) { reasons.notRental.push(row); continue }
    if (territorySet) {
      const terr = findTerritory(row.customer)
      if (!terr) { reasons.noTerritory.push(row); continue }
      if (!territorySet.has(terr)) { reasons.otherTerritory.push(row); continue }
    }
    matched.push(row)
  }
  return { matched, reasons }
}

function groupOpenByCustomer(rows) {
  const m = {}
  for (const r of rows) {
    const k = canonicalAccount(r.customer)
    if (!m[k]) m[k] = { customer: k, count: 0, amount: 0, openBalance: 0 }
    m[k].count += 1
    m[k].amount += r.amount || 0
    m[k].openBalance += r.openBalance || 0
  }
  return Object.values(m).sort((a, b) => b.openBalance - a.openBalance)
}

function parseSheet(filePath) {
  const wb = XLSX.read(readFileSync(filePath), { cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  // Find the header row — first row that contains both "ACCOUNT" and "COMMISSION"
  const headerIdx = matrix.findIndex(r => {
    if (!r) return false
    const cells = r.map(c => String(c || '').toLowerCase().trim())
    return cells.includes('account') && cells.includes('commission')
  })
  if (headerIdx === -1) throw new Error('Could not find header row with ACCOUNT and COMMISSION columns')

  const headers = matrix[headerIdx].map(c => String(c || '').toLowerCase().trim())
  const colOf = (label, fallback) => {
    const i = headers.indexOf(label.toLowerCase())
    return i >= 0 ? i : (fallback ?? -1)
  }
  const col = {
    date: colOf('v') >= 0 ? colOf('v') : colOf('date'),  // "v" is the date column header in Adam's sheet
    account: colOf('account'),
    invoice: colOf('invoice'),
    chk: colOf('chk#') >= 0 ? colOf('chk#') : colOf('check#'),
    amountPaid: colOf('amount paid'),
    shipping: colOf('shipping charge'),
    actualPaid: colOf('actual paid'),
    commission: colOf('commission'),
    runningTotal: colOf('running total'),
    notes: colOf('notes'),
  }

  const rows = []
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i]
    if (!r || r.every(c => c == null || String(c).trim() === '')) continue
    const account = col.account >= 0 ? String(r[col.account] || '').trim() : ''
    let commission = col.commission >= 0 ? parseAmount(r[col.commission]) : null
    // Fallback: if COMMISSION is blank but RUNNING TOTAL is set (e.g. Dave's
    // sheet has a single "NEW TOTAL DUE FROM FOUNDRY" rollover row), use the
    // running total as the commission for this row.
    if (commission == null && col.runningTotal >= 0) {
      const rt = parseAmount(r[col.runningTotal])
      if (rt != null && account) commission = rt
    }
    if (!account && commission == null) continue
    rows.push({
      date: col.date >= 0 ? fmtDate(r[col.date]) : '',
      account,
      invoice: col.invoice >= 0 ? String(r[col.invoice] || '').trim() : '',
      chk: col.chk >= 0 ? String(r[col.chk] || '').trim() : '',
      amountPaid: col.amountPaid >= 0 ? parseAmount(r[col.amountPaid]) : null,
      shipping: col.shipping >= 0 ? parseAmount(r[col.shipping]) : null,
      actualPaid: col.actualPaid >= 0 ? parseAmount(r[col.actualPaid]) : null,
      commission,
      notes: col.notes >= 0 ? String(r[col.notes] || '').trim() : '',
    })
  }
  return rows
}

// Customer-name aliases — normalize typos / variants so a single customer
// doesn't show up as two rows. Key is matched case-insensitively against
// the spreadsheet's ACCOUNT value; value is the canonical display name.
const CUSTOMER_ALIASES = {
  'WUT HUT': 'WHAT HUT',
}

function canonicalAccount(name) {
  if (!name) return '(unknown)'
  const u = name.trim().toUpperCase()
  for (const [from, to] of Object.entries(CUSTOMER_ALIASES)) {
    if (from.toUpperCase() === u) return to
  }
  return name.trim()
}

function groupPaidByAccount(positives) {
  const m = {}
  for (const r of positives) {
    const k = canonicalAccount(r.account)
    if (!m[k]) m[k] = { account: k, count: 0, amount: 0, commission: 0 }
    m[k].count += 1
    m[k].amount += r.actualPaid || 0
    m[k].commission += r.commission || 0
  }
  return Object.values(m).sort((a, b) => b.commission - a.commission)
}

function buildPDF({ rep, positives, negatives, openRows, openBrandFilter, openUnattributedCount, outPath }) {
  const earned = positives.reduce((s, r) => s + (r.commission || 0), 0)
  const owed = Math.abs(negatives.reduce((s, r) => s + (r.commission || 0), 0))
  const net = earned - owed
  const paidGrouped = groupPaidByAccount(positives)
  const today = new Date().toISOString().slice(0, 10)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })

  // Header
  doc.setFontSize(18)
  doc.setTextColor(...TEAL_RGB)
  doc.text(`${rep.name} — Commission Report`, 40, 50)
  doc.setTextColor(0)
  doc.setFontSize(10)
  let y = 70
  if (rep.agency) { doc.text(rep.agency, 40, y); y += 14 }
  if (rep.email) { doc.text(rep.email, 40, y); y += 14 }
  if (rep.territories?.length) { doc.text(`Territories: ${rep.territories.join(', ')}`, 40, y); y += 14 }
  doc.setTextColor(110)
  doc.text(`Generated ${today}`, 40, y)
  doc.setTextColor(0)
  y += 18

  // Summary KPIs — Net Available turns red when negative
  autoTable(doc, {
    startY: y,
    head: [['Earned', 'Owed to Foundry', 'Net Available']],
    body: [[
      fmtMoney(earned),
      fmtMoney(owed),
      { content: fmtMoney(net), styles: { textColor: net < 0 ? [180, 30, 30] : [0, 0, 0] } },
    ]],
    headStyles: { fillColor: TEAL_RGB, halign: 'center' },
    bodyStyles: { halign: 'center', fontStyle: 'bold', fontSize: 12 },
    styles: { fontSize: 10 },
    theme: 'grid',
  })
  y = doc.lastAutoTable.finalY + 20

  // Paid invoices by customer
  doc.setFontSize(13)
  doc.setTextColor(...TEAL_RGB)
  doc.text(`Paid invoices by customer — ${paidGrouped.length} ${paidGrouped.length === 1 ? 'customer' : 'customers'}, ${positives.length} ${positives.length === 1 ? 'entry' : 'entries'}`, 40, y)
  doc.setTextColor(0)
  y += 6
  autoTable(doc, {
    startY: y,
    head: [['Customer', 'Entries', 'Amount Paid', 'Commission']],
    body: paidGrouped.length === 0
      ? [[{ content: 'No paid entries.', colSpan: 4, styles: { halign: 'center', textColor: 120, fontStyle: 'italic' } }]]
      : paidGrouped.map(g => [
          g.account,
          g.count,
          fmtMoney(g.amount),
          { content: fmtMoney(g.commission), styles: { fontStyle: 'bold', textColor: TEAL_RGB } },
        ]),
    headStyles: { fillColor: TEAL_RGB, halign: 'center' },
    columnStyles: {
      0: { halign: 'center' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
    },
    styles: { fontSize: 10, cellPadding: 5 },
    theme: 'striped',
    footStyles: { halign: 'center' },
    foot: paidGrouped.length > 0 ? [[
      { content: 'Total', styles: { fontStyle: 'bold', halign: 'center' } },
      { content: positives.length, styles: { fontStyle: 'bold', halign: 'center' } },
      { content: fmtMoney(positives.reduce((s, r) => s + (r.actualPaid || 0), 0)), styles: { fontStyle: 'bold', halign: 'center' } },
      { content: fmtMoney(earned), styles: { fontStyle: 'bold', textColor: [255, 255, 255], halign: 'center' } },
    ]] : undefined,
  })
  y = doc.lastAutoTable.finalY + 20

  // Promo, samples, and payments due to Foundry
  doc.setFontSize(13)
  doc.setTextColor(...TEAL_RGB)
  doc.text(`Promo, samples, and payments due to Foundry — ${negatives.length} ${negatives.length === 1 ? 'entry' : 'entries'}`, 40, y)
  doc.setTextColor(0)
  y += 6
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Account', 'Notes', 'Amount']],
    body: negatives.length === 0
      ? [[{ content: 'None.', colSpan: 4, styles: { halign: 'center', textColor: 120, fontStyle: 'italic' } }]]
      : negatives.map(r => [
          r.date,
          r.account,
          r.notes || '—',
          { content: fmtMoney(r.commission), styles: { halign: 'right', fontStyle: 'bold', textColor: [180, 30, 30] } },
        ]),
    headStyles: { fillColor: TEAL_RGB, halign: 'center' },
    columnStyles: {
      0: { halign: 'center' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
    },
    styles: { fontSize: 10, cellPadding: 5 },
    theme: 'striped',
    footStyles: { halign: 'center' },
    foot: negatives.length > 0 ? [[
      { content: 'Total', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold' } },
      { content: fmtMoney(negatives.reduce((s, r) => s + (r.commission || 0), 0)), styles: { halign: 'center', fontStyle: 'bold', textColor: [180, 30, 30] } },
    ]] : undefined,
  })

  // Open / unpaid invoices by customer (only rendered when an open report was supplied)
  let openGrouped = []
  let openTotalAmount = 0, openTotalBalance = 0
  if (openRows) {
    y = doc.lastAutoTable.finalY + 20
    openGrouped = groupOpenByCustomer(openRows)
    openTotalAmount = openRows.reduce((s, r) => s + (r.amount || 0), 0)
    openTotalBalance = openRows.reduce((s, r) => s + (r.openBalance || 0), 0)
    const brandLabel = openBrandFilter ? ` (${BRAND_DISPLAY[openBrandFilter] || openBrandFilter})` : ''
    doc.setFontSize(13)
    doc.setTextColor(...TEAL_RGB)
    doc.text(
      `Open / unpaid invoices by customer${brandLabel} — ${openGrouped.length} ${openGrouped.length === 1 ? 'customer' : 'customers'}, ${openRows.length} ${openRows.length === 1 ? 'invoice' : 'invoices'}`,
      40, y
    )
    doc.setTextColor(0)
    y += 6
    autoTable(doc, {
      startY: y,
      head: [['Customer', 'Invoices', 'Amount', 'Open Balance']],
      body: openGrouped.length === 0
        ? [[{ content: 'No matching open invoices.', colSpan: 4, styles: { halign: 'center', textColor: 120, fontStyle: 'italic' } }]]
        : openGrouped.map(g => [
            g.customer,
            g.count,
            fmtMoney(g.amount),
            { content: fmtMoney(g.openBalance), styles: { fontStyle: 'bold', textColor: TEAL_RGB } },
          ]),
      headStyles: { fillColor: TEAL_RGB, halign: 'center' },
      columnStyles: {
        0: { halign: 'center' },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
      },
      styles: { fontSize: 10, cellPadding: 5 },
      theme: 'striped',
      footStyles: { halign: 'center' },
      foot: openGrouped.length > 0 ? [[
        { content: 'Total', styles: { fontStyle: 'bold', halign: 'center' } },
        { content: openRows.length, styles: { fontStyle: 'bold', halign: 'center' } },
        { content: fmtMoney(openTotalAmount), styles: { fontStyle: 'bold', halign: 'center' } },
        { content: fmtMoney(openTotalBalance), styles: { fontStyle: 'bold', textColor: [255, 255, 255], halign: 'center' } },
      ]] : undefined,
    })
    if (openUnattributedCount > 0) {
      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text(
        `Note: ${openUnattributedCount} open invoice${openUnattributedCount === 1 ? '' : 's'} couldn't be brand-attributed (no line items in catalog data) and ${openUnattributedCount === 1 ? 'is' : 'are'} excluded.`,
        40, doc.lastAutoTable.finalY + 12
      )
      doc.setTextColor(0)
    }
  }

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
  writeFileSync(outPath, pdfBuffer)
  return { earned, owed, net, paidGrouped, positives, negatives, openGrouped, openTotalBalance }
}

// Open Invoices Report lives at the parent level — applies to every rep.
// Parsed once and reused.
let _openReportCache = null
function loadOpenReport() {
  if (_openReportCache !== null) return _openReportCache
  const openXlsx = findXlsx(DATA_ROOT, f => /open\s*invoices?/i.test(f))
  if (!openXlsx) { _openReportCache = null; return null }
  _openReportCache = parseOpenInvoicesReport(openXlsx)
  return _openReportCache
}

function generateForRep(repKey) {
  const rep = REPS[repKey]
  if (!rep) throw new Error(`Unknown rep key: ${repKey}`)
  const folder = path.join(DATA_ROOT, repKey)

  // Rep commission xlsx — optional. If missing, paid/negatives are empty.
  const repXlsx = findXlsx(folder, f => !/open\s*invoices?/i.test(f))
  const rows = repXlsx ? parseSheet(repXlsx) : []
  const positives = rows.filter(r => (r.commission || 0) > 0)
  const negatives = rows.filter(r => (r.commission || 0) < 0)

  // Open invoices section — filter by all brands this rep covers + their territory.
  // For Adam (rentalNitroOnly), restrict to rental NITRO and ignore Autumn.
  const allOpen = loadOpenReport()
  let openRows = null
  let openSummary = null
  if (allOpen) {
    const allowedBrands = rep.rentalNitroOnly ? ['brand-nitro'] : brandsForRep(rep.repId)
    const { matched, reasons } = filterOpenInvoices(allOpen, allowedBrands, rep.territories, rep.rentalNitroOnly)
    openRows = matched
    openSummary = { total: allOpen.length, included: matched.length, ...reasons, allowedBrands, rentalNitroOnly: !!rep.rentalNitroOnly }
  }

  const outPath = path.join(folder, `${rep.name} — Commission Report 6.11.26.pdf`)
  const result = buildPDF({
    rep, positives, negatives, openRows,
    openBrandFilter: null, // multi-brand now — heading omits brand label
    openUnattributedCount: 0, // edge cases excluded silently per Tony's call
    outPath,
  })

  const brandLabel = openSummary ? openSummary.allowedBrands.map(b => BRAND_DISPLAY[b] || b).join('/') : ''
  console.log(`[${repKey}] ${rep.name}`)
  console.log(`  Earned:          ${fmtMoney(result.earned)} (${positives.length} entries, ${result.paidGrouped.length} customers)`)
  console.log(`  Owed to Foundry: ${fmtMoney(result.owed)} (${negatives.length} ${negatives.length === 1 ? 'entry' : 'entries'})`)
  console.log(`  Net Available:   ${fmtMoney(result.net)}`)
  if (openSummary) {
    const tag = openSummary.rentalNitroOnly ? ' (RENTAL-only)' : ''
    console.log(`  Open invoices:   ${fmtMoney(result.openTotalBalance)} (${openSummary.included} of ${openSummary.total} — ${brandLabel}${tag} in ${rep.territories.join(' / ')})`)
    const parts = [
      `wrong brand: ${openSummary.otherBrand.length}`,
      `other territory: ${openSummary.otherTerritory.length}`,
      `no brand data: ${openSummary.unattributedBrand.length}`,
      `not in accounts: ${openSummary.noTerritory.length}`,
    ]
    if (openSummary.rentalNitroOnly) parts.push(`not rental: ${openSummary.notRental.length}`)
    console.log(`    Excluded — ${parts.join(', ')}`)
  }
  console.log(`  → ${outPath}`)
  console.log()
}

function main() {
  const arg = process.argv[2]
  const keys = (!arg || arg === '--all')
    ? Object.keys(REPS)
    : [arg.toUpperCase()]
  for (const k of keys) {
    try { generateForRep(k) } catch (e) { console.error(`[${k}] FAILED: ${e.message}`) }
  }
}

main()
