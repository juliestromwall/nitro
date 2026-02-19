import { useState, useMemo, useRef } from 'react'
import { Upload, CheckCircle, AlertTriangle, XCircle, Info, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useAccounts } from '@/context/AccountContext'
import { useCompanies } from '@/context/CompanyContext'
import { useSales } from '@/context/SalesContext'
import { splitCSVRows, parseCSVLine } from '@/lib/csv'
import TableBuilder from '@/components/ui/TableBuilder'

const TABLE_COLUMNS = [
  { key: 'account_name', label: 'Account Name', type: 'text', placeholder: 'Mountain Sports', minWidth: 150 },
  { key: 'account_number', label: 'Account #', type: 'text', placeholder: 'AC-1234', minWidth: 130 },
  { key: 'payment_date', label: 'Payment Date', type: 'text', required: true, placeholder: 'MM/DD/YYYY', minWidth: 120 },
  { key: 'amount_paid', label: 'Amount Paid', type: 'number', required: true, placeholder: '0.00', minWidth: 110 },
]

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

function ImportPaymentsModal({ open, onOpenChange, companyId }) {
  const { accounts, getAccountName } = useAccounts()
  const { companies } = useCompanies()
  const { orders, commissions, seasons, upsertCommission } = useSales()

  const [step, setStep] = useState(1)
  const [mode, setMode] = useState('csv')
  const [parsedRows, setParsedRows] = useState([])
  const [tableRows, setTableRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedCount, setSavedCount] = useState(0)
  const [selectedTracker, setSelectedTracker] = useState('')
  const fileInputRef = useRef(null)

  const company = companies.find((c) => c.id === companyId)
  const commPct = company?.commission_percent || 0

  // Get trackers (seasons) for this brand
  const availableTrackers = useMemo(() => {
    return seasons
      .filter((s) => s.company_id === companyId && !s.archived)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  }, [seasons, companyId])

  const getExpectedRate = (orderType) => {
    const categoryPct = company?.category_commissions?.[orderType]
    return categoryPct != null ? categoryPct : commPct
  }

  // Precompute per-account commission summaries scoped to selected tracker
  const accountSummaries = useMemo(() => {
    const companyOrders = orders.filter((o) => o.company_id === companyId && o.stage !== 'Cancelled' && (!selectedTracker || o.season_id === selectedTracker))
    const byClient = new Map()

    companyOrders.forEach((o) => {
      if (!byClient.has(o.client_id)) {
        byClient.set(o.client_id, {
          clientId: o.client_id,
          accountName: getAccountName(o.client_id),
          orders: [],
        })
      }
      byClient.get(o.client_id).orders.push(o)
    })

    const summaries = new Map()
    for (const [clientId, group] of byClient) {
      const totalOrder = group.orders.reduce((sum, o) => sum + o.total, 0)
      const totalCommDue = group.orders.reduce((sum, o) => {
        const pct = getExpectedRate(o.order_type)
        return sum + (o.total * pct / 100)
      }, 0)

      const orderIds = new Set(group.orders.map((o) => o.id))
      const clientComms = commissions.filter((c) => orderIds.has(c.order_id))
      const totalPaid = clientComms.reduce((sum, c) => sum + (c.amount_paid || 0), 0)
      const anyShortShipped = clientComms.some((c) => c.pay_status === 'short shipped')

      let aggPayStatus = 'pending invoice'
      if (anyShortShipped) {
        aggPayStatus = 'short shipped'
      } else {
        const allPaid = clientComms.length > 0 && clientComms.every((c) => c.pay_status === 'paid')
        const anyPaidOrPartial = clientComms.some((c) => c.pay_status === 'paid' || c.pay_status === 'partial')
        const anyInvoiceSent = clientComms.some((c) => c.pay_status === 'invoice sent')
        const anyUnpaid = clientComms.some((c) => c.pay_status === 'unpaid')
        if (allPaid) aggPayStatus = 'paid'
        else if (anyPaidOrPartial) aggPayStatus = 'partial'
        else if (anyInvoiceSent) aggPayStatus = 'invoice sent'
        else if (anyUnpaid) aggPayStatus = 'unpaid'
      }

      const firstOrder = group.orders[0]
      const firstComm = commissions.find((c) => c.order_id === firstOrder.id)

      summaries.set(clientId, {
        clientId,
        accountName: group.accountName,
        totalOrder,
        totalCommDue,
        totalPaid,
        aggPayStatus,
        anyShortShipped,
        firstOrderId: firstOrder.id,
        firstComm,
        orders: group.orders,
      })
    }

    return summaries
  }, [orders, commissions, companyId, selectedTracker, getAccountName, company])

  // Build account lookups — by number and by name
  const accountByNumber = useMemo(() => {
    const map = new Map()
    accounts.forEach((a) => {
      if (a.account_number) {
        map.set(a.account_number.trim().toLowerCase(), a)
      }
    })
    return map
  }, [accounts])

  const accountByName = useMemo(() => {
    const map = new Map()
    accounts.forEach((a) => {
      if (a.name) {
        map.set(a.name.trim().toLowerCase(), a)
      }
    })
    return map
  }, [accounts])

  // Column header matching
  const detectColumn = (header) => {
    const h = header.toLowerCase().trim()
    if (h === 'account_number') return 'account_number'
    if (['account_name', 'account name', 'account'].includes(h)) return 'account_name'
    if (h === 'payment_date') return 'date'
    if (h === 'amount_paid') return 'amount'
    return null
  }

  const parseAmount = (raw) => {
    if (!raw) return 0
    const cleaned = raw.replace(/[$,\s]/g, '')
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : num
  }

  const parseDate = (raw) => {
    if (!raw) return null
    const trimmed = raw.trim()
    // Try YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (isoMatch) {
      const [, y, m, d] = isoMatch
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    // Try M/D/YYYY or M.D.YYYY or M-D-YYYY
    const mdyFull = trimmed.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/)
    if (mdyFull) {
      const [, m, d, y] = mdyFull
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    // Try M/D/YY or M.D.YY or M-D-YY
    const mdyShort = trimmed.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2})$/)
    if (mdyShort) {
      const [, m, d, y] = mdyShort
      const fullYear = parseInt(y) > 50 ? `19${y}` : `20${y}`
      return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    return null
  }

  // Match by account number first, then by account name
  const matchAccount = (accountNum, accountNameInput) => {
    if (accountNum) {
      const match = accountByNumber.get(accountNum.toLowerCase())
      if (match) return match
    }
    if (accountNameInput) {
      const match = accountByName.get(accountNameInput.toLowerCase())
      if (match) return match
    }
    return null
  }

  const buildParsedRows = (rawRows) => {
    return rawRows.map((row) => {
      const accountNum = (row.accountNum || '').trim()
      const accountNameInput = (row.accountNameInput || '').trim()
      const amount = row.amount
      const date = row.date

      // Match by number first, then by name
      const matchedAccount = matchAccount(accountNum, accountNameInput)
      const clientId = matchedAccount?.id || null
      const accountName = matchedAccount?.name || ''
      const displayIdentifier = accountNum || accountNameInput

      // Check if this account has orders for this brand
      const summary = clientId ? accountSummaries.get(clientId) : null

      let status = 'not_found'
      if (summary) {
        const commDue = summary.totalCommDue - summary.totalPaid
        const dueCents = Math.round(commDue * 100)
        const amountCents = Math.round(amount * 100)
        if (amountCents >= dueCents && dueCents > 0) status = 'matched'
        else if (amountCents > 0 && amountCents < dueCents) status = 'underpaid'
        else if (amountCents > dueCents && dueCents > 0) status = 'matched'
        else if (dueCents <= 0) status = 'overpaid'
        else status = 'matched'
      } else if (clientId) {
        status = 'not_found'
      }

      return {
        accountNum: displayIdentifier,
        accountName,
        clientId,
        date,
        amount,
        amountStr: amount > 0 ? amount.toFixed(2) : '',
        status,
        summary,
        shortShipped: false,
      }
    }).filter((r) => r.accountNum || r.amount > 0)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target.result
        const rows = splitCSVRows(text)
        if (rows.length < 2) {
          setError('CSV must have a header row and at least one data row.')
          return
        }

        const [headerLine, ...dataLines] = rows
        const headers = parseCSVLine(headerLine)
        const columnMap = {}
        headers.forEach((h, i) => {
          const type = detectColumn(h)
          if (type && !columnMap[type]) columnMap[type] = i
        })

        if (columnMap.account_number === undefined && columnMap.account_name === undefined) {
          setError('Could not find "account_number" or "account_name" column. CSV must have at least one.')
          return
        }
        if (columnMap.amount === undefined) {
          setError('Could not find "amount_paid" column.')
          return
        }

        const rawRows = dataLines.map((line) => {
          const cols = parseCSVLine(line)
          return {
            accountNum: columnMap.account_number !== undefined ? (cols[columnMap.account_number] || '').trim() : '',
            accountNameInput: columnMap.account_name !== undefined ? (cols[columnMap.account_name] || '').trim() : '',
            amount: parseAmount(cols[columnMap.amount]),
            date: columnMap.date !== undefined ? parseDate(cols[columnMap.date]) : null,
          }
        })

        const parsed = buildParsedRows(rawRows)

        if (parsed.length === 0) {
          setError('No valid data rows found in the CSV.')
          return
        }

        setParsedRows(parsed)
        setStep(2)
      } catch (err) {
        setError('Failed to parse CSV: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleTableImport = () => {
    const filled = tableRows.filter((r) => r.account_number?.trim() || r.account_name?.trim() || parseAmount(r.amount_paid) > 0)
    if (filled.length === 0) {
      setError('Add at least one row with an account name or number.')
      return
    }
    setError('')

    const rawRows = filled.map((row) => ({
      accountNum: (row.account_number || '').trim(),
      accountNameInput: (row.account_name || '').trim(),
      amount: parseAmount(row.amount_paid),
      date: parseDate(row.payment_date),
    }))

    const parsed = buildParsedRows(rawRows)

    if (parsed.length === 0) {
      setError('No valid data rows found.')
      return
    }

    setParsedRows(parsed)
    setStep(2)
  }

  const updateAmount = (index, value) => {
    setParsedRows((prev) => {
      const updated = [...prev]
      const cleaned = value.replace(/[^0-9.]/g, '')
      const amount = parseFloat(cleaned) || 0
      const row = updated[index]
      const summary = row.summary

      let status = row.status
      if (summary) {
        const commDue = summary.totalCommDue - summary.totalPaid
        const dueCents = Math.round(commDue * 100)
        const amountCents = Math.round(amount * 100)
        if (dueCents <= 0) status = 'overpaid'
        else if (amountCents >= dueCents) status = 'matched'
        else if (amountCents > 0 && amountCents < dueCents) status = 'underpaid'
      }

      updated[index] = { ...row, amount, amountStr: cleaned, status }
      return updated
    })
  }

  const validRows = parsedRows.filter((r) => r.status !== 'not_found' && r.amount > 0)
  const matchedRows = parsedRows.filter((r) => r.status === 'matched')
  const underpaidRows = parsedRows.filter((r) => r.status === 'underpaid')
  const overpaidRows = parsedRows.filter((r) => r.status === 'overpaid')
  const notFoundRows = parsedRows.filter((r) => r.status === 'not_found')
  const totalAmount = validRows.reduce((sum, r) => sum + r.amount, 0)
  const shortShippedCount = parsedRows.filter((r) => r.shortShipped).length

  const toggleShortShipped = (index) => {
    setParsedRows((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], shortShipped: !updated[index].shortShipped }
      return updated
    })
  }

  const handleContinueToStep3 = () => {
    if (underpaidRows.length > 0) {
      setStep(3)
    } else {
      setStep(4)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Aggregate valid rows by clientId
      const byClient = new Map()
      validRows.forEach((r) => {
        if (!byClient.has(r.clientId)) {
          byClient.set(r.clientId, { clientId: r.clientId, shortShipped: r.shortShipped, payments: [] })
        }
        byClient.get(r.clientId).payments.push({
          amount: r.amount,
          date: r.date || null,
        })
        if (r.shortShipped) byClient.get(r.clientId).shortShipped = true
      })

      let count = 0
      for (const [clientId, entry] of byClient) {
        const summary = accountSummaries.get(clientId)
        if (!summary) continue

        const { firstOrderId, firstComm, orders: clientOrders, totalCommDue, totalPaid: existingTotalPaid } = summary

        // Get existing payments from first order's commission
        const existingPayments = firstComm?.payments || []
        const legacyPayments = existingPayments.length === 0 && firstComm?.amount_paid > 0
          ? [{ amount: firstComm.amount_paid, date: firstComm.paid_date || null }]
          : existingPayments

        // Append new payments
        const allPayments = [...legacyPayments, ...entry.payments]
        const newPaymentTotal = entry.payments.reduce((sum, p) => sum + p.amount, 0)
        const totalPaidNow = existingTotalPaid + newPaymentTotal
        const latestDate = allPayments.filter((p) => p.date).map((p) => p.date).sort().pop() || null

        // Determine status
        let status = entry.shortShipped ? 'short shipped' : 'pending invoice'
        const paidCents = Math.round(totalPaidNow * 100)
        const dueCents = Math.round(totalCommDue * 100)
        if (!entry.shortShipped) {
          if (paidCents >= dueCents && dueCents > 0) status = 'paid'
          else if (paidCents > 0 && paidCents < dueCents) status = 'partial'
        }

        const remaining = Math.max(totalCommDue - totalPaidNow, 0)

        // Save on first order's commission
        try {
          await upsertCommission({
            order_id: firstOrderId,
            commission_due: firstComm?.commission_due || (clientOrders[0].total * getExpectedRate(clientOrders[0].order_type) / 100),
            pay_status: status,
            amount_paid: totalPaidNow,
            paid_date: latestDate,
            amount_remaining: remaining,
            payments: allPayments,
          })
        } catch (err) {
          console.error('Saving with payments failed, retrying without:', err)
          await upsertCommission({
            order_id: firstOrderId,
            commission_due: firstComm?.commission_due || (clientOrders[0].total * getExpectedRate(clientOrders[0].order_type) / 100),
            pay_status: status,
            amount_paid: totalPaidNow,
            paid_date: latestDate,
            amount_remaining: remaining,
          })
        }

        // Update other orders in group to same status
        for (let i = 1; i < clientOrders.length; i++) {
          const o = clientOrders[i]
          const oCommDue = o.total * getExpectedRate(o.order_type) / 100
          await upsertCommission({
            order_id: o.id,
            commission_due: oCommDue,
            pay_status: status,
            amount_paid: 0,
            paid_date: null,
            amount_remaining: 0,
          })
        }

        count += entry.payments.length
      }

      setSavedCount(count)
      setStep(5) // success
    } catch (err) {
      console.error('Failed to save imported payments:', err)
      alert('Failed to save payments. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setStep(1)
    setMode('csv')
    setParsedRows([])
    setTableRows([])
    setError('')
    setSavedCount(0)
    setSelectedTracker('')
    onOpenChange(false)
  }

  const statusBadge = (status) => {
    switch (status) {
      case 'matched': return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 rounded-full px-2 py-0.5"><CheckCircle className="size-3" />Matched</span>
      case 'underpaid': return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5"><AlertTriangle className="size-3" />Underpaid</span>
      case 'overpaid': return <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full px-2 py-0.5"><Info className="size-3" />Overpaid</span>
      case 'not_found': return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 rounded-full px-2 py-0.5"><XCircle className="size-3" />Not Found</span>
      default: return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        style={{ maxWidth: mode === 'table' && step === 1 ? '56rem' : '48rem' }}
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Company banner */}
        <div className="flex items-center justify-center gap-3 pb-2">
          {company?.logo_path && (
            <img src={company.logo_path} alt={company.name} className="w-10 h-10 object-contain" />
          )}
          <span className="text-xl font-bold text-zinc-900 dark:text-white">{company?.name}</span>
        </div>

        {/* Step 1: Upload or Table */}
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>Import Payments</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Commission Tracker</Label>
                <Select value={selectedTracker} onValueChange={(v) => setSelectedTracker(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tracker" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTrackers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTracker && (
                <>
                  {/* Tab toggle */}
                  <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                    <button
                      className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${
                        mode === 'csv' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-muted-foreground'
                      }`}
                      onClick={() => { setMode('csv'); setError('') }}
                    >
                      Upload CSV
                    </button>
                    <button
                      className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${
                        mode === 'table' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-muted-foreground'
                      }`}
                      onClick={() => { setMode('table'); setError('') }}
                    >
                      Fill in App
                    </button>
                  </div>

                  {mode === 'csv' && (
                    <div
                      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-[#005b5b] hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="size-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm font-medium">Click to select a CSV file</p>
                      <p className="text-xs text-muted-foreground mt-1">or drag and drop</p>
                    </div>
                  )}

                  {mode === 'table' && (
                    <TableBuilder
                      columns={TABLE_COLUMNS}
                      rows={tableRows}
                      onChange={setTableRows}
                      minRows={1}
                    />
                  )}
                </>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between">
              {mode === 'csv' ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Need a template?</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-[#005b5b]"
                    asChild
                  >
                    <a href="/Payment Import Template.xlsx" download>
                      <Download className="size-3.5 mr-1" />
                      Download
                    </a>
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleTableImport}
                  disabled={!selectedTracker}
                  className="bg-[#005b5b] hover:bg-[#007a7a] text-white"
                >
                  Import
                </Button>
              )}
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: Review Table */}
        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle>Review Imported Payments</DialogTitle>
              <DialogDescription>
                Verify the matched payments below. You can edit amounts before continuing.
              </DialogDescription>
            </DialogHeader>

            {/* Summary bar */}
            <div className="flex flex-wrap gap-3 text-sm">
              {matchedRows.length > 0 && (
                <span className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full px-3 py-1 font-medium">
                  <CheckCircle className="size-3.5" />{matchedRows.length} matched
                </span>
              )}
              {overpaidRows.length > 0 && (
                <span className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full px-3 py-1 font-medium">
                  <Info className="size-3.5" />{overpaidRows.length} overpaid
                </span>
              )}
              {underpaidRows.length > 0 && (
                <span className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full px-3 py-1 font-medium">
                  <AlertTriangle className="size-3.5" />{underpaidRows.length} underpaid
                </span>
              )}
              {notFoundRows.length > 0 && (
                <span className="inline-flex items-center gap-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full px-3 py-1 font-medium">
                  <XCircle className="size-3.5" />{notFoundRows.length} not found
                </span>
              )}
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-800 border-b">
                    <th className="text-left py-2 px-3 font-medium">Account #</th>
                    <th className="text-left py-2 px-3 font-medium">Account Name</th>
                    <th className="text-left py-2 px-3 font-medium">Date</th>
                    <th className="text-right py-2 px-3 font-medium">Amount Paid</th>
                    <th className="text-right py-2 px-3 font-medium">Commission Due</th>
                    <th className="text-center py-2 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`border-b last:border-0 ${row.status === 'not_found' ? 'opacity-50 bg-zinc-50 dark:bg-zinc-800/50' : ''}`}
                    >
                      <td className="py-2 px-3 font-mono text-xs">{row.accountNum}</td>
                      <td className="py-2 px-3">{row.accountName || <span className="text-red-500 italic">Unknown</span>}</td>
                      <td className="py-2 px-3 text-muted-foreground">{row.date || '—'}</td>
                      <td className="py-2 px-3 text-right">
                        {row.status !== 'not_found' ? (
                          <div className="inline-flex items-center border rounded px-2 h-7 bg-white dark:bg-zinc-700 focus-within:ring-2 focus-within:ring-ring">
                            <span className="text-xs text-muted-foreground">$</span>
                            <input
                              type="text"
                              value={row.amountStr}
                              onChange={(e) => updateAmount(idx, e.target.value)}
                              className="w-20 text-sm bg-transparent outline-none ml-1 text-right"
                            />
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{fmt(row.amount)}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {row.summary ? fmt(row.summary.totalCommDue - row.summary.totalPaid) : '—'}
                      </td>
                      <td className="py-2 px-3 text-center">{statusBadge(row.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {notFoundRows.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-400">
                {notFoundRows.length} row(s) could not be matched and will be excluded from the import.
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setStep(1); setParsedRows([]); setError('') }}>
                {mode === 'table' ? 'Back to Edit' : 'Back'}
              </Button>
              <Button
                onClick={handleContinueToStep3}
                disabled={validRows.length === 0}
                className="bg-[#005b5b] hover:bg-[#007a7a] text-white"
              >
                Continue ({validRows.length} payment{validRows.length !== 1 ? 's' : ''})
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 3: Discrepancy Review */}
        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle>Review Underpaid Accounts</DialogTitle>
              <DialogDescription>
                These accounts were paid less than the commission due. Optionally mark as Short Shipped.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {underpaidRows.map((row, _) => {
                const globalIdx = parsedRows.indexOf(row)
                const commDue = row.summary ? row.summary.totalCommDue - row.summary.totalPaid : 0
                const difference = commDue - row.amount
                const avgPct = row.summary && row.summary.totalOrder > 0
                  ? (row.summary.totalCommDue / row.summary.totalOrder) * 100
                  : 0
                const unshippedSales = avgPct > 0 ? difference / (avgPct / 100) : 0

                return (
                  <div key={globalIdx} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{row.accountName}</span>
                      {statusBadge('underpaid')}
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground block">Expected</span>
                        <span className="font-bold">{fmt(commDue)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Paid</span>
                        <span className="font-bold text-amber-600">{fmt(row.amount)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Difference</span>
                        <span className="font-bold text-red-600">{fmt(difference)}</span>
                      </div>
                    </div>

                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={row.shortShipped}
                        onChange={() => toggleShortShipped(globalIdx)}
                        className="mt-0.5 size-4 rounded border-zinc-300 text-purple-600 focus:ring-purple-500"
                      />
                      <div>
                        <span className="text-sm font-medium group-hover:text-purple-600 transition-colors">
                          Mark as Short Shipped
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Remaining inventory won't ship. Commission will be adjusted to match payment.
                        </span>
                      </div>
                    </label>

                    {row.shortShipped && (
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 space-y-1 text-sm">
                        <div className="flex justify-between text-purple-600">
                          <span className="font-medium">Sales that did not ship:</span>
                          <span className="font-bold">{fmt(unshippedSales)}</span>
                        </div>
                        <div className="flex justify-between text-purple-600">
                          <span className="font-medium">Updated Sale:</span>
                          <span className="font-bold">{fmt(row.summary.totalOrder - unshippedSales)}</span>
                        </div>
                        <div className="flex justify-between text-purple-600">
                          <span className="font-medium">Updated Commission:</span>
                          <span className="font-bold">{fmt(row.amount)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button
                onClick={() => setStep(4)}
                className="bg-[#005b5b] hover:bg-[#007a7a] text-white"
              >
                Review & Save
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm Import</DialogTitle>
              <DialogDescription>Review the summary and save all payments.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Payments:</span>
                  <span className="font-bold">{validRows.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Amount:</span>
                  <span className="font-bold text-lg">{fmt(totalAmount)}</span>
                </div>
                <div className="border-t pt-2 mt-2 space-y-1">
                  <div className="flex justify-between text-green-700">
                    <span>Matched:</span>
                    <span className="font-medium">{matchedRows.length + overpaidRows.length}</span>
                  </div>
                  {underpaidRows.length > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>Underpaid:</span>
                      <span className="font-medium">{underpaidRows.length}</span>
                    </div>
                  )}
                  {shortShippedCount > 0 && (
                    <div className="flex justify-between text-purple-600">
                      <span>Marked Short Shipped:</span>
                      <span className="font-medium">{shortShippedCount}</span>
                    </div>
                  )}
                  {notFoundRows.length > 0 && (
                    <div className="flex justify-between text-red-500">
                      <span>Excluded (Not Found):</span>
                      <span className="font-medium">{notFoundRows.length}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => underpaidRows.length > 0 ? setStep(3) : setStep(2)}>Back</Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? 'Saving...' : `Record ${validRows.length} Payment${validRows.length !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 5: Success */}
        {step === 5 && (
          <>
            <DialogHeader>
              <DialogTitle>Payments Recorded</DialogTitle>
            </DialogHeader>

            <div className="text-center py-4">
              <CheckCircle className="size-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-lg font-medium">
                {savedCount} payment{savedCount !== 1 ? 's' : ''} saved successfully
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Totaling {fmt(totalAmount)}
              </p>
            </div>

            <DialogFooter>
              <Button onClick={handleClose} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ImportPaymentsModal
