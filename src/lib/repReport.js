// Per-rep commission report exporter (PDF + XLSX).
// Produces a multi-section report matching the in-app ledger view:
//   1. Header (rep info + report metadata)
//   2. Summary KPIs (earned / paid out / available / pending)
//   3. Paid invoices (filterable by "since" date)
//   4. Open / unpaid invoices
//   5. Recorded commission payouts

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx-js-style'

// ─── Shared helpers ───────────────────────────────────────────────────

const TEAL_RGB = [0, 91, 91]
const TEAL_HEX = '005B5B'

const fmtMoney = (n) => {
  if (n == null || isNaN(n)) return '—'
  const num = Number(n)
  const abs = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return num < 0 ? `-$${abs}` : `$${abs}`
}

function sanitizeFilename(s) {
  return String(s || 'rep').replace(/[/\\?%*:|"<>]/g, ' ').replace(/\s+/g, ' ').trim()
}

function splitInvoices(byInvoice = {}) {
  const paid = [], open = []
  for (const k of Object.keys(byInvoice)) {
    const inv = byInvoice[k]
    if (inv.status === 'Paid') paid.push(inv)
    else if (inv.status === 'Open' || inv.status === 'Partial') open.push(inv)
  }
  paid.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  open.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
  return { paid, open }
}

function applyPaidSince(paidInvoices, paidSince) {
  if (!paidSince) return paidInvoices
  return paidInvoices.filter(i => (i.date || '') >= paidSince)
}

function groupPaidByCustomer(paidInvoices) {
  const m = {}
  for (const inv of paidInvoices) {
    const key = inv.customer || '(unknown)'
    if (!m[key]) m[key] = { customer: key, count: 0, amount: 0, commission: 0 }
    m[key].count += 1
    m[key].amount += inv.amount || 0
    m[key].commission += inv.commission || 0
  }
  return Object.values(m).sort((a, b) => b.commission - a.commission)
}

function groupOpenByCustomer(openInvoices) {
  const m = {}
  for (const inv of openInvoices) {
    const key = inv.customer || '(unknown)'
    if (!m[key]) m[key] = { customer: key, count: 0, amount: 0, openBalance: 0, pending: 0 }
    m[key].count += 1
    m[key].amount += inv.amount || 0
    m[key].openBalance += inv.openBalance || 0
    m[key].pending += (inv.commission || 0) - (inv.commissionAvailable || 0)
  }
  return Object.values(m).sort((a, b) => b.openBalance - a.openBalance)
}

// ─── PDF ──────────────────────────────────────────────────────────────

export function exportRepReportPDF({ rep, summary, byInvoice, payouts, paidSince, territories, groupByCustomer = true, brandSubtotals = [] }) {
  const safe = summary || { earned: 0, paidOut: 0, available: 0, openCommission: 0 }
  const { paid, open } = splitInvoices(byInvoice)
  const paidVisible = applyPaidSince(paid, paidSince)
  const paidGrouped = groupPaidByCustomer(paidVisible)
  const openGrouped = groupOpenByCustomer(open)
  const today = new Date().toISOString().slice(0, 10)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })

  // ─── Header ───────────────────────────────────────────────────────
  doc.setFontSize(18)
  doc.setTextColor(...TEAL_RGB)
  doc.text(`${rep.name} — Commission Report`, 40, 50)
  doc.setTextColor(0)
  doc.setFontSize(10)
  let y = 70
  if (rep.agency) { doc.text(rep.agency, 40, y); y += 14 }
  if (rep.email) { doc.text(rep.email, 40, y); y += 14 }
  if (territories?.length) { doc.text(`Territories: ${territories.join(', ')}`, 40, y); y += 14 }
  doc.setTextColor(110)
  doc.text(`Generated ${today}` + (paidSince ? ` • Paid invoices since ${paidSince}` : ''), 40, y)
  doc.setTextColor(0)
  y += 20

  // ─── Summary KPIs ─────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [['Earned', 'Paid Out', 'Available', 'Pending (open invoices)']],
    body: [[fmtMoney(safe.earned), fmtMoney(safe.paidOut), fmtMoney(safe.available), fmtMoney(safe.openCommission)]],
    headStyles: { fillColor: TEAL_RGB, halign: 'center' },
    bodyStyles: { halign: 'center', fontStyle: 'bold', fontSize: 12 },
    styles: { fontSize: 10 },
    theme: 'grid',
  })
  y = doc.lastAutoTable.finalY + 20

  // ─── Earned by brand ──────────────────────────────────────────────
  if (brandSubtotals && brandSubtotals.length > 0) {
    doc.setFontSize(11)
    doc.setTextColor(...TEAL_RGB)
    doc.text(`Earned by brand${paidSince ? ` (since ${paidSince})` : ''}`, 40, y)
    doc.setTextColor(0)
    y += 6
    autoTable(doc, {
      startY: y,
      head: [brandSubtotals.map(b => b.brand)],
      body: [brandSubtotals.map(b => ({ content: fmtMoney(b.commission), styles: { halign: 'center', fontStyle: 'bold', textColor: TEAL_RGB } }))],
      headStyles: { fillColor: TEAL_RGB, halign: 'center' },
      styles: { fontSize: 10 },
      theme: 'grid',
    })
    y = doc.lastAutoTable.finalY + 20
  }

  // ─── Paid invoices ────────────────────────────────────────────────
  doc.setFontSize(13)
  doc.setTextColor(...TEAL_RGB)
  if (groupByCustomer) {
    doc.text(
      `Paid invoices by customer${paidSince ? ` (since ${paidSince})` : ''} — ${paidGrouped.length} ${paidGrouped.length === 1 ? 'customer' : 'customers'}, ${paidVisible.length} ${paidVisible.length === 1 ? 'invoice' : 'invoices'}`,
      40, y
    )
  } else {
    doc.text(
      `Paid invoices${paidSince ? ` (since ${paidSince})` : ''} — ${paidVisible.length} ${paidVisible.length === 1 ? 'invoice' : 'invoices'}`,
      40, y
    )
  }
  doc.setTextColor(0)
  y += 6
  const paidTotalCommission = paidVisible.reduce((s, i) => s + (i.commission || 0), 0)
  const paidTotalAmount = paidVisible.reduce((s, i) => s + (i.amount || 0), 0)

  if (groupByCustomer) {
    autoTable(doc, {
      startY: y,
      head: [['Customer', 'Invoices', 'Amount', 'Commission']],
      body: paidGrouped.length === 0
        ? [[{ content: 'No paid invoices in this period.', colSpan: 4, styles: { halign: 'center', textColor: 120, fontStyle: 'italic' } }]]
        : paidGrouped.map(g => [
            g.customer,
            { content: g.count, styles: { halign: 'right' } },
            { content: fmtMoney(g.amount), styles: { halign: 'right' } },
            { content: fmtMoney(g.commission), styles: { halign: 'right', fontStyle: 'bold', textColor: TEAL_RGB } },
          ]),
      headStyles: { fillColor: TEAL_RGB },
      styles: { fontSize: 9, cellPadding: 5 },
      theme: 'striped',
      foot: paidGrouped.length > 0 ? [[
        { content: 'Total', styles: { fontStyle: 'bold' } },
        { content: paidVisible.length, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: fmtMoney(paidTotalAmount), styles: { halign: 'right', fontStyle: 'bold' } },
        { content: fmtMoney(paidTotalCommission), styles: { halign: 'right', fontStyle: 'bold', textColor: TEAL_RGB } },
      ]] : undefined,
    })
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Invoice', 'Customer', 'Date', 'Amount', 'Commission']],
      body: paidVisible.length === 0
        ? [[{ content: 'No paid invoices in this period.', colSpan: 5, styles: { halign: 'center', textColor: 120, fontStyle: 'italic' } }]]
        : paidVisible.map(i => [
            i.invoiceNum,
            i.customer,
            i.date || '—',
            { content: fmtMoney(i.amount), styles: { halign: 'right' } },
            { content: fmtMoney(i.commission), styles: { halign: 'right', fontStyle: 'bold', textColor: TEAL_RGB } },
          ]),
      headStyles: { fillColor: TEAL_RGB },
      styles: { fontSize: 8, cellPadding: 4 },
      theme: 'striped',
      foot: paidVisible.length > 0 ? [[
        { content: 'Total', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: fmtMoney(paidTotalAmount), styles: { halign: 'right', fontStyle: 'bold' } },
        { content: fmtMoney(paidTotalCommission), styles: { halign: 'right', fontStyle: 'bold', textColor: TEAL_RGB } },
      ]] : undefined,
    })
  }
  y = doc.lastAutoTable.finalY + 20

  // ─── Open invoices ────────────────────────────────────────────────
  const openTotalAmount = open.reduce((s, i) => s + (i.amount || 0), 0)
  const openTotalBalance = open.reduce((s, i) => s + (i.openBalance || 0), 0)
  const openTotalPending = open.reduce((s, i) => s + ((i.commission || 0) - (i.commissionAvailable || 0)), 0)
  doc.setFontSize(13)
  doc.setTextColor(...TEAL_RGB)
  if (groupByCustomer) {
    doc.text(`Open / unpaid invoices by customer — ${openGrouped.length} ${openGrouped.length === 1 ? 'customer' : 'customers'}, ${open.length} ${open.length === 1 ? 'invoice' : 'invoices'}`, 40, y)
  } else {
    doc.text(`Open / unpaid invoices — ${open.length} ${open.length === 1 ? 'invoice' : 'invoices'}`, 40, y)
  }
  doc.setTextColor(0)
  y += 6
  if (groupByCustomer) {
    autoTable(doc, {
      startY: y,
      head: [['Customer', 'Invoices', 'Amount', 'Open Balance', 'Pending Comm.']],
      body: openGrouped.length === 0
        ? [[{ content: 'No open invoices for this rep.', colSpan: 5, styles: { halign: 'center', textColor: 120, fontStyle: 'italic' } }]]
        : openGrouped.map(g => [
            g.customer,
            { content: g.count, styles: { halign: 'right' } },
            { content: fmtMoney(g.amount), styles: { halign: 'right' } },
            { content: fmtMoney(g.openBalance), styles: { halign: 'right', fontStyle: 'bold' } },
            { content: fmtMoney(g.pending), styles: { halign: 'right', textColor: 110 } },
          ]),
      headStyles: { fillColor: TEAL_RGB },
      styles: { fontSize: 9, cellPadding: 5 },
      theme: 'striped',
      foot: openGrouped.length > 0 ? [[
        { content: 'Total', styles: { fontStyle: 'bold' } },
        { content: open.length, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: fmtMoney(openTotalAmount), styles: { halign: 'right', fontStyle: 'bold' } },
        { content: fmtMoney(openTotalBalance), styles: { halign: 'right', fontStyle: 'bold' } },
        { content: fmtMoney(openTotalPending), styles: { halign: 'right', fontStyle: 'bold', textColor: 110 } },
      ]] : undefined,
    })
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Invoice', 'Customer', 'Date', 'Due', 'Amount', 'Open Balance', 'Pending Comm.']],
      body: open.length === 0
        ? [[{ content: 'No open invoices for this rep.', colSpan: 7, styles: { halign: 'center', textColor: 120, fontStyle: 'italic' } }]]
        : open.map(i => {
            const pending = (i.commission || 0) - (i.commissionAvailable || 0)
            return [
              i.invoiceNum,
              i.customer,
              i.date || '—',
              i.dueDate || '—',
              { content: fmtMoney(i.amount), styles: { halign: 'right' } },
              { content: fmtMoney(i.openBalance), styles: { halign: 'right', fontStyle: 'bold' } },
              { content: fmtMoney(pending), styles: { halign: 'right', textColor: 110 } },
            ]
          }),
      headStyles: { fillColor: TEAL_RGB },
      styles: { fontSize: 8, cellPadding: 4 },
      theme: 'striped',
      foot: open.length > 0 ? [[
        { content: 'Total', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: fmtMoney(openTotalAmount), styles: { halign: 'right', fontStyle: 'bold' } },
        { content: fmtMoney(openTotalBalance), styles: { halign: 'right', fontStyle: 'bold' } },
        { content: fmtMoney(openTotalPending), styles: { halign: 'right', fontStyle: 'bold', textColor: 110 } },
      ]] : undefined,
    })
  }
  y = doc.lastAutoTable.finalY + 20

  // ─── Payouts ──────────────────────────────────────────────────────
  const sortedPayouts = [...(payouts || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  doc.setFontSize(13)
  doc.setTextColor(...TEAL_RGB)
  doc.text(`Recorded commission payouts — ${sortedPayouts.length} ${sortedPayouts.length === 1 ? 'payment' : 'payments'}`, 40, y)
  doc.setTextColor(0)
  y += 6
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Method', 'Note', 'Amount']],
    body: sortedPayouts.length === 0
      ? [[{ content: 'No payouts recorded.', colSpan: 4, styles: { halign: 'center', textColor: 120, fontStyle: 'italic' } }]]
      : sortedPayouts.map(p => [
          p.date,
          p.method || '—',
          p.note || '—',
          { content: fmtMoney(p.amount), styles: { halign: 'right', fontStyle: 'bold' } },
        ]),
    headStyles: { fillColor: TEAL_RGB },
    styles: { fontSize: 8, cellPadding: 4 },
    theme: 'striped',
    foot: sortedPayouts.length > 0 ? [[
      { content: 'Total paid out', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: fmtMoney(sortedPayouts.reduce((s, p) => s + (p.amount || 0), 0)), styles: { halign: 'right', fontStyle: 'bold' } },
    ]] : undefined,
  })

  doc.save(`${sanitizeFilename(rep.name)} — commission ${today}.pdf`)
}

