import * as XLSX from 'xlsx'

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

async function downloadXlsx(data, columns, filename, title) {
  const logo = await loadLogoAsBase64()

  // Build rows: logo header + title + date + blank row + data
  const rows = []

  // Row 0: Title
  rows.push(['REPCOMMISH — ' + title])
  // Row 1: Date
  rows.push([new Date().toLocaleDateString()])
  // Row 2: blank separator
  rows.push([])

  // Row 3: column headers
  const header = columns.map((c) => c.label)
  rows.push(header)

  // Data rows
  for (const row of data) {
    rows.push(columns.map((c) => c.value(row)))
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Merge title row across all columns
  const colCount = columns.length
  if (colCount > 1) {
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
    ]
  }

  // Auto-size columns
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(c.label.length, 14) }))

  // Add logo image if supported and available
  if (logo) {
    // Extract base64 data (strip data:image/png;base64, prefix)
    const base64 = logo.split(',')[1]
    if (base64) {
      ws['!images'] = [{
        '!pos': { x: 0, y: 0, w: 120, h: 48 },
        '!datatype': 'base64',
        '!data': base64,
        '!type': 'png',
      }]
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filename)
}

export function exportAccountsXlsx(accounts) {
  const columns = [
    { label: 'Name', value: (a) => a.name || '' },
    { label: 'Account #', value: (a) => a.account_number || '' },
    { label: 'Region', value: (a) => a.region || '' },
    { label: 'Type', value: (a) => a.type || '' },
    { label: 'City', value: (a) => a.city || '' },
    { label: 'State', value: (a) => a.state || '' },
  ]
  return downloadXlsx(accounts, columns, 'accounts.xlsx', 'Accounts')
}

export function exportBrandsXlsx(companies) {
  const columns = [
    { label: 'Brand Name', value: (c) => c.name || '' },
    { label: 'Commission %', value: (c) => c.commission_percent ?? '' },
    { label: 'Order Types', value: (c) => (c.order_types || []).join(', ') },
    { label: 'Items', value: (c) => (c.items || []).join(', ') },
    { label: 'Stages', value: (c) => (c.stages || []).join(', ') },
  ]
  return downloadXlsx(companies, columns, 'brands.xlsx', 'Brands')
}

export function exportSalesXlsx(orders, companies, accounts, seasons) {
  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]))
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const seasonMap = Object.fromEntries(seasons.map((s) => [s.id, s]))

  const columns = [
    { label: 'Brand', value: (o) => companyMap[o.company_id]?.name || '' },
    { label: 'Account', value: (o) => accountMap[o.client_id]?.name || '' },
    { label: 'Season', value: (o) => seasonMap[o.season_id]?.label || '' },
    { label: 'Order Type', value: (o) => o.order_type || '' },
    { label: 'Order #', value: (o) => o.order_number || '' },
    { label: 'Invoice #', value: (o) => (o.invoices || []).map((i) => i.number).filter(Boolean).join(', ') },
    { label: 'Items', value: (o) => (o.items || []).join(', ') },
    { label: 'Stage', value: (o) => o.stage || '' },
    { label: 'Total', value: (o) => o.total ?? '' },
    { label: 'Sale Type', value: (o) => o.sale_type || '' },
    { label: 'Close Date', value: (o) => o.close_date || '' },
    { label: 'Notes', value: (o) => o.notes || '' },
  ]
  return downloadXlsx(orders, columns, 'sales.xlsx', 'Sales')
}

export function exportCommissionsXlsx(commissions, orders, companies, accounts) {
  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]))
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const orderMap = Object.fromEntries(orders.map((o) => [o.id, o]))

  const rows = commissions.map((c) => {
    const order = orderMap[c.order_id] || {}
    const company = companyMap[order.company_id] || {}
    const rate = order.commission_override ?? company.commission_percent ?? 0
    return { ...c, order, company, account: accountMap[order.client_id] || {}, rate }
  })

  const columns = [
    { label: 'Brand', value: (r) => r.company.name || '' },
    { label: 'Account', value: (r) => r.account.name || '' },
    { label: 'Order #', value: (r) => r.order.order_number || '' },
    { label: 'Order Total', value: (r) => r.order.total ?? '' },
    { label: 'Commission %', value: (r) => r.rate },
    { label: 'Due', value: (r) => r.commission_due ?? '' },
    { label: 'Paid', value: (r) => r.amount_paid ?? '' },
    { label: 'Remaining', value: (r) => r.amount_remaining ?? '' },
    { label: 'Status', value: (r) => r.pay_status || '' },
  ]
  return downloadXlsx(rows, columns, 'commissions.xlsx', 'Commissions')
}

export function exportPaymentsXlsx(commissions, orders, companies, accounts) {
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
      rows.push({
        brand: company.name || '',
        account: account.name || '',
        orderNumber: order.order_number || '',
        date: p.date || p.paid_date || '',
        amount: p.amount ?? '',
      })
    }
  }

  const columns = [
    { label: 'Brand', value: (r) => r.brand },
    { label: 'Account', value: (r) => r.account },
    { label: 'Order #', value: (r) => r.orderNumber },
    { label: 'Payment Date', value: (r) => r.date },
    { label: 'Amount', value: (r) => r.amount },
  ]
  return downloadXlsx(rows, columns, 'payments.xlsx', 'Payments')
}

export function exportTodosXlsx(todos, companies, accounts) {
  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]))
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))

  const rows = todos.map((t) => ({
    brand: companyMap[t.company_id]?.name || '',
    account: accountMap[t.client_id]?.name || '',
    title: t.title || '',
    note: t.note || '',
    phone: t.phone || '',
    dueDate: t.due_date || '',
    completed: t.completed ? 'Yes' : 'No',
    pinned: t.pinned ? 'Yes' : 'No',
  }))

  const columns = [
    { label: 'Brand', value: (r) => r.brand },
    { label: 'Account', value: (r) => r.account },
    { label: 'Title', value: (r) => r.title },
    { label: 'Note', value: (r) => r.note },
    { label: 'Phone', value: (r) => r.phone },
    { label: 'Due Date', value: (r) => r.dueDate },
    { label: 'Completed', value: (r) => r.completed },
    { label: 'Pinned', value: (r) => r.pinned },
  ]
  return downloadXlsx(rows, columns, 'todos.xlsx', 'To Dos')
}
