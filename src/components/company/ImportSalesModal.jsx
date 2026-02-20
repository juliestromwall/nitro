import { useState, useMemo, useRef } from 'react'
import { Upload, Download, CheckCircle, AlertTriangle, ChevronDown, Search } from 'lucide-react'
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

// Inline searchable account picker for unmatched rows
function AccountPicker({ label, accounts, onSelect }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const ref = useRef(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts.slice(0, 50)
    const q = search.toLowerCase()
    return accounts.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 50)
  }, [accounts, search])

  // Close on outside click
  const handleBlur = (e) => {
    if (ref.current && !ref.current.contains(e.relatedTarget)) {
      setTimeout(() => setOpen(false), 150)
    }
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-amber-600 dark:text-amber-400 min-w-0 truncate">{label}</span>
        <span className="text-xs text-muted-foreground">&rarr;</span>
        <span className="font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle className="size-3.5" />
          {selected.name}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2" ref={ref} onBlur={handleBlur}>
      <span className="text-sm text-amber-600 dark:text-amber-400 min-w-0 shrink-0">{label}</span>
      <div className="relative flex-1 max-w-[240px]">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between gap-1 text-xs border rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 hover:border-[#005b5b] transition-colors"
        >
          <span className="text-muted-foreground">Select account...</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
        {open && (
          <div className="absolute z-50 top-full mt-1 w-64 bg-white dark:bg-zinc-800 border rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center gap-2 px-2 py-1.5 border-b">
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
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No accounts found</div>
              )}
              {filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setSelected(a)
                    setOpen(false)
                    onSelect(a.id)
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
        skipped.push({ line: idx + 1, accountName, reason: 'Account not found', raw })
        return
      }

      rows.push(buildOrderRow(raw, account))
    })

    return { rows, skipped }
  }

  // When user picks an account for a skipped row, resolve it
  const resolveSkippedRow = (skippedIndex, accountId) => {
    const account = accounts.find((a) => a.id === accountId)
    if (!account) return

    const skipped = skippedRows[skippedIndex]
    const order = buildOrderRow(skipped.raw, account)

    setParsedRows((prev) => [...prev, order])
    setSkippedRows((prev) => prev.filter((_, i) => i !== skippedIndex))
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
    const filled = tableRows.filter((r) => r.account_name?.trim())
    if (filled.length === 0) {
      setError('Add at least one row with an account name.')
      return
    }
    setError('')

    const { rows, skipped } = buildOrdersFromTable(filled)

    if (rows.length === 0 && skipped.length === 0) {
      setError('No valid rows found.')
      return
    }

    setParsedRows(rows)
    setSkippedRows(skipped)
    if (rows.length === 0 && skipped.length > 0) {
      setStep(2) // all skipped — let user fix with account picker
    } else {
      setStep(2)
    }
  }

  const handleImport = async () => {
    setSaving(true)
    try {
      await bulkAddOrders(parsedRows)
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
                <span className="font-medium">{parsedRows.length} sale{parsedRows.length !== 1 ? 's' : ''} ready to import</span>
              </div>

              {skippedRows.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-4" />
                    {skippedRows.length} unmatched account{skippedRows.length !== 1 ? 's' : ''} — select the correct account
                  </div>
                  <div className="space-y-2">
                    {skippedRows.map((s, i) => (
                      <AccountPicker
                        key={`${s.line}-${s.accountName}`}
                        label={`Row ${s.line}: "${s.accountName}"`}
                        accounts={accounts}
                        onSelect={(accountId) => resolveSkippedRow(i, accountId)}
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
              <Button variant="outline" onClick={handleBackToEdit}>
                {mode === 'table' ? 'Back to Edit' : 'Cancel'}
              </Button>
              <Button
                onClick={handleImport}
                disabled={saving}
                className="bg-[#005b5b] hover:bg-[#007a7a] text-white"
              >
                {saving ? 'Importing...' : `Import ${parsedRows.length} Sale${parsedRows.length !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ImportSalesModal
