import { useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Upload, Download, CheckCircle, AlertTriangle, ChevronDown, Search, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

const STAGE_OPTIONS = ['Order Placed', 'Invoiced', 'Shipped', 'Cancelled']

// Inline searchable account picker — expands in-place to avoid overflow clipping
function AccountPicker({ label, accounts, resolvedAccount, onSelect, onClear }) {
  const [expanded, setExpanded] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts.slice(0, 50)
    const q = search.toLowerCase()
    return accounts.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 50)
  }, [accounts, search])

  if (resolvedAccount) {
    return (
      <div className="flex items-center justify-between gap-2 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-muted-foreground truncate">{label}</span>
          <span className="text-xs text-muted-foreground shrink-0">&rarr;</span>
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1 shrink-0">
            <CheckCircle className="size-3.5" />
            {resolvedAccount.name}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground shrink-0"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-amber-600 dark:text-amber-400 truncate">{label}</span>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[#005b5b] font-medium hover:underline flex items-center gap-1 shrink-0"
        >
          Select Account
          <ChevronDown className={`size-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {expanded && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 border rounded-md px-2.5 py-1.5 bg-white dark:bg-zinc-800">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts..."
              className="w-full text-xs bg-transparent outline-none"
              autoFocus
            />
          </div>
          <div className="max-h-36 overflow-y-auto border rounded-md bg-white dark:bg-zinc-800">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No accounts found</div>
            )}
            {filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors border-b last:border-0"
                onClick={() => {
                  onSelect(a.id)
                  setExpanded(false)
                  setSearch('')
                }}
              >
                {a.name}
                {a.account_number && <span className="text-muted-foreground ml-2">#{a.account_number}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ImportSalesModal({ open, onOpenChange, companyId }) {
  const { accounts } = useAccounts()
  const { companies } = useCompanies()
  const { orders, seasons, bulkAddOrders, getSeasonsForCompany } = useSales()

  const [step, setStep] = useState(1)
  const [mode, setMode] = useState('csv')
  const [selectedTracker, setSelectedTracker] = useState('')
  const [parsedRows, setParsedRows] = useState([])
  const [skippedRows, setSkippedRows] = useState([])
  const [tableRows, setTableRows] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)

  const company = companies.find((c) => c.id === companyId)
  const hasAccounts = accounts.length > 0

  // Show all non-archived seasons for this company, sorted newest first
  const availableTrackers = useMemo(() => {
    const { active } = getSeasonsForCompany(companyId)
    return [...active].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  }, [getSeasonsForCompany, companyId])

  const selectedTrackerLabel = useMemo(() => {
    const tracker = seasons.find((s) => s.id === selectedTracker)
    return tracker?.label || ''
  }, [seasons, selectedTracker])

  const tableColumns = useMemo(() => [
    { key: 'account_name', label: 'Account', type: 'text', required: true, placeholder: 'Mountain Sports', minWidth: 150 },
    { key: 'order_type', label: 'Category', type: 'select', options: company?.order_types || [], placeholder: 'Select...' },
    { key: 'items', label: 'Items', type: 'text', placeholder: 'Boards; Jackets', minWidth: 120 },
    { key: 'order_number', label: 'Order #', type: 'text', placeholder: 'ORD-001' },
    { key: 'invoice_number', label: 'Invoice #', type: 'text', placeholder: 'INV-001' },
    { key: 'close_date', label: 'Close Date', type: 'text', required: true, placeholder: 'MM/DD/YYYY', minWidth: 110 },
    { key: 'stage', label: 'Stage', type: 'select', options: STAGE_OPTIONS, placeholder: 'Select...' },
    { key: 'total', label: 'Total', type: 'number', required: true, placeholder: '0.00', minWidth: 90 },
    { key: 'notes', label: 'Notes', type: 'text', placeholder: '' },
  ], [company?.order_types])

  // Build a single order row from raw CSV/table data + a known account
  const buildOrderRow = (raw, account) => {
    const companyOrderTypes = company?.order_types || []
    const orderType = raw.order_type || companyOrderTypes[0] || ''
    const itemsStr = raw.items || ''
    const items = itemsStr.split(';').map((s) => s.trim()).filter(Boolean)
    const total = parseFloat(String(raw.total || '0').replace(/[$,]/g, '')) || 0
    const commOverride = raw.commission_override != null && String(raw.commission_override).trim()
      ? parseFloat(String(raw.commission_override).replace(/[%]/g, ''))
      : null

    const rawInvoice = (raw.invoice_number || '').replace(/\n/g, ' ')
    const invoiceNums = rawInvoice.split(',').map((s) => s.trim()).filter(Boolean)
    const invoices = invoiceNums.map((num) => ({ number: num, amount: 0, document: null }))

    return {
      client_id: account.id,
      company_id: companyId,
      season_id: selectedTracker,
      sale_type: 'Pre-Book',
      order_type: orderType,
      items: items.length ? items : [],
      order_number: raw.order_number || '',
      invoice_number: rawInvoice,
      invoices,
      close_date: raw.close_date || '',
      stage: raw.stage || 'Order Placed',
      total,
      commission_override: commOverride,
      notes: raw.notes || '',
    }
  }

  const parseSalesCSV = (text) => {
    const lines = splitCSVRows(text)
    if (lines.length < 2) return { rows: [], skipped: [] }

    const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, ''))
    const map = {}
    headers.forEach((h, i) => {
      if (['account_name', 'account name', 'account'].includes(h)) map.account_name = i
      else if (['order_type', 'order type', 'type', 'category'].includes(h)) map.order_type = i
      else if (['items', 'items_ordered', 'items ordered'].includes(h)) map.items = i
      else if (['order_number', 'order number', 'order #', 'order#'].includes(h)) map.order_number = i
      else if (['invoice_number', 'invoice number', 'invoice #', 'invoice#'].includes(h)) map.invoice_number = i
      else if (['close_date', 'close date', 'date'].includes(h)) map.close_date = i
      else if (h === 'stage') map.stage = i
      else if (h === 'total') map.total = i
      else if (['commission_override', 'commission override', 'commission %', 'commission'].includes(h)) map.commission_override = i
      else if (['notes', 'note'].includes(h)) map.notes = i
    })

    if (map.account_name === undefined) return { rows: [], skipped: [] }

    const rows = []
    const skipped = []

    lines.slice(1).forEach((line, idx) => {
      const cols = parseCSVLine(line)
      const accountName = cols[map.account_name] || ''
      if (!accountName) return

      // Build raw data object for this row
      const raw = {
        order_type: map.order_type !== undefined ? cols[map.order_type] || '' : '',
        items: map.items !== undefined ? cols[map.items] || '' : '',
        order_number: map.order_number !== undefined ? cols[map.order_number] || '' : '',
        invoice_number: map.invoice_number !== undefined ? cols[map.invoice_number] || '' : '',
        close_date: map.close_date !== undefined ? cols[map.close_date] || '' : '',
        stage: map.stage !== undefined ? cols[map.stage] || '' : '',
        total: map.total !== undefined ? cols[map.total] || '' : '',
        commission_override: map.commission_override !== undefined ? cols[map.commission_override] || '' : '',
        notes: map.notes !== undefined ? cols[map.notes] || '' : '',
      }

      const account = accounts.find((a) => a.name.toLowerCase() === accountName.toLowerCase())
      if (!account) {
        skipped.push({ line: idx + 2, accountName, reason: 'Account not found', raw })
        return
      }

      rows.push(buildOrderRow(raw, account))
    })

    return { rows, skipped }
  }

  const buildOrdersFromTable = (tableData) => {
    const rows = []
    const skipped = []

    tableData.forEach((row, idx) => {
      const accountName = (row.account_name || '').trim()
      if (!accountName) return

      const raw = {
        order_type: row.order_type || '',
        items: row.items || '',
        order_number: row.order_number || '',
        invoice_number: row.invoice_number || '',
        close_date: row.close_date || '',
        stage: row.stage || '',
        total: row.total || '',
        commission_override: null,
        notes: row.notes || '',
      }

      const account = accounts.find((a) => a.name.toLowerCase() === accountName.toLowerCase())
      if (!account) {
        skipped.push({ line: idx + 1, tableIdx: idx, accountName, reason: 'Account not found', raw })
        return
      }

      rows.push(buildOrderRow(raw, account))
    })

    return { rows, skipped }
  }

  // When user picks an account for a skipped row, mark it resolved (keep in list for review)
  const resolveSkippedRow = (skippedIndex, accountId) => {
    const account = accounts.find((a) => a.id === accountId)
    if (!account) return

    setSkippedRows((prev) => {
      const updated = [...prev]
      updated[skippedIndex] = { ...updated[skippedIndex], resolvedAccount: account }
      return updated
    })

    // For table mode, update original row so "Back to Edit" preserves the fix
    if (mode === 'table') {
      const tableIdx = skippedRows[skippedIndex].tableIdx
      if (tableIdx != null) {
        setTableRows((prev) => {
          const updated = [...prev]
          if (updated[tableIdx]) {
            updated[tableIdx] = { ...updated[tableIdx], account_name: account.name }
          }
          return updated
        })
      }
    }
  }

  const clearSkippedResolution = (skippedIndex) => {
    const skipped = skippedRows[skippedIndex]
    setSkippedRows((prev) => {
      const updated = [...prev]
      const { resolvedAccount, ...rest } = updated[skippedIndex]
      updated[skippedIndex] = rest
      return updated
    })
    // Revert table data if in table mode
    if (mode === 'table' && skipped.tableIdx != null) {
      setTableRows((prev) => {
        const updated = [...prev]
        if (updated[skipped.tableIdx]) {
          updated[skipped.tableIdx] = { ...updated[skipped.tableIdx], account_name: skipped.accountName }
        }
        return updated
      })
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target.result
        const { rows, skipped } = parseSalesCSV(text)

        if (rows.length === 0 && skipped.length === 0) {
          setError('Could not find "account_name" column. Check your CSV headers.')
          return
        }

        setParsedRows(rows)
        setSkippedRows(skipped)
        setStep(2)
      } catch (err) {
        setError('Failed to parse CSV: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleTableImport = () => {
    const hasData = tableRows.some((r) => r.account_name?.trim())
    if (!hasData) {
      setError('Add at least one row with an account name.')
      return
    }
    setError('')

    const { rows, skipped } = buildOrdersFromTable(tableRows)

    if (rows.length === 0 && skipped.length === 0) {
      setError('No valid rows found.')
      return
    }

    setParsedRows(rows)
    setSkippedRows(skipped)
    setStep(2)
  }

  const handleImport = async () => {
    const resolvedOrders = skippedRows
      .filter((s) => s.resolvedAccount)
      .map((s) => buildOrderRow(s.raw, s.resolvedAccount))
    setSaving(true)
    try {
      await bulkAddOrders([...parsedRows, ...resolvedOrders])
      handleClose()
    } catch (err) {
      console.error('Failed to import sales:', err)
      setError('Failed to import sales. Please try again.')
      setSaving(false)
    }
  }

  const handleClose = () => {
    setStep(1)
    setMode('csv')
    setSelectedTracker('')
    setParsedRows([])
    setSkippedRows([])
    setTableRows([])
    setError('')
    setSaving(false)
    onOpenChange(false)
  }

  const handleBackToEdit = () => {
    setStep(1)
    setParsedRows([])
    setSkippedRows([])
    setError('')
  }

  // Step 2 computed values
  const resolvedSkipped = skippedRows.filter((s) => s.resolvedAccount)
  const unresolvedSkipped = skippedRows.filter((s) => !s.resolvedAccount)
  const totalReady = parsedRows.length + resolvedSkipped.length

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        style={{ maxWidth: mode === 'table' && step === 1 ? '72rem' : '48rem' }}
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

        {/* Step 1: Select tracker + upload/table */}
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>Import Sales</DialogTitle>
            </DialogHeader>

            {!hasAccounts ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <Store className="size-10 text-muted-foreground" />
                <div>
                  <p className="font-medium text-zinc-900 dark:text-white">No Accounts Added</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You must first add accounts before importing sales.
                  </p>
                </div>
                <Link
                  to="/accounts"
                  onClick={handleClose}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#005b5b] hover:underline"
                >
                  <Store className="size-4" />
                  Go to Accounts
                </Link>
              </div>
            ) : (
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
                        columns={tableColumns}
                        rows={tableRows}
                        onChange={setTableRows}
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
            )}

            <DialogFooter className="flex items-center justify-between sm:justify-between">
              {!hasAccounts ? (
                <div />
              ) : mode === 'csv' ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Need a template?</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-[#005b5b]"
                    asChild
                  >
                    <a href="/Sales Import Template.xlsx" download>
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

        {/* Step 2: Confirmation */}
        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle>Import Sales</DialogTitle>
              <DialogDescription>
                These sales will be imported to <strong>{selectedTrackerLabel}</strong>. Continue?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="size-5 text-emerald-500" />
                <span className="font-medium">{totalReady} sale{totalReady !== 1 ? 's' : ''} ready to import</span>
              </div>

              {skippedRows.length > 0 && (
                <div className={`rounded-lg p-3 space-y-1 border ${
                  unresolvedSkipped.length === 0
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                }`}>
                  <div className={`flex items-center gap-2 text-sm font-medium pb-1 ${
                    unresolvedSkipped.length === 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}>
                    {unresolvedSkipped.length === 0
                      ? <CheckCircle className="size-4" />
                      : <AlertTriangle className="size-4" />
                    }
                    {unresolvedSkipped.length > 0
                      ? `${skippedRows.length} unmatched account${skippedRows.length !== 1 ? 's' : ''} — select the correct account`
                      : `All ${skippedRows.length} account${skippedRows.length !== 1 ? 's' : ''} matched`
                    }
                  </div>
                  <div className={`divide-y ${
                    unresolvedSkipped.length === 0
                      ? 'divide-emerald-200/50 dark:divide-emerald-800/50'
                      : 'divide-amber-200/50 dark:divide-amber-800/50'
                  }`}>
                    {skippedRows.map((s, i) => (
                      <AccountPicker
                        key={`${s.line}-${s.accountName}`}
                        label={`Row ${s.line}: "${s.accountName}"`}
                        accounts={accounts}
                        resolvedAccount={s.resolvedAccount || null}
                        onSelect={(accountId) => resolveSkippedRow(i, accountId)}
                        onClear={() => clearSkippedResolution(i)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={mode === 'table' ? handleBackToEdit : handleClose}>
                {mode === 'table' ? 'Back to Edit' : 'Cancel'}
              </Button>
              <Button
                onClick={handleImport}
                disabled={saving || totalReady === 0}
                className="bg-[#005b5b] hover:bg-[#007a7a] text-white"
              >
                {saving ? 'Importing...' : `Import ${totalReady} Sale${totalReady !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ImportSalesModal
