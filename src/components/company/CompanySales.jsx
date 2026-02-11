import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, FolderArchive, Pencil, Trash2, Check, X, ChevronDown, ChevronLeft, ChevronRight, Search, Filter, FileText, Upload, AlertTriangle, StickyNote, PartyPopper } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useAccounts } from '@/context/AccountContext'
import { useCompanies } from '@/context/CompanyContext'
import { useAuth } from '@/context/AuthContext'
import { uploadDocument, getDocumentUrl } from '@/lib/db'
import { useSales } from '@/context/SalesContext'
import { parseCSVLine } from '@/lib/csv'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const getItems = (order) => {
  if (order.items && order.items.length > 0) return order.items.join(', ')
  return ''
}

// Cents-first currency formatting: raw digits → "$X,XXX.XX"
// Typing "4424" stores "4424" (cents), displayed as "44.24"
const centsToDisplay = (raw) => {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const cents = parseInt(digits, 10)
  const dollars = (cents / 100).toFixed(2)
  const [whole, dec] = dollars.split('.')
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${withCommas}.${dec}`
}

// Convert stored cents-string back to a float for DB
const centsToFloat = (raw) => {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 0
  return parseInt(digits, 10) / 100
}

// Convert a dollar float (e.g. 48750.00) to cents-string for the input state
const floatToCents = (val) => {
  const num = parseFloat(val)
  if (isNaN(num)) return ''
  return String(Math.round(num * 100))
}

const HYPE_MESSAGES = [
  "LET'S GOOO! That's",
  "STACKED! You just earned",
  "SENDING IT! That's",
  "FULL SEND! You just locked in",
  "BOOSTED! That's",
  "CRUSHED IT! You just banked",
  "SHREDDING! That's",
  "STOMPED IT! You just scored",
  "ON FIRE! That's",
  "DROPPING IN HOT! You just secured",
  "BUTTERED THAT DEAL! That's",
  "CLEAN LANDING! You just pocketed",
  "POWDER DAY VIBES! That's",
  "CORK 10 ENERGY! You just earned",
  "STRAIGHT CHARGING! That's",
]

const HYPE_CLOSERS = [
  "in commission! Keep shredding!",
  "in commission! The mountain is yours!",
  "in commission! Nothing but freshies!",
  "in commission! You're on a heater!",
  "in commission! Ride that wave!",
  "in commission! Keep stacking!",
  "in commission! Send it again!",
  "in commission! No flat days here!",
]

function CompanySales({ companyId, addSaleOpen, setAddSaleOpen }) {
  const { accounts, getAccountName } = useAccounts()
  const { companies } = useCompanies()
  const { user } = useAuth()

  const {
    activeSeasons, archivedSeasons, orders,
    addSeason, updateSeason, toggleArchiveSeason,
    addOrder, bulkAddOrders, updateOrder, deleteOrder,
  } = useSales()

  const getCompany = (id) => companies.find((c) => c.id === id)

  const getCommission = (order) => {
    const company = getCompany(order.company_id)
    const defaultPct = company?.commission_percent || 0
    const pct = order.commission_override != null ? order.commission_override : defaultPct
    const isOverridden = order.commission_override != null && order.commission_override !== defaultPct
    return { amount: order.total * pct / 100, pct, isOverridden, defaultPct }
  }

  const company = getCompany(companyId)
  const companyOrderTypes = company?.order_types || []
  const companyItems = company?.items || []
  const companyStages = company?.stages || []

  const [activeTab, setActiveTab] = useState(activeSeasons[0]?.id || '')
  const [tabDialogOpen, setTabDialogOpen] = useState(false)
  const [editingTabId, setEditingTabId] = useState(null)
  const [tabForm, setTabForm] = useState({ label: '', year: '', start_date: '', end_date: '' })
  const [hoveredRow, setHoveredRow] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOrderType, setFilterOrderType] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [showOrderTypeFilter, setShowOrderTypeFilter] = useState(false)
  const [showStageFilter, setShowStageFilter] = useState(false)

  // Add/Edit Sale dialog state
  const [editingOrderId, setEditingOrderId] = useState(null)
  const [saleStep, setSaleStep] = useState(1)
  const [accountSearch, setAccountSearch] = useState('')
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const [saleForm, setSaleForm] = useState({
    client_id: null,
    clientName: '',
    sale_type: 'Prebook',
    season_id: '',
    order_type: '',
    items: [],
    order_number: '',
    invoice_number: '',
    close_date: '',
    stage: '',
    order_document: null,
    invoice_document: null,
    total: '',
    commission_override: '',
    notes: '',
  })
  const orderDocRef = useRef(null)
  const invoiceDocRef = useRef(null)

  // Notes modal state
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [noteOrderId, setNoteOrderId] = useState(null)
  const [noteText, setNoteText] = useState('')

  // CSV import state
  const csvInputRef = useRef(null)
  const [csvConfirmOpen, setCsvConfirmOpen] = useState(false)
  const [csvParsedRows, setCsvParsedRows] = useState([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvSkipped, setCsvSkipped] = useState([])

  // Celebration popup state
  const [celebrationOpen, setCelebrationOpen] = useState(false)
  const [celebrationData, setCelebrationData] = useState({ commission: 0, hypeMessage: '', hypeCloser: '' })

  // Ensure activeTab is valid
  const allVisibleSeasons = showArchived
    ? [...activeSeasons, ...archivedSeasons]
    : activeSeasons
  const currentSeason = allVisibleSeasons.find((s) => s.id === activeTab) || activeSeasons[0]

  // Filtered accounts for searchable dropdown
  const filteredAccounts = accountSearch.trim()
    ? accounts.filter((a) => a.name.toLowerCase().includes(accountSearch.toLowerCase())).slice(0, 10)
    : accounts.slice(0, 10)

  // Whether the sale dialog is in "edit" vs "add" mode
  const isEditMode = editingOrderId !== null
  const saleDialogOpen = addSaleOpen || isEditMode

  const closeSaleDialog = () => {
    setAddSaleOpen(false)
    setEditingOrderId(null)
    setSaleStep(1)
    resetSaleForm()
  }

  const resetSaleForm = () => {
    setSaleForm({
      client_id: null, clientName: '', sale_type: 'Prebook', season_id: currentSeason?.id || '',
      order_type: '',
      items: [], order_number: '', invoice_number: '', close_date: '',
      stage: '', order_document: null, invoice_document: null, total: '', commission_override: '', notes: '',
    })
    setAccountSearch('')
    setSaleStep(1)
  }

  // Tab dialog handlers
  const openCreateTab = () => {
    setEditingTabId(null)
    setTabForm({ label: '', year: '', start_date: '', end_date: '' })
    setTabDialogOpen(true)
  }

  const openEditTab = (season) => {
    setEditingTabId(season.id)
    setTabForm({
      label: season.label,
      year: season.year || '',
      start_date: season.start_date || '',
      end_date: season.end_date || '',
    })
    setTabDialogOpen(true)
  }

  const handleTabSubmit = async (e) => {
    e.preventDefault()
    if (editingTabId) {
      await updateSeason(editingTabId, {
        label: tabForm.label,
        year: tabForm.year,
        start_date: tabForm.start_date,
        end_date: tabForm.end_date,
      })
    } else {
      const newSeason = await addSeason({
        label: tabForm.label,
        year: tabForm.year,
        start_date: tabForm.start_date,
        end_date: tabForm.end_date,
      })
      setActiveTab(newSeason.id)
    }
    setTabForm({ label: '', year: '', start_date: '', end_date: '' })
    setEditingTabId(null)
    setTabDialogOpen(false)
  }

  const handleArchiveFromModal = async () => {
    const id = editingTabId
    await toggleArchiveSeason(id)
    setTabDialogOpen(false)
    setEditingTabId(null)
    setTabForm({ label: '', year: '', start_date: '', end_date: '' })
    if (activeTab === id) {
      const remaining = activeSeasons.filter((s) => s.id !== id)
      setActiveTab(remaining[0]?.id || '')
    }
  }

  // Open edit modal for an existing order
  const openEditOrder = (order) => {
    setEditingOrderId(order.id)
    setSaleStep(1)
    setSaleForm({
      client_id: order.client_id,
      clientName: getAccountName(order.client_id),
      sale_type: order.sale_type || 'Prebook',
      season_id: order.season_id || currentSeason?.id || '',
      order_type: order.order_type,
      items: order.items || [],
      order_number: order.order_number,
      invoice_number: order.invoice_number || '',
      close_date: order.close_date,
      stage: order.stage,
      order_document: order.order_document || null,
      invoice_document: order.invoice_document || null,
      total: floatToCents(order.total),
      commission_override: order.commission_override != null ? String(order.commission_override) : '',
      notes: order.notes || '',
    })
  }

  // Toggle item in checkbox list
  const toggleItem = (item) => {
    setSaleForm((p) => ({
      ...p,
      items: p.items.includes(item)
        ? p.items.filter((i) => i !== item)
        : [...p.items, item],
    }))
  }

  // Add or Edit Sale submit
  const handleSaleSubmit = async (e) => {
    e.preventDefault()
    if (!saleForm.client_id || !saleForm.order_type || !saleForm.stage) return

    const total = centsToFloat(saleForm.total)
    const commOverride = saleForm.commission_override.trim() !== '' ? parseFloat(saleForm.commission_override) : null

    const orderData = {
      client_id: saleForm.client_id,
      company_id: companyId,
      season_id: saleForm.season_id || currentSeason?.id,
      sale_type: saleForm.sale_type,
      order_type: saleForm.order_type,
      items: saleForm.items,
      order_number: saleForm.order_number,
      invoice_number: saleForm.invoice_number,
      close_date: saleForm.close_date,
      stage: saleForm.stage,
      order_document: saleForm.order_document,
      invoice_document: saleForm.invoice_document,
      total,
      commission_override: commOverride,
      notes: saleForm.notes,
    }

    const wasAdd = !isEditMode

    if (isEditMode) {
      await updateOrder(editingOrderId, orderData)
    } else {
      await addOrder(orderData)
    }

    closeSaleDialog()

    // Show celebration popup for new sales
    if (wasAdd && total > 0) {
      const defaultPct = company?.commission_percent || 0
      const pct = commOverride != null ? commOverride : defaultPct
      const commission = total * pct / 100
      setCelebrationData({
        commission,
        hypeMessage: HYPE_MESSAGES[Math.floor(Math.random() * HYPE_MESSAGES.length)],
        hypeCloser: HYPE_CLOSERS[Math.floor(Math.random() * HYPE_CLOSERS.length)],
      })
      setCelebrationOpen(true)
    }
  }

  const handleOrderDocUpload = async (e) => {
    const file = e.target.files?.[0]
    if (file && user) {
      try {
        const doc = await uploadDocument(user.id, editingOrderId || 'new', 'order', file)
        setSaleForm((p) => ({ ...p, order_document: { name: doc.name, path: doc.path } }))
      } catch (err) {
        console.error('Failed to upload order document:', err)
      }
    }
    if (orderDocRef.current) orderDocRef.current.value = ''
  }

  const handleInvoiceDocUpload = async (e) => {
    const file = e.target.files?.[0]
    if (file && user) {
      try {
        const doc = await uploadDocument(user.id, editingOrderId || 'new', 'invoice', file)
        setSaleForm((p) => ({ ...p, invoice_document: { name: doc.name, path: doc.path } }))
      } catch (err) {
        console.error('Failed to upload invoice document:', err)
      }
    }
    if (invoiceDocRef.current) invoiceDocRef.current.value = ''
  }

  // Notes modal
  const openNoteModal = (order) => {
    setNoteOrderId(order.id)
    setNoteText(order.notes || '')
    setNoteModalOpen(true)
  }

  const saveNote = async () => {
    if (noteOrderId) {
      await updateOrder(noteOrderId, { notes: noteText })
    }
    setNoteModalOpen(false)
    setNoteOrderId(null)
    setNoteText('')
  }

  const handleDelete = async (orderId) => {
    await deleteOrder(orderId)
  }

  // CSV import handlers
  const parseSalesCSV = (text) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length < 2) return { rows: [], skipped: [] }

    const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, ''))
    const map = {}
    headers.forEach((h, i) => {
      if (['account_name', 'account name', 'account'].includes(h)) map.account_name = i
      else if (['order_type', 'order type', 'type'].includes(h)) map.order_type = i
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

      const account = accounts.find((a) => a.name.toLowerCase() === accountName.toLowerCase())
      if (!account) {
        skipped.push({ line: idx + 2, accountName, reason: 'Account not found' })
        return
      }

      const orderType = map.order_type !== undefined ? cols[map.order_type] || companyOrderTypes[0] || '' : companyOrderTypes[0] || ''
      const itemsStr = map.items !== undefined ? cols[map.items] || '' : ''
      const items = itemsStr.split(';').map((s) => s.trim()).filter(Boolean)
      const total = map.total !== undefined ? parseFloat(cols[map.total]?.replace(/[$,]/g, '')) || 0 : 0
      const commOverride = map.commission_override !== undefined && cols[map.commission_override]?.trim()
        ? parseFloat(cols[map.commission_override]?.replace(/[%]/g, ''))
        : null

      rows.push({
        client_id: account.id,
        company_id: companyId,
        season_id: currentSeason.id,
        order_type: orderType,
        items: items.length ? items : [],
        order_number: map.order_number !== undefined ? cols[map.order_number] || '' : '',
        invoice_number: map.invoice_number !== undefined ? cols[map.invoice_number] || '' : '',
        close_date: map.close_date !== undefined ? cols[map.close_date] || '' : '',
        stage: map.stage !== undefined ? cols[map.stage] || companyStages[0] || 'Closed - Won' : companyStages[0] || 'Closed - Won',
        total,
        commission_override: commOverride,
        notes: map.notes !== undefined ? cols[map.notes] || '' : '',
      })
    })

    return { rows, skipped }
  }

  const handleCSVFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !currentSeason) return

    try {
      const text = await file.text()
      const { rows, skipped } = parseSalesCSV(text)
      if (rows.length === 0) {
        alert(skipped.length > 0
          ? `No valid rows found. ${skipped.length} row(s) skipped (accounts not found). Make sure account names match exactly.`
          : 'No valid rows found. Make sure your CSV has an "account_name" column header.')
        return
      }
      setCsvParsedRows(rows)
      setCsvSkipped(skipped)
      setCsvConfirmOpen(true)
    } catch (err) {
      console.error('CSV parse failed:', err)
      alert('Failed to read CSV file.')
    }
    if (csvInputRef.current) csvInputRef.current.value = ''
  }

  const handleCSVConfirm = async () => {
    setCsvImporting(true)
    try {
      await bulkAddOrders(csvParsedRows)
      setCsvConfirmOpen(false)
      setCsvParsedRows([])
      setCsvSkipped([])
    } catch (err) {
      console.error('CSV import failed:', err)
      alert('Import failed. Please try again.')
    } finally {
      setCsvImporting(false)
    }
  }

  // Current season data filtered by companyId
  const seasonOrders = currentSeason
    ? orders.filter((o) => o.season_id === currentSeason.id && o.company_id === companyId)
    : []

  const filteredOrders = useMemo(() => {
    let result = seasonOrders

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((o) => {
        const accountName = getAccountName(o.client_id).toLowerCase()
        const orderNum = (o.order_number || '').toLowerCase()
        const invoiceNum = (o.invoice_number || '').toLowerCase()
        const total = String(o.total)
        return accountName.includes(q) || orderNum.includes(q) || invoiceNum.includes(q) || total.includes(q)
      })
    }

    if (filterOrderType) {
      result = result.filter((o) => o.order_type === filterOrderType)
    }

    if (filterStage) {
      result = result.filter((o) => o.stage === filterStage)
    }

    return result
  }, [seasonOrders, searchQuery, filterOrderType, filterStage])

  const uniqueOrderTypes = [...new Set(seasonOrders.map((o) => o.order_type))]
  const uniqueStages = [...new Set(seasonOrders.map((o) => o.stage))]

  // Compute totals — dynamic per order type
  const totalSales = seasonOrders.reduce((sum, o) => sum + o.total, 0)
  const totalCommission = seasonOrders.reduce((sum, o) => sum + getCommission(o).amount, 0)

  // Per-order-type totals for summary cards
  const orderTypeTotals = useMemo(() => {
    const map = {}
    seasonOrders.forEach((o) => {
      if (!map[o.order_type]) map[o.order_type] = 0
      map[o.order_type] += o.total
    })
    return map
  }, [seasonOrders])

  return (
    <div className="space-y-6 min-w-0">
      {/* Season tabs bar */}
      <div className="flex items-center gap-1 border-b">
        <div className="flex items-center gap-1 overflow-x-auto min-w-0 flex-1">
          {activeSeasons.map((season) => (
            <div key={season.id} className="group flex items-center">
              <button
                onClick={() => setActiveTab(season.id)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === season.id
                    ? 'border-b-2 border-zinc-900 text-zinc-900'
                    : 'text-muted-foreground hover:text-zinc-700'
                }`}
              >
                {season.label}
              </button>
              <button
                onClick={() => openEditTab(season)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-zinc-700 -ml-2"
                title="Edit tab"
              >
                <Pencil className="size-3" />
              </button>
            </div>
          ))}
        </div>

        {archivedSeasons.length > 0 && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-zinc-700 flex items-center gap-1 whitespace-nowrap"
            >
              <FolderArchive className="size-3.5" />
              Archived ({archivedSeasons.length})
              <ChevronDown className={`size-3 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
            </button>
            {showArchived && (
              <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-48">
                {archivedSeasons.map((season) => (
                  <button
                    key={season.id}
                    onClick={() => { openEditTab(season); setShowArchived(false) }}
                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-50 text-sm text-muted-foreground hover:text-zinc-900"
                  >
                    <span className="flex-1 text-left">{season.label}</span>
                    <Pencil className="size-3.5 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={openCreateTab}
          className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap flex items-center gap-1 shrink-0"
        >
          <Plus className="size-4" /> New Sales Tracker
        </button>
      </div>

      {/* Create / Edit tab dialog */}
      <Dialog open={tabDialogOpen} onOpenChange={(open) => {
        setTabDialogOpen(open)
        if (!open) { setEditingTabId(null); setTabForm({ label: '', year: '', start_date: '', end_date: '' }) }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTabId ? 'Edit Sales Tracker' : 'New Sales Tracker'}</DialogTitle>
            <DialogDescription>
              {editingTabId ? 'Update this tracker or change its archive status.' : 'Create a new tracker for a specific sales period.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTabSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tabLabel">Tracker Name</Label>
              <Input
                id="tabLabel"
                placeholder='e.g. "US 2027-2028" or "Demos"'
                value={tabForm.label}
                onChange={(e) => setTabForm((p) => ({ ...p, label: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tabYear">Year</Label>
              <Input
                id="tabYear"
                placeholder="e.g. 2027"
                value={tabForm.year}
                onChange={(e) => setTabForm((p) => ({ ...p, year: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={tabForm.start_date}
                  onChange={(e) => setTabForm((p) => ({ ...p, start_date: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={tabForm.end_date}
                  onChange={(e) => setTabForm((p) => ({ ...p, end_date: e.target.value }))}
                  required
                />
              </div>
            </div>
            <DialogFooter className="flex gap-2">
              {editingTabId && (() => {
                const isArchived = archivedSeasons.some((s) => s.id === editingTabId)
                return (
                  <Button
                    type="button"
                    variant={isArchived ? 'default' : 'destructive'}
                    className={isArchived ? 'bg-green-600 hover:bg-green-700 mr-auto' : 'mr-auto'}
                    onClick={handleArchiveFromModal}
                  >
                    <FolderArchive className="size-4 mr-1" />
                    {isArchived ? 'Unarchive' : 'Archive'}
                  </Button>
                )
              })()}
              <Button type="submit">{editingTabId ? 'Save Changes' : 'Create Tracker'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Sale dialog — 2-step wizard */}
      <Dialog open={saleDialogOpen} onOpenChange={(open) => { if (!open) closeSaleDialog() }}>
        <DialogContent
          className="max-w-lg"
          showCloseButton={false}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {/* Company logo + name banner */}
          <div className="flex items-center justify-center gap-3 pb-2">
            {company?.logo_path && (
              <img src={company.logo_path} alt={company.name} className="w-10 h-10 object-contain" />
            )}
            <span className="text-xl font-bold text-zinc-900">{company?.name}</span>
          </div>

          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Sale' : 'Add Sale'}</DialogTitle>
            <DialogDescription>
              {saleStep === 1
                ? 'Step 1 of 2 — Sale setup'
                : 'Step 2 of 2 — Sale details'}
            </DialogDescription>
          </DialogHeader>

          {saleStep === 1 ? (
            /* ── Step 1: Sale Setup ── */
            <div className="space-y-4">
              {/* Sale Type */}
              <div className="space-y-2">
                <Label>Sale Type</Label>
                <select
                  value={saleForm.sale_type}
                  onChange={(e) => setSaleForm((p) => ({ ...p, sale_type: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="Prebook">Prebook</option>
                  <option value="At Once">At Once</option>
                </select>
              </div>

              {/* Tracker */}
              <div className="space-y-2">
                <Label>Tracker</Label>
                <select
                  value={saleForm.season_id || currentSeason?.id || ''}
                  onChange={(e) => setSaleForm((p) => ({ ...p, season_id: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  {activeSeasons.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Account Name — searchable, collapsed by default */}
              <div className="space-y-2">
                <Label>Account</Label>
                {isEditMode ? (
                  <Input value={saleForm.clientName} disabled />
                ) : (
                  <div className="relative">
                    <Input
                      placeholder="Search accounts..."
                      value={saleForm.clientName || accountSearch}
                      onChange={(e) => {
                        setAccountSearch(e.target.value)
                        setSaleForm((p) => ({ ...p, client_id: null, clientName: '' }))
                        setShowAccountDropdown(true)
                      }}
                      onFocus={() => setShowAccountDropdown(true)}
                    />
                    {showAccountDropdown && !saleForm.client_id && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                        {filteredAccounts.map((account) => (
                          <button
                            key={account.id}
                            type="button"
                            onClick={() => {
                              setSaleForm((p) => ({ ...p, client_id: account.id, clientName: account.name }))
                              setAccountSearch('')
                              setShowAccountDropdown(false)
                            }}
                            className="block w-full text-left px-3 py-2 text-sm hover:bg-zinc-50"
                          >
                            <span className="font-medium">{account.name}</span>
                            <span className="text-muted-foreground ml-2">{account.city}, {account.state}</span>
                          </button>
                        ))}
                        {filteredAccounts.length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No accounts found</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeSaleDialog}>Cancel</Button>
                <Button
                  type="button"
                  disabled={!saleForm.client_id}
                  onClick={() => { setShowAccountDropdown(false); setSaleStep(2) }}
                >
                  Next <ChevronRight className="size-4 ml-1" />
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* ── Step 2: Sale Details ── */
            <form onSubmit={handleSaleSubmit} className="space-y-4">
              {/* Order Type — required */}
              <div className="space-y-2">
                <Label>Order Type <span className="text-red-500">*</span></Label>
                <select
                  value={saleForm.order_type}
                  onChange={(e) => setSaleForm((p) => ({ ...p, order_type: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  required
                >
                  <option value="" disabled>Select order type...</option>
                  {companyOrderTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Items Ordered — multi-select checkboxes */}
              <div className="space-y-2">
                <Label>Items Ordered</Label>
                {companyItems.length > 0 ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-2 border rounded-md p-3">
                    {companyItems.map((item) => (
                      <label key={item} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saleForm.items.includes(item)}
                          onChange={() => toggleItem(item)}
                          className="size-4 rounded border-zinc-300"
                        />
                        {item}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground border rounded-md p-3">
                    No items configured. Add items in the Settings tab.
                  </p>
                )}
              </div>

              {/* Order # with Upload Doc */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Order #</Label>
                  <input ref={orderDocRef} type="file" onChange={handleOrderDocUpload} className="hidden" />
                  {saleForm.order_document ? (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <FileText className="size-3" /> {saleForm.order_document.name}
                      <button type="button" onClick={() => setSaleForm((p) => ({ ...p, order_document: null }))}>
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ) : (
                    <button
                      type="button"
                      onClick={() => orderDocRef.current?.click()}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                    >
                      <Upload className="size-3" /> Upload Doc
                    </button>
                  )}
                </div>
                <Input
                  value={saleForm.order_number}
                  onChange={(e) => setSaleForm((p) => ({ ...p, order_number: e.target.value }))}
                />
              </div>

              {/* Total — BIG cents-first input */}
              <div className="space-y-2">
                <Label>Total <span className="text-red-500">*</span></Label>
                <div className="flex items-center border rounded-md h-16 px-4 focus-within:ring-2 focus-within:ring-ring">
                  <span className="text-4xl font-black text-zinc-900 select-none">$</span>
                  <input
                    inputMode="numeric"
                    placeholder="0.00"
                    value={centsToDisplay(saleForm.total)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '')
                      setSaleForm((p) => ({ ...p, total: digits }))
                    }}
                    className="flex-1 text-4xl font-black tracking-tight bg-transparent outline-none ml-1"
                    required
                  />
                </div>
              </div>

              {/* Close Date + Stage side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Close Date</Label>
                  <Input
                    type="date"
                    value={saleForm.close_date}
                    onChange={(e) => setSaleForm((p) => ({ ...p, close_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stage <span className="text-red-500">*</span></Label>
                  <select
                    value={saleForm.stage}
                    onChange={(e) => setSaleForm((p) => ({ ...p, stage: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    required
                  >
                    <option value="" disabled>Select stage...</option>
                    {companyStages.map((stage) => (
                      <option key={stage} value={stage}>{stage}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-16 resize-y"
                  placeholder="Any notes about this sale..."
                  value={saleForm.notes}
                  onChange={(e) => setSaleForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setSaleStep(1)}>
                  <ChevronLeft className="size-4 mr-1" /> Back
                </Button>
                <Button type="button" variant="outline" onClick={closeSaleDialog}>Cancel</Button>
                <Button type="submit" disabled={!saleForm.client_id || !saleForm.order_type || !saleForm.stage}>
                  {isEditMode ? 'Save Changes' : 'Add Sale'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Notes modal */}
      <Dialog open={noteModalOpen} onOpenChange={setNoteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {noteOrderId && orders.find((o) => o.id === noteOrderId)?.notes ? 'Edit Note' : 'Add Note'}
            </DialogTitle>
            <DialogDescription>
              {noteOrderId && getAccountName(orders.find((o) => o.id === noteOrderId)?.client_id)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm min-h-24 resize-y"
              placeholder="Add a note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setNoteModalOpen(false)}>Cancel</Button>
              <Button onClick={saveNote}>Save Note</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV import confirmation dialog */}
      <Dialog open={csvConfirmOpen} onOpenChange={(open) => { if (!open) { setCsvConfirmOpen(false); setCsvParsedRows([]); setCsvSkipped([]) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Sales</DialogTitle>
            <DialogDescription>
              These sales will be imported to <span className="font-semibold text-foreground">{currentSeason?.label}</span>. Continue?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{csvParsedRows.length}</span> sale{csvParsedRows.length === 1 ? '' : 's'} ready to import.
            </p>
            {csvSkipped.length > 0 && (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3 space-y-1">
                <p className="font-medium flex items-center gap-1">
                  <AlertTriangle className="size-3.5" />
                  {csvSkipped.length} row{csvSkipped.length === 1 ? '' : 's'} will be skipped:
                </p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {csvSkipped.slice(0, 5).map((s, i) => (
                    <li key={i}>Row {s.line}: "{s.accountName}" — {s.reason}</li>
                  ))}
                  {csvSkipped.length > 5 && <li>...and {csvSkipped.length - 5} more</li>}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCsvConfirmOpen(false); setCsvParsedRows([]); setCsvSkipped([]) }}>Cancel</Button>
            <Button onClick={handleCSVConfirm} disabled={csvImporting}>
              {csvImporting ? 'Importing...' : `Import ${csvParsedRows.length} Sale${csvParsedRows.length === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Celebration popup after adding a sale */}
      <Dialog open={celebrationOpen} onOpenChange={setCelebrationOpen}>
        <DialogContent className="max-w-sm text-center overflow-hidden">
          <DialogTitle className="sr-only">Sale Added</DialogTitle>
          <DialogDescription className="sr-only">Celebration popup showing commission earned</DialogDescription>
          <div className="relative py-4">
            {/* Animated background confetti dots */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 rounded-full animate-bounce"
                  style={{
                    backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][i % 6],
                    left: `${8 + (i * 8)}%`,
                    top: `${10 + (i % 3) * 30}%`,
                    animationDelay: `${i * 0.15}s`,
                    animationDuration: `${0.8 + (i % 3) * 0.4}s`,
                  }}
                />
              ))}
            </div>

            <div className="relative z-10 space-y-4">
              <div className="text-5xl animate-bounce" style={{ animationDuration: '1s' }}>
                {company?.logo_path ? (
                  <img src={company.logo_path} alt="" className="w-16 h-16 object-contain mx-auto" />
                ) : (
                  <PartyPopper className="size-16 mx-auto text-amber-500" />
                )}
              </div>

              <div className="space-y-2">
                <p className="text-lg font-bold text-zinc-900">
                  {celebrationData.hypeMessage}
                </p>
                <p className="text-4xl font-black text-green-600 tracking-tight animate-pulse">
                  {fmt(celebrationData.commission)}
                </p>
                <p className="text-lg font-bold text-zinc-900">
                  {celebrationData.hypeCloser}
                </p>
              </div>

              <Button
                onClick={() => setCelebrationOpen(false)}
                className="mt-4 bg-green-600 hover:bg-green-700 text-white font-bold px-8"
              >
                LET'S GO!
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search and summary */}
      {currentSeason && (
        <>
          {/* Summary cards — dynamic per order type */}
          <div className={`grid gap-6`} style={{ gridTemplateColumns: `repeat(${Math.min(Object.keys(orderTypeTotals).length + 2, 5)}, minmax(0, 1fr))` }}>
            <Card
              className={`cursor-pointer transition-shadow hover:shadow-md ${!filterOrderType ? 'ring-2 ring-zinc-900' : ''}`}
              onClick={() => setFilterOrderType('')}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(totalSales)}</p>
              </CardContent>
            </Card>
            {Object.entries(orderTypeTotals).map(([type, total]) => (
              <Card
                key={type}
                className={`cursor-pointer transition-shadow hover:shadow-md ${filterOrderType === type ? 'ring-2 ring-zinc-900' : ''}`}
                onClick={() => setFilterOrderType(filterOrderType === type ? '' : type)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{type} Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{fmt(total)}</p>
                </CardContent>
              </Card>
            ))}
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Commission</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(totalCommission)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search account, order #, invoice #, total..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              onChange={handleCSVFileSelect}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()}>
              <Upload className="size-4 mr-1" /> Import CSV
            </Button>
          </div>

          {(filterOrderType || filterStage) && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Filters:</span>
              {filterOrderType && (
                <Badge variant="secondary" className="gap-1">
                  Type: {filterOrderType}
                  <button onClick={() => setFilterOrderType('')} className="ml-1 hover:text-red-500">
                    <X className="size-3" />
                  </button>
                </Badge>
              )}
              {filterStage && (
                <Badge variant="secondary" className="gap-1">
                  Stage: {filterStage}
                  <button onClick={() => setFilterStage('')} className="ml-1 hover:text-red-500">
                    <X className="size-3" />
                  </button>
                </Badge>
              )}
              <button
                onClick={() => { setFilterOrderType(''); setFilterStage('') }}
                className="text-muted-foreground hover:text-zinc-700 text-xs underline"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Orders table - scrollable */}
          <div className="overflow-x-auto -mx-4 px-4">
          <div style={{ minWidth: '1400px' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 sticky left-0 bg-white z-10"></TableHead>
                  <TableHead className="whitespace-nowrap">Account Name</TableHead>
                  <TableHead className="whitespace-nowrap">Sale Type</TableHead>
                  <TableHead>
                    <div className="relative">
                      <button
                        className="flex items-center gap-1 hover:text-zinc-900 whitespace-nowrap"
                        onClick={() => { setShowOrderTypeFilter(!showOrderTypeFilter); setShowStageFilter(false) }}
                      >
                        Order Type
                        <Filter className={`size-3 ${filterOrderType ? 'text-blue-600' : ''}`} />
                      </button>
                      {showOrderTypeFilter && (
                        <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-20 min-w-32">
                          <button
                            onClick={() => { setFilterOrderType(''); setShowOrderTypeFilter(false) }}
                            className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 ${!filterOrderType ? 'font-medium text-zinc-900' : 'text-muted-foreground'}`}
                          >
                            All
                          </button>
                          {uniqueOrderTypes.map((type) => (
                            <button
                              key={type}
                              onClick={() => { setFilterOrderType(type); setShowOrderTypeFilter(false) }}
                              className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 ${filterOrderType === type ? 'font-medium text-zinc-900' : 'text-muted-foreground'}`}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">Items Ordered</TableHead>
                  <TableHead className="whitespace-nowrap">Order #</TableHead>
                  <TableHead className="whitespace-nowrap">Invoice #</TableHead>
                  <TableHead className="whitespace-nowrap">Close Date</TableHead>
                  <TableHead>
                    <div className="relative">
                      <button
                        className="flex items-center gap-1 hover:text-zinc-900 whitespace-nowrap"
                        onClick={() => { setShowStageFilter(!showStageFilter); setShowOrderTypeFilter(false) }}
                      >
                        Stage
                        <Filter className={`size-3 ${filterStage ? 'text-blue-600' : ''}`} />
                      </button>
                      {showStageFilter && (
                        <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-20 min-w-40">
                          <button
                            onClick={() => { setFilterStage(''); setShowStageFilter(false) }}
                            className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 ${!filterStage ? 'font-medium text-zinc-900' : 'text-muted-foreground'}`}
                          >
                            All
                          </button>
                          {uniqueStages.map((stage) => (
                            <button
                              key={stage}
                              onClick={() => { setFilterStage(stage); setShowStageFilter(false) }}
                              className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 ${filterStage === stage ? 'font-medium text-zinc-900' : 'text-muted-foreground'}`}
                            >
                              {stage}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Commission</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground">
                      {searchQuery || filterOrderType || filterStage
                        ? 'No orders match your search or filters.'
                        : 'No orders for this tab.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => {
                    const isHovered = hoveredRow === order.id
                    const comm = getCommission(order)
                    const hasNote = order.notes && order.notes.trim().length > 0

                    return (
                      <TableRow
                        key={order.id}
                        onMouseEnter={() => setHoveredRow(order.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        className="group"
                      >
                        <TableCell className="sticky left-0 bg-white z-10 w-10">
                          <div className={`flex gap-1 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditOrder(order)} title="Edit">
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(order.id)} title="Delete">
                              <Trash2 className="size-3.5 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{getAccountName(order.client_id)}</TableCell>
                        <TableCell className="whitespace-nowrap">{order.sale_type || 'Prebook'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {order.order_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-48 truncate">{getItems(order)}</TableCell>
                        <TableCell className="whitespace-nowrap">{order.order_number}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {order.invoice_document ? (
                            <a
                              href="#"
                              onClick={async (e) => {
                                e.preventDefault()
                                try {
                                  const url = await getDocumentUrl(order.invoice_document.path)
                                  window.open(url, '_blank')
                                } catch (err) {
                                  console.error('Failed to get document URL:', err)
                                }
                              }}
                              className="text-blue-600 underline"
                            >
                              {order.invoice_number || '—'}
                            </a>
                          ) : (
                            order.invoice_number || '—'
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{order.close_date}</TableCell>
                        <TableCell className="whitespace-nowrap">{order.stage}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{fmt(order.total)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {comm.isOverridden && (
                              <AlertTriangle className="size-3.5 text-amber-500" title={`Overridden from ${comm.defaultPct}%`} />
                            )}
                            <span className={comm.isOverridden ? 'text-amber-700 font-medium' : ''}>
                              {fmt(comm.amount)}
                            </span>
                            <span className="text-xs text-muted-foreground ml-0.5">
                              ({comm.pct}%)
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {hasNote ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openNoteModal(order)}
                              title={order.notes}
                            >
                              <StickyNote className="size-4 text-amber-500 fill-amber-100" />
                            </Button>
                          ) : (
                            <button
                              onClick={() => openNoteModal(order)}
                              className="text-xs text-muted-foreground hover:text-zinc-700 flex items-center gap-0.5 mx-auto"
                            >
                              <Plus className="size-3" />Note
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
          </div>
        </>
      )}
    </div>
  )
}

export default CompanySales
