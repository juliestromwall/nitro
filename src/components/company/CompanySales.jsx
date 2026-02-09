import { useState, useMemo, useRef } from 'react'
import { Plus, FolderArchive, Pencil, Trash2, Check, X, ChevronDown, Search, Filter, FileText, Upload, AlertTriangle, StickyNote } from 'lucide-react'
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
import { useClients } from '@/context/ClientContext'
import { useCompanies } from '@/context/CompanyContext'
import { useAuth } from '@/context/AuthContext'
import { uploadDocument, getDocumentUrl } from '@/lib/db'
import { useSales } from '@/context/SalesContext'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const getItems = (order) => {
  if (order.order_type === 'Rental' && order.rental_items) return order.rental_items.join(', ')
  if (order.order_type === 'Retail' && order.retail_items) return order.retail_items.join(', ')
  return ''
}

// Strip non-numeric chars except decimal point
const sanitizeCurrency = (val) => val.replace(/[^0-9.]/g, '')
const formatToTwoDecimals = (val) => {
  const num = parseFloat(val)
  return isNaN(num) ? '' : num.toFixed(2)
}

function CompanySales({ companyId, addSaleOpen, setAddSaleOpen }) {
  const { clients, getClientName } = useClients()
  const { companies } = useCompanies()
  const { user } = useAuth()

  const {
    activeSeasons, archivedSeasons, orders,
    addSeason, updateSeason, toggleArchiveSeason,
    addOrder, updateOrder, deleteOrder,
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
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [saleForm, setSaleForm] = useState({
    client_id: null,
    clientName: '',
    order_type: 'Rental',
    items: '',
    order_number: '',
    invoice_number: '',
    close_date: '',
    stage: 'Closed - Won',
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

  // Ensure activeTab is valid
  const allVisibleSeasons = showArchived
    ? [...activeSeasons, ...archivedSeasons]
    : activeSeasons
  const currentSeason = allVisibleSeasons.find((s) => s.id === activeTab) || activeSeasons[0]

  // Filtered clients for searchable dropdown
  const filteredClients = clientSearch.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase())).slice(0, 10)
    : clients.slice(0, 10)

  // Whether the sale dialog is in "edit" vs "add" mode
  const isEditMode = editingOrderId !== null
  const saleDialogOpen = addSaleOpen || isEditMode

  const closeSaleDialog = () => {
    setAddSaleOpen(false)
    setEditingOrderId(null)
    resetSaleForm()
  }

  const resetSaleForm = () => {
    setSaleForm({
      client_id: null, clientName: '', order_type: 'Rental',
      items: '', order_number: '', invoice_number: '', close_date: '',
      stage: 'Closed - Won', order_document: null, invoice_document: null, total: '', commission_override: '', notes: '',
    })
    setClientSearch('')
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
    setSaleForm({
      client_id: order.client_id,
      clientName: getClientName(order.client_id),
      order_type: order.order_type,
      items: getItems(order),
      order_number: order.order_number,
      invoice_number: order.invoice_number || '',
      close_date: order.close_date,
      stage: order.stage,
      order_document: order.order_document || null,
      invoice_document: order.invoice_document || null,
      total: String(order.total),
      commission_override: order.commission_override != null ? String(order.commission_override) : '',
      notes: order.notes || '',
    })
  }

  // Add or Edit Sale submit
  const handleSaleSubmit = async (e) => {
    e.preventDefault()
    if (!saleForm.client_id || !currentSeason) return

    const isRental = saleForm.order_type === 'Rental'
    const items = saleForm.items.split(',').map((s) => s.trim()).filter(Boolean)
    const total = parseFloat(saleForm.total) || 0
    const commOverride = saleForm.commission_override.trim() !== '' ? parseFloat(saleForm.commission_override) : null

    const orderData = {
      client_id: saleForm.client_id,
      company_id: companyId,
      season_id: currentSeason.id,
      order_type: saleForm.order_type,
      ...(isRental ? { rental_items: items, retail_items: undefined } : { retail_items: items, rental_items: undefined }),
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

    if (isEditMode) {
      await updateOrder(editingOrderId, orderData)
    } else {
      await addOrder(orderData)
    }

    closeSaleDialog()
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

  // Current season data filtered by companyId
  const seasonOrders = currentSeason
    ? orders.filter((o) => o.season_id === currentSeason.id && o.company_id === companyId)
    : []

  const filteredOrders = useMemo(() => {
    let result = seasonOrders

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((o) => {
        const clientName = getClientName(o.client_id).toLowerCase()
        const orderNum = (o.order_number || '').toLowerCase()
        const invoiceNum = (o.invoice_number || '').toLowerCase()
        const total = String(o.total)
        return clientName.includes(q) || orderNum.includes(q) || invoiceNum.includes(q) || total.includes(q)
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

  // Compute totals from seasonOrders (unfiltered) so card values stay constant
  const rentalTotal = seasonOrders.filter((o) => o.order_type === 'Rental').reduce((sum, o) => sum + o.total, 0)
  const retailTotal = seasonOrders.filter((o) => o.order_type === 'Retail').reduce((sum, o) => sum + o.total, 0)
  const totalSales = rentalTotal + retailTotal
  const totalCommission = seasonOrders.reduce((sum, o) => sum + getCommission(o).amount, 0)

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

      {/* Add / Edit Sale dialog */}
      <Dialog open={saleDialogOpen} onOpenChange={(open) => { if (!open) closeSaleDialog() }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Sale' : 'Add Sale'}</DialogTitle>
            <DialogDescription>
              {isEditMode
                ? `Editing sale for ${saleForm.clientName}.`
                : `Add a new sale to ${currentSeason?.label}.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaleSubmit} className="space-y-4">
            {/* Account Name - searchable (disabled in edit mode) */}
            <div className="space-y-2">
              <Label>Account Name</Label>
              {isEditMode ? (
                <Input value={saleForm.clientName} disabled />
              ) : (
                <div className="relative">
                  <Input
                    placeholder="Start typing to search..."
                    value={saleForm.clientName || clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value)
                      setSaleForm((p) => ({ ...p, client_id: null, clientName: '' }))
                      setShowClientDropdown(true)
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                    required
                  />
                  {showClientDropdown && !saleForm.client_id && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                      {filteredClients.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => {
                            setSaleForm((p) => ({ ...p, client_id: client.id, clientName: client.name }))
                            setClientSearch('')
                            setShowClientDropdown(false)
                          }}
                          className="block w-full text-left px-3 py-2 text-sm hover:bg-zinc-50"
                        >
                          <span className="font-medium">{client.name}</span>
                          <span className="text-muted-foreground ml-2">{client.city}, {client.state}</span>
                        </button>
                      ))}
                      {filteredClients.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No clients found</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Order Type */}
              <div className="space-y-2">
                <Label>Order Type</Label>
                <select
                  value={saleForm.order_type}
                  onChange={(e) => setSaleForm((p) => ({ ...p, order_type: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="Rental">Rental</option>
                  <option value="Retail">Retail</option>
                </select>
              </div>

              {/* Stage */}
              <div className="space-y-2">
                <Label>Stage</Label>
                <select
                  value={saleForm.stage}
                  onChange={(e) => setSaleForm((p) => ({ ...p, stage: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="Closed - Won">Closed - Won</option>
                  <option value="Closed - Lost">Closed - Lost</option>
                  <option value="Negotiation">Negotiation</option>
                  <option value="Proposal">Proposal</option>
                  <option value="Prospecting">Prospecting</option>
                </select>
              </div>
            </div>

            {/* Items Ordered */}
            <div className="space-y-2">
              <Label>Items Ordered</Label>
              <Input
                placeholder="e.g. Rental Upgraded Boards, Rental Boots"
                value={saleForm.items}
                onChange={(e) => setSaleForm((p) => ({ ...p, items: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Invoice #</Label>
                  <input ref={invoiceDocRef} type="file" onChange={handleInvoiceDocUpload} className="hidden" />
                  {saleForm.invoice_document ? (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <FileText className="size-3" /> {saleForm.invoice_document.name}
                      <button type="button" onClick={() => setSaleForm((p) => ({ ...p, invoice_document: null }))}>
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ) : (
                    <button
                      type="button"
                      onClick={() => invoiceDocRef.current?.click()}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                    >
                      <Upload className="size-3" /> Upload Doc
                    </button>
                  )}
                </div>
                <Input
                  value={saleForm.invoice_number}
                  onChange={(e) => setSaleForm((p) => ({ ...p, invoice_number: e.target.value }))}
                />
              </div>
            </div>

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
                <Label>Total</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={saleForm.total}
                    onChange={(e) => setSaleForm((p) => ({ ...p, total: sanitizeCurrency(e.target.value) }))}
                    onBlur={(e) => setSaleForm((p) => ({ ...p, total: formatToTwoDecimals(p.total) }))}
                    className="pl-7"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Commission Override */}
            <div className="space-y-2">
              <Label>Commission % Override</Label>
              <div className="relative">
                <Input
                  inputMode="decimal"
                  placeholder={company ? `Default: ${company.commission_percent}` : ''}
                  value={saleForm.commission_override}
                  onChange={(e) => setSaleForm((p) => ({ ...p, commission_override: sanitizeCurrency(e.target.value) }))}
                  className="no-spinner pr-7"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">Leave blank to use the company default.</p>
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

            <DialogFooter>
              <Button type="submit" disabled={!saleForm.client_id}>
                {isEditMode ? 'Save Changes' : 'Add Sale'}
              </Button>
            </DialogFooter>
          </form>
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
              {noteOrderId && getClientName(orders.find((o) => o.id === noteOrderId)?.client_id)}
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

      {/* Search and summary */}
      {currentSeason && (
        <>
          {/* Summary cards — clickable filters */}
          <div className="grid grid-cols-4 gap-6">
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
            <Card
              className={`cursor-pointer transition-shadow hover:shadow-md ${filterOrderType === 'Rental' ? 'ring-2 ring-zinc-900' : ''}`}
              onClick={() => setFilterOrderType(filterOrderType === 'Rental' ? '' : 'Rental')}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Rental Total</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(rentalTotal)}</p>
              </CardContent>
            </Card>
            <Card
              className={`cursor-pointer transition-shadow hover:shadow-md ${filterOrderType === 'Retail' ? 'ring-2 ring-zinc-900' : ''}`}
              onClick={() => setFilterOrderType(filterOrderType === 'Retail' ? '' : 'Retail')}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Retail Total</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(retailTotal)}</p>
              </CardContent>
            </Card>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Commission</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(totalCommission)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search account, order #, invoice #, total..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
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
                    <TableCell colSpan={11} className="text-center text-muted-foreground">
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
                        <TableCell className="font-medium whitespace-nowrap">{getClientName(order.client_id)}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              order.order_type === 'Rental'
                                ? 'bg-green-100 text-green-800 border-green-200'
                                : 'bg-purple-100 text-purple-800 border-purple-200'
                            }
                          >
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
