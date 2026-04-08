import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

async function loadLogoAsBase64() {
  try {
    const res = await fetch('/repcommish-logo.png')
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function createPdfWithLogo(title, subtitle) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const logo = await loadLogoAsBase64()
  const x = logo ? 36 : 14

  if (logo) {
    doc.addImage(logo, 'PNG', 14, 6, 18, 18)
  }

  doc.setFontSize(16)
  doc.text(title, x, 14)

  let y = 20
  if (subtitle) {
    // Strip emoji (jsPDF can't render them)
    const cleanSubtitle = subtitle.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{200D}]|[\u{20E3}]|[\u{E0020}-\u{E007F}]|[\u{D83C}-\u{DBFF}\u{DC00}-\u{DFFF}]/gu, '').trim()
    doc.setFontSize(8)
    doc.setTextColor(80)
    doc.text('Filtered by: ' + cleanSubtitle, x, y)
    y += 5
  }

  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(new Date().toLocaleDateString(), x, y)
  doc.setTextColor(0)

  doc.startY = y + 4
  return doc
}

export async function exportAccountsPdf(accounts) {
  const doc = await createPdfWithLogo('Accounts')
  autoTable(doc, {
    startY: 28,
    head: [['Name', 'Account #', 'Website', 'Phone', 'Primary Contact', 'Region', 'Type', 'City', 'State']],
    body: accounts.map((a) => [
      a.name || '', a.account_number || '', a.website || '', a.phone || '',
      a.primary_contact?.name || '',
      a.region || '', a.type || '', a.city || '', a.state || '',
    ]),
    headStyles: { fillColor: [0, 91, 91] },
    styles: { fontSize: 7 },
  })
  doc.save('accounts.pdf')
}

export async function exportBrandsPdf(companies) {
  const doc = await createPdfWithLogo('Brands')
  autoTable(doc, {
    startY: 28,
    head: [['Brand Name', 'Commission %', 'Order Types', 'Items', 'Stages']],
    body: companies.map((c) => [
      c.name || '',
      c.commission_percent ?? '',
      (c.order_types || []).join(', '),
      (c.items || []).join(', '),
      (c.stages || []).join(', '),
    ]),
    headStyles: { fillColor: [0, 91, 91] },
    styles: { fontSize: 8 },
  })
  doc.save('brands.pdf')
}

