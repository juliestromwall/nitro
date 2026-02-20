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

async function createPdfWithLogo(title) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const logo = await loadLogoAsBase64()

  if (logo) {
    doc.addImage(logo, 'PNG', 14, 6, 18, 18)
  }

  doc.setFontSize(16)
  doc.text(title, logo ? 36 : 14, 14)

  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(new Date().toLocaleDateString(), logo ? 36 : 14, 20)
  doc.setTextColor(0)

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

export async function exportSalesPdf(orders, companies, accounts, seasons) {
  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]))
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const seasonMap = Object.fromEntries(seasons.map((s) => [s.id, s]))

  const doc = await createPdfWithLogo('Sales')
  autoTable(doc, {
    startY: 28,
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
  doc.save('sales.pdf')
}

export async function exportCommissionsPdf(commissions, orders, companies, accounts) {
  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]))
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const orderMap = Object.fromEntries(orders.map((o) => [o.id, o]))

  const rows = commissions.map((c) => {
    const order = orderMap[c.order_id] || {}
    const company = companyMap[order.company_id] || {}
    const rate = order.commission_override ?? company.commission_percent ?? 0
    return [
      company.name || '',
      (accountMap[order.client_id] || {}).name || '',
      order.order_number || '',
      order.total != null ? `$${Number(order.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '',
      `${rate}%`,
      c.commission_due != null ? `$${Number(c.commission_due).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '',
      c.amount_paid != null ? `$${Number(c.amount_paid).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '',
      c.amount_remaining != null ? `$${Number(c.amount_remaining).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '',
      c.pay_status || '',
    ]
  })

  const doc = await createPdfWithLogo('Commissions')
  autoTable(doc, {
    startY: 28,
    head: [['Brand', 'Account', 'Order #', 'Order Total', 'Commission %', 'Due', 'Paid', 'Remaining', 'Status']],
    body: rows,
    headStyles: { fillColor: [0, 91, 91] },
    styles: { fontSize: 7 },
    columnStyles: { 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
  })
  doc.save('commissions.pdf')
}

export async function exportPaymentsPdf(commissions, orders, companies, accounts) {
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

  const doc = await createPdfWithLogo('Payments')
  autoTable(doc, {
    startY: 28,
    head: [['Brand', 'Account', 'Order #', 'Payment Date', 'Amount']],
    body: rows,
    headStyles: { fillColor: [0, 91, 91] },
    styles: { fontSize: 8 },
    columnStyles: { 4: { halign: 'right' } },
  })
  doc.save('payments.pdf')
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
