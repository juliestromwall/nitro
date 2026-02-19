import { useState, useRef } from 'react'
import { Upload, Download, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useAccounts } from '@/context/AccountContext'
import { parseCSVLine } from '@/lib/csv'
import TableBuilder from '@/components/ui/TableBuilder'

const TABLE_COLUMNS = [
  { key: 'name', label: 'Account Name', type: 'text', required: true, placeholder: 'Mountain Sports', minWidth: 160 },
  { key: 'account_number', label: 'Account #', type: 'text', placeholder: 'AC-1234', minWidth: 100 },
  { key: 'region', label: 'Region', type: 'text', placeholder: 'Rockies' },
  { key: 'type', label: 'Type', type: 'text', placeholder: 'Resort' },
  { key: 'city', label: 'City', type: 'text', placeholder: 'Denver', minWidth: 100 },
  { key: 'state', label: 'State', type: 'text', placeholder: 'CO' },
]

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, ''))

  const map = {}
  headers.forEach((h, i) => {
    if (['account_name', 'account name', 'name'].includes(h)) map.name = i
    else if (['account_number', 'account number', 'account #', 'account#'].includes(h)) map.account_number = i
    else if (h === 'region') map.region = i
    else if (h === 'type') map.type = i
    else if (h === 'city') map.city = i
    else if (h === 'state') map.state = i
  })

  if (map.name === undefined) return []

  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line)
    return {
      name: cols[map.name] || '',
      account_number: map.account_number !== undefined ? cols[map.account_number] || '' : '',
      region: map.region !== undefined ? cols[map.region] || '' : '',
      type: map.type !== undefined ? cols[map.type] || '' : '',
      city: map.city !== undefined ? cols[map.city] || '' : '',
      state: map.state !== undefined ? cols[map.state] || '' : '',
    }
  }).filter((r) => r.name)
}

function ImportAccountsModal({ open, onOpenChange }) {
  const { addAccounts } = useAccounts()

  const [step, setStep] = useState(1)
  const [mode, setMode] = useState('csv')
  const [parsedRows, setParsedRows] = useState([])
  const [tableRows, setTableRows] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target.result
        const rows = parseCSV(text)

        if (rows.length === 0) {
          setError('No valid rows found. Make sure your CSV has an "account_name" or "name" column header.')
          return
        }

        setParsedRows(rows)
        setStep(2)
      } catch (err) {
        setError('Failed to parse CSV: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleTableImport = () => {
    const valid = tableRows.filter((r) => r.name?.trim())
    if (valid.length === 0) {
      setError('Add at least one account with a name.')
      return
    }
    setError('')
    setParsedRows(valid)
    setStep(2)
  }

  const handleImport = async () => {
    setSaving(true)
    try {
      await addAccounts(parsedRows)
      handleClose()
    } catch (err) {
      console.error('Failed to import accounts:', err)
      setError('Failed to import accounts. Please try again.')
      setSaving(false)
    }
  }

  const handleClose = () => {
    setStep(1)
    setMode('csv')
    setParsedRows([])
    setTableRows([])
    setError('')
    setSaving(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        style={{ maxWidth: mode === 'table' && step === 1 ? '64rem' : '48rem' }}
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Step 1: Upload or Table */}
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>Import Accounts</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
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
                <>
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-[#005b5b] hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm font-medium">Click to select a CSV file</p>
                    <p className="text-xs text-muted-foreground mt-1">or drag and drop</p>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </>
              )}

              {mode === 'table' && (
                <TableBuilder
                  columns={TABLE_COLUMNS}
                  rows={tableRows}
                  onChange={setTableRows}
                  minRows={1}
                />
              )}

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
                    <a href="/Account Import Template.xlsx" download>
                      <Download className="size-3.5 mr-1" />
                      Download
                    </a>
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleTableImport}
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
              <DialogTitle>Import Accounts</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="size-5 text-emerald-500" />
                <span className="font-medium">{parsedRows.length} account{parsedRows.length !== 1 ? 's' : ''} ready to import</span>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setStep(1); setParsedRows([]); setError('') }}>
                {mode === 'table' ? 'Back to Edit' : 'Cancel'}
              </Button>
              <Button
                onClick={handleImport}
                disabled={saving}
                className="bg-[#005b5b] hover:bg-[#007a7a] text-white"
              >
                {saving ? 'Importing...' : `Import ${parsedRows.length} Account${parsedRows.length !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ImportAccountsModal