export async function exportSalesPdf(orders, companies, accounts, seasons, filters) {
  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]))
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const seasonMap = Object.fromEntries(seasons.map((s) => [s.id, s]))

  const doc = await createPdfWithLogo('Sales', filters?.label)
  autoTable(doc, {
    startY: doc.startY || 28,
    head: [['Brand', 'Account', 'Season', 'Order Type', 'Order #', 'Invoice #', 'Items', 'Stage', 'Total', 'Sale Type', 'Close Date']],
    body: orders.map((o) => [
      companyMap[o.company_id]?.name || '',
      accountMap[o.client_id]?.name || '',
      seasonMap[o.season_id]?.label || '',
      o.order_type || '',
      o.order_number || '',
      (o.invoices || []).map((i) => i.number).filter(Boolean).join(', '),
      (o.items || []).join(', '),
      o.stage || '',
      o.total != null ? `$${Number(o.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '',
      o.sale_type || '',
      o.close_date || '',
    ]),
    headStyles: { fillColor: [0, 91, 91] },
    styles: { fontSize: 7 },
    columnStyles: { 8: { halign: 'right' } },
  })
  doc.save(`sales${filters?.suffix || ''}.pdf`)
}

export async function exportCommissionsPdf(commissions, orders, companies, accounts, filters) {
  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]))
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const orderMap = Object.fromEntries(orders.map((o) => [o.id, o]))

  // Enrich and group by brand+account
  const enriched = commissions.map((c) => {
    const order = orderMap[c.order_id] || {}
    const company = companyMap[order.company_id] || {}
    const rate = order.commission_override ?? company.commission_percent ?? 0
    return { ...c, order, company, account: accountMap[order.client_id] || {}, rate }
  })

  const grouped = {}
  for (const r of enriched) {
    const key = `${r.company.id || ''}_${r.account.id || ''}`
    if (!grouped[key]) grouped[key] = { brand: r.company.name || '', account: r.account.name || '', items: [] }
    grouped[key].items.push(r)
  }

  const fmt = (v) => v != null ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''

  const rows = []
  const accountRowIndices = []

  for (const group of Object.values(grouped).sort((a, b) => a.account.localeCompare(b.account))) {
    const totalSales = group.items.reduce((s, r) => s + (r.order.total || 0), 0)
    const totalDue = group.items.reduce((s, r) => s + (r.commission_due || 0), 0)
    const totalPaid = group.items.reduce((s, r) => s + (r.amount_paid || 0), 0)
    const totalRemaining = group.items.reduce((s, r) => s + (r.amount_remaining || 0), 0)
    const status = group.items[0]?.pay_status || ''

    accountRowIndices.push(rows.length)
    rows.push([group.brand, group.account, '', fmt(totalSales), '', fmt(totalDue), fmt(totalPaid), fmt(totalRemaining), status])

    for (const r of group.items) {
      rows.push(['', '', r.order.order_number || '', fmt(r.order.total), `${r.rate}%`, fmt(r.commission_due), '', '', ''])
    }
  }

  const doc = await createPdfWithLogo('Commissions', filters?.label)
  autoTable(doc, {
    startY: doc.startY || 28,
    head: [['Brand', 'Account', 'Order #', 'Order Total', 'Commission %', 'Commission Due', 'Commission Paid', 'Commission Owed', 'Status']],
    body: rows,
    headStyles: { fillColor: [0, 91, 91] },
    styles: { fontSize: 7 },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles: { 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.section === 'body') {
        if (accountRowIndices.includes(data.row.index)) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [230, 240, 240]
        } else {
          data.cell.styles.fillColor = [255, 255, 255]
        }
      }
    },
  })
  doc.save(`commissions${filters?.suffix || ''}.pdf`)
}

export async function exportPaymentsPdf(commissions, orders, companies, accounts, filters) {
  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]))
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const orderMap = Object.fromEntries(orders.map((o) => [o.id, o]))

  const rows = []
  for (const c of commissions) {
    const payments = c.payments || []
    if (payments.length === 0) continue
    const order = orderMap[c.order_id] || {}
    const company = companyMap[order.company_id] || {}
    const account = accountMap[order.client_id] || {}
    for (const p of payments) {
      rows.push([
        company.name || '',
        account.name || '',
        order.order_number || '',
        p.date || p.paid_date || '',
        p.amount != null ? `$${Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '',
      ])
    }
  }

  const doc = await createPdfWithLogo('Payments', filters?.label)
  autoTable(doc, {
    startY: doc.startY || 28,
    head: [['Brand', 'Account', 'Order #', 'Payment Date', 'Amount']],
    body: rows,
    headStyles: { fillColor: [0, 91, 91] },
    styles: { fontSize: 8 },
    columnStyles: { 4: { halign: 'right' } },
  })
  doc.save(`payments${filters?.suffix || ''}.pdf`)
}

export async function exportTodosPdf(todos, companies, accounts) {
  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]))
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))

  const doc = await createPdfWithLogo('To Dos')
  autoTable(doc, {
    startY: 28,
    head: [['Brand', 'Account', 'Title', 'Note', 'Phone', 'Due Date', 'Completed', 'Pinned']],
    body: todos.map((t) => [
      companyMap[t.company_id]?.name || '',
      accountMap[t.client_id]?.name || '',
      t.title || '',
      t.note || '',
      t.phone || '',
      t.due_date || '',
      t.completed ? 'Yes' : 'No',
      t.pinned ? 'Yes' : 'No',
    ]),
    headStyles: { fillColor: [0, 91, 91] },
    styles: { fontSize: 8 },
  })
  doc.save('todos.pdf')
}