// ─── XLSX ─────────────────────────────────────────────────────────────

export function exportRepReportXLSX({ rep, summary, byInvoice, payouts, paidSince, territories, groupByCustomer = true, brandSubtotals = [] }) {
  const safe = summary || { earned: 0, paidOut: 0, available: 0, openCommission: 0 }
  const { paid, open } = splitInvoices(byInvoice)
  const paidVisible = applyPaidSince(paid, paidSince)
  const paidGrouped = groupPaidByCustomer(paidVisible)
  const openGrouped = groupOpenByCustomer(open)
  const today = new Date().toISOString().slice(0, 10)
  const sortedPayouts = [...(payouts || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const wb = XLSX.utils.book_new()

  const teal = { fgColor: { rgb: TEAL_HEX } }
  const tealText = { color: { rgb: TEAL_HEX } }
  const headerStyle = { fill: teal, font: { color: { rgb: 'FFFFFF' }, bold: true }, alignment: { horizontal: 'center' } }
  const labelStyle = { font: { bold: true } }
  const moneyFmt = '"$"#,##0.00;[Red]-"$"#,##0.00'

  // ── Sheet 1: Summary ──
  const summaryRows = [
    [{ v: `${rep.name} — Commission Report`, s: { font: { bold: true, sz: 14, color: tealText.color } } }],
    [{ v: `Generated ${today}`, s: { font: { color: { rgb: '707070' } } } }],
    paidSince ? [{ v: `Paid invoices since ${paidSince}`, s: { font: { color: { rgb: '707070' } } } }] : [],
    [],
    [{ v: 'Rep', s: labelStyle }, rep.name],
    [{ v: 'Agency', s: labelStyle }, rep.agency || ''],
    [{ v: 'Email', s: labelStyle }, rep.email || ''],
    [{ v: 'Territories', s: labelStyle }, (territories || []).join(', ')],
    [],
    [{ v: 'Earned', s: headerStyle }, { v: 'Paid Out', s: headerStyle }, { v: 'Available', s: headerStyle }, { v: 'Pending (open invoices)', s: headerStyle }],
    [
      { v: safe.earned, t: 'n', z: moneyFmt, s: { font: { bold: true } } },
      { v: safe.paidOut, t: 'n', z: moneyFmt, s: { font: { bold: true } } },
      { v: safe.available, t: 'n', z: moneyFmt, s: { font: { bold: true, color: tealText.color } } },
      { v: safe.openCommission, t: 'n', z: moneyFmt, s: { font: { color: { rgb: '707070' } } } },
    ],
  ]
  // Brand subtotal row inside Summary sheet
  if (brandSubtotals && brandSubtotals.length > 0) {
    summaryRows.push([])
    summaryRows.push([{ v: 'Earned by Brand', s: { font: { bold: true } } }])
    summaryRows.push(brandSubtotals.map(b => ({ v: b.brand, s: headerStyle })))
    summaryRows.push(brandSubtotals.map(b => ({
      v: b.commission, t: 'n', z: moneyFmt,
      s: { font: { bold: true, color: tealText.color } },
    })))
  }
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
  wsSummary['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 22 }, { wch: 28 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  // ── Sheet 2: Paid Invoices (grouped or detail, depending on toggle) ──
  if (groupByCustomer) {
    const head = ['Customer', 'Invoices', 'Amount', 'Commission']
    const body = paidGrouped.map(g => [
      g.customer,
      { v: g.count, t: 'n' },
      { v: g.amount ?? 0, t: 'n', z: moneyFmt },
      { v: g.commission ?? 0, t: 'n', z: moneyFmt, s: { font: { bold: true, color: tealText.color } } },
    ])
    const rows = [head.map(h => ({ v: h, s: headerStyle })), ...body]
    if (paidGrouped.length > 0) {
      rows.push([
        { v: 'Total', s: { font: { bold: true } } },
        { v: paidVisible.length, t: 'n', s: { font: { bold: true } } },
        { v: paidVisible.reduce((s, i) => s + (i.amount || 0), 0), t: 'n', z: moneyFmt, s: { font: { bold: true } } },
        { v: paidVisible.reduce((s, i) => s + (i.commission || 0), 0), t: 'n', z: moneyFmt, s: { font: { bold: true, color: tealText.color } } },
      ])
    }
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 42 }, { wch: 10 }, { wch: 14 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Paid by Customer')
  }
  // Always include a detail sheet — useful as backup even when grouped.
  {
    const head = ['Invoice', 'Customer', 'Date', 'Amount', 'Commission']
    const body = paidVisible.map(i => [
      i.invoiceNum,
      i.customer,
      i.date || '',
      { v: i.amount ?? 0, t: 'n', z: moneyFmt },
      { v: i.commission ?? 0, t: 'n', z: moneyFmt, s: { font: { bold: true, color: tealText.color } } },
    ])
    const rows = [head.map(h => ({ v: h, s: headerStyle })), ...body]
    if (paidVisible.length > 0) {
      rows.push([
        { v: 'Total', s: { font: { bold: true }, alignment: { horizontal: 'right' } } },
        '', '', '',
        { v: paidVisible.reduce((s, i) => s + (i.commission || 0), 0), t: 'n', z: moneyFmt, s: { font: { bold: true, color: tealText.color } } },
      ])
    }
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 14 }, { wch: 42 }, { wch: 12 }, { wch: 14 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Paid (Detail)')
  }

  // ── Sheet 3: Open Invoices (grouped or detail, depending on toggle) ──
  if (groupByCustomer) {
    const head = ['Customer', 'Invoices', 'Amount', 'Open Balance', 'Pending Commission']
    const body = openGrouped.map(g => [
      g.customer,
      { v: g.count, t: 'n' },
      { v: g.amount ?? 0, t: 'n', z: moneyFmt },
      { v: g.openBalance ?? 0, t: 'n', z: moneyFmt, s: { font: { bold: true } } },
      { v: g.pending ?? 0, t: 'n', z: moneyFmt, s: { font: { color: { rgb: '707070' } } } },
    ])
    const rows = [head.map(h => ({ v: h, s: headerStyle })), ...body]
    if (openGrouped.length > 0) {
      rows.push([
        { v: 'Total', s: { font: { bold: true } } },
        { v: open.length, t: 'n', s: { font: { bold: true } } },
        { v: open.reduce((s, i) => s + (i.amount || 0), 0), t: 'n', z: moneyFmt, s: { font: { bold: true } } },
        { v: open.reduce((s, i) => s + (i.openBalance || 0), 0), t: 'n', z: moneyFmt, s: { font: { bold: true } } },
        { v: open.reduce((s, i) => s + ((i.commission || 0) - (i.commissionAvailable || 0)), 0), t: 'n', z: moneyFmt, s: { font: { bold: true, color: { rgb: '707070' } } } },
      ])
    }
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 42 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Open by Customer')
  }
  // Always include a detail sheet for open invoices too.
  {
    const head = ['Invoice', 'Customer', 'Date', 'Due', 'Amount', 'Open Balance', 'Pending Commission']
    const body = open.map(i => {
      const pending = (i.commission || 0) - (i.commissionAvailable || 0)
      return [
        i.invoiceNum,
        i.customer,
        i.date || '',
        i.dueDate || '',
        { v: i.amount ?? 0, t: 'n', z: moneyFmt },
        { v: i.openBalance ?? 0, t: 'n', z: moneyFmt, s: { font: { bold: true } } },
        { v: pending, t: 'n', z: moneyFmt, s: { font: { color: { rgb: '707070' } } } },
      ]
    })
    const rows = [head.map(h => ({ v: h, s: headerStyle })), ...body]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 14 }, { wch: 42 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Open (Detail)')
  }

  // ── Sheet 4: Payouts ──
  const payoutHeader = ['Date', 'Method', 'Note', 'Amount']
  const payoutBody = sortedPayouts.map(p => [
    p.date,
    p.method || '',
    p.note || '',
    { v: p.amount ?? 0, t: 'n', z: moneyFmt, s: { font: { bold: true } } },
  ])
  const payoutRows = [payoutHeader.map(h => ({ v: h, s: headerStyle })), ...payoutBody]
  if (sortedPayouts.length > 0) {
    payoutRows.push([
      { v: 'Total paid out', s: { font: { bold: true }, alignment: { horizontal: 'right' } } },
      '', '',
      { v: sortedPayouts.reduce((s, p) => s + (p.amount || 0), 0), t: 'n', z: moneyFmt, s: { font: { bold: true } } },
    ])
  }
  const wsPayouts = XLSX.utils.aoa_to_sheet(payoutRows)
  wsPayouts['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 36 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsPayouts, 'Payouts')

  XLSX.writeFile(wb, `${sanitizeFilename(rep.name)} — commission ${today}.xlsx`)
}
