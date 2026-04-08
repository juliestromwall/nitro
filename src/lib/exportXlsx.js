import * as XLSX from 'xlsx-js-style'

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

async function downloadXlsx(data, columns, filename, title, subtitle) {
  const logo = await loadLogoAsBase64()

  // Build rows: logo header + title + subtitle + date + blank row + data
  const rows = []

  // Row 0: Title
  rows.push(['REPCOMMISH — ' + title])
  // Row 1: Filter subtitle (if any)
  if (subtitle) rows.push(['Filtered by: ' + subtitle])
  // Row N: Date
  rows.push([new Date().toLocaleDateString()])
  // Blank separator
  rows.push([])

  // Column headers
  const header = columns.map((c) => c.label)
  rows.push(header)

  // Data rows
  for (const row of data) {
    rows.push(columns.map((c) => c.value(row)))
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Merge header rows across all columns
  const colCount = columns.length
  const headerRowCount = subtitle ? 3 : 2  // title + subtitle? + date
  if (colCount > 1) {
    ws['!merges'] = Array.from({ length: headerRowCount }, (_, i) => ({
      s: { r: i, c: 0 }, e: { r: i, c: colCount - 1 },
    }))
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
    { label: 'Website', value: (a) => a.website || '' },
    { label: 'Phone', value: (a) => a.phone || '' },
    { label: 'Primary Contact', value: (a) => a.primary_contact?.name || '' },
    { label: 'Contact Email', value: (a) => a.primary_contact?.email || '' },
    { label: 'Contact Phone', value: (a) => a.primary_contact?.phone || '' },
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

export function exportSalesXlsx(orders, companies, accounts, seasons, filters) {
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
  return downloadXlsx(orders, columns, `sales${filters?.suffix || ''}.xlsx`, 'Sales', filters?.label)
}

const fmtUsd = (v) => v != null && v !== '' ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''

export async function exportCommissionsXlsx(commissions, orders, companies, accounts, filters) {
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

  const columns = ['Brand', 'Account', 'Order #', 'Order Total', 'Commission %', 'Commission Due', 'Commission Paid', 'Commission Owed', 'Status']

  // Build header rows
  const title = 'Commissions'
  const subtitle = filters?.label
  const headerRows = [['REPCOMMISH — ' + title]]
  if (subtitle) headerRows.push(['Filtered by: ' + subtitle])
  headerRows.push([new Date().toLocaleDateString()])
  headerRows.push([])
  headerRows.push(columns)

  const dataRows = []
  const accountRowIndices = [] // track which data rows are account headers (for bold styling)

  for (const group of Object.values(grouped).sort((a, b) => a.account.localeCompare(b.account))) {
    const totalSales = group.items.reduce((s, r) => s + (r.order.total || 0), 0)
    const totalDue = group.items.reduce((s, r) => s + (r.commission_due || 0), 0)
    const totalPaid = group.items.reduce((s, r) => s + (r.amount_paid || 0), 0)
    const totalRemaining = group.items.reduce((s, r) => s + (r.amount_remaining || 0), 0)
    const status = group.items[0]?.pay_status || ''

    // Account header row
    accountRowIndices.push(dataRows.length)
    dataRows.push([group.brand, group.account, '', fmtUsd(totalSales), '', fmtUsd(totalDue), fmtUsd(totalPaid), fmtUsd(totalRemaining), status])

    // Order sub-rows
    for (const r of group.items) {
      dataRows.push(['', '', r.order.order_number || '', fmtUsd(r.order.total), `${r.rate}%`, fmtUsd(r.commission_due), '', '', status])
    }
  }

  const allRows = [...headerRows, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(allRows)

  const colCount = columns.length
  const headerRowCount = subtitle ? 3 : 2

  // Merge title/date header rows
  if (colCount > 1) {
    ws['!merges'] = Array.from({ length: headerRowCount }, (_, i) => ({
      s: { r: i, c: 0 }, e: { r: i, c: colCount - 1 },
    }))
  }

  // Style title row
  const titleRef = XLSX.utils.encode_cell({ r: 0, c: 0 })
  if (ws[titleRef]) ws[titleRef].s = { font: { bold: true, sz: 14 } }

  // Border style — vertical lines only, hide horizontal gridlines with white borders
  const vertBorder = {
    left: { style: 'thin', color: { rgb: 'CCCCCC' } },
    right: { style: 'thin', color: { rgb: 'CCCCCC' } },
    top: { style: 'thin', color: { rgb: 'FFFFFF' } },
    bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
  }
  const vertBorderTeal = {
    left: { style: 'thin', color: { rgb: 'CCCCCC' } },
    right: { style: 'thin', color: { rgb: 'CCCCCC' } },
    top: { style: 'thin', color: { rgb: 'E6F0F0' } },
    bottom: { style: 'thin', color: { rgb: 'E6F0F0' } },
  }

  // Style column header row (teal background, white bold text)
  const colHeaderRow = headerRows.length - 1
  for (let c = 0; c < colCount; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: colHeaderRow, c })
    if (ws[cellRef]) {
      ws[cellRef].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        fill: { fgColor: { rgb: '005B5B' } },
        alignment: { horizontal: 'left' },
        border: vertBorder,
      }
    }
  }

  // Style data rows
  const dataStartRow = headerRows.length
  const accountRowSet = new Set(accountRowIndices)
  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = dataStartRow + i
    const isAccountRow = accountRowSet.has(i)
    for (let c = 0; c < colCount; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: rowNum, c })
      if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' }
      if (isAccountRow) {
        ws[cellRef].s = {
          font: { bold: true, sz: 10 },
          fill: { fgColor: { rgb: 'E6F0F0' } },
          alignment: { horizontal: c >= 3 && c <= 7 ? 'right' : 'left' },
          border: vertBorderTeal,
        }
      } else {
        ws[cellRef].s = {
          font: { sz: 9, color: { rgb: '444444' } },
          alignment: { horizontal: c >= 3 && c <= 7 ? 'right' : 'left' },
          border: vertBorder,
        }
      }
    }
  }

  // Column widths
  ws['!cols'] = [
    { wch: 18 }, // Brand
    { wch: 30 }, // Account
    { wch: 16 }, // Order #
    { wch: 14 }, // Order Total
    { wch: 14 }, // Commission %
    { wch: 16 }, // Commission Due
    { wch: 16 }, // Commission Paid
    { wch: 16 }, // Commission Owed
    { wch: 14 }, // Status
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, `commissions${filters?.suffix || ''}.xlsx`)
}

export function exportPaymentsXlsx(commissions, orders, companies, accounts, filters) {
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
  return downloadXlsx(rows, columns, `payments${filters?.suffix || ''}.xlsx`, 'Payments', filters?.label)
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
