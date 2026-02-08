import { useState, useMemo, useRef } from 'react'
import { Plus, FolderArchive, Pencil, Trash2, Check, X, ChevronDown, Search, Filter, FileText, Upload, AlertTriangle, StickyNote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { clients, companies } from '@/data/mockData'
import { useSales } from '@/context/SalesContext'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const getClientName = (clientId) => {
  const client = clients.find((c) => c.id === clientId)
  return client ? client.name : 'Unknown'
}

const getCompany = (companyId) => companies.find((c) => c.id === companyId)

const getItems = (order) => {
  if (order.orderType === 'Rental' && order.rentalItems) return order.rentalItems.join(', ')
  if (order.orderType === 'Retail' && order.retailItems) return order.retailItems.join(', ')
  return ''
}

const getCommission = (order) => {
  const company = getCompany(order.companyId)
  const defaultPct = company?.commissionPercent || 0
  const pct = order.commissionOverride != null ? order.commissionOverride : defaultPct
  const isOverridden = order.commissionOverride != null && order.commissionOverride !== defaultPct
  return { amount: order.total * pct / 100, pct, isOverridden, defaultPct }
}

function CompanySales({ companyId, addSaleOpen, setAddSaleOpen }) {
  const {
    activeSeasons, archivedSeasons, orders,
    addSeason, updateSeason, toggleArchiveSeason,
    addOrder, updateOrder, deleteOrder,
  } = useSales()

  const company = getCompany(companyId)

  const [activeTab, setActiveTab] = useState(activeSeasons[0]?.id || '')
  const [tabDialogOpen, setTabDialogOpen] = useState(false)
  const [editingTabId, setEditingTabId] = useState(null)
  const [tabForm, setTabForm] = useState({ label: '', year: '', startDate: '', endDate: '' })
  const [editingOrderId, setEditingOrderId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [hoveredRow, setHoveredRow] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOrderType, setFilterOrderType] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [showOrderTypeFilter, setShowOrderTypeFilter] = useState(false)
  const [showStageFilter, setShowStageFilter] = useState(false)

  // Add Sale dialog state
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [saleForm, setSaleForm] = useState({
    clientId: null,
    clientName: '',
    orderType: 'Rental',
    items: '',
    orderNumber: '',
    invoiceNumber: '',
    closeDate: '',
    stage: 'Closed - Won',
    documents: [],
    total: '',
    commissionOverride: '',
    notes: '',
  })
  const fileInputRef = useRef(null)

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

  // Tab dialog handlers
  const openCreateTab = () => {
    setEditingTabId(null)
    setTabForm({ label: '', year: '', startDate: '', endDate: '' })
    setTabDialogOpen(true)
  }

  const openEditTab = (season) => {
    setEditingTabId(season.id)
    setTabForm({
      label: season.label,
      year: season.year || '',
      startDate: season.startDate || '',
      endDate: season.endDate || '',
    })
    setTabDialogOpen(true)
  }

  const handleTabSubmit = (e) => {
    e.preventDefault()
    if (editingTabId) {
      updateSeason(editingTabId, {
        label: tabForm.label,
        year: tabForm.year,
        startDate: tabForm.startDate,
        endDate: tabForm.endDate,
      })
    } else {
      const newSeason = addSeason({
        label: tabForm.label,
        year: tabForm.year,
        startDate: tabForm.startDate,
        endDate: tabForm.endDate,
      })
      setActiveTab(newSeason.id)
    }
    setTabForm({ label: '', year: '', startDate: '', endDate: '' })
    setEditingTabId(null)
    setTabDialogOpen(false)
  }

  const handleArchiveFromModal = () => {
    const id = editingTabId
    toggleArchiveSeason(id)
    setTabDialogOpen(false)
    setEditingTabId(null)
    setTabForm({ label: '', year: '', startDate: '', endDate: '' })
    // If we archived the active tab, switch to first remaining active season
    if (activeTab === id) {
      const remaining = activeSeasons.filter((s) => s.id !== id)
      setActiveTab(remaining[0]?.id || '')
    }
  }

  // Add Sale — auto-set companyId
  const handleAddSale = (e) => {
    e.preventDefault()
    if (!saleForm.clientId || !currentSeason) return

    const isRental = saleForm.orderType === 'Rental'
    const items = saleForm.items.split(',').map((s) => s.trim()).filter(Boolean)
    const total = parseFloat(saleForm.total) || 0
    const commOverride = saleForm.commissionOverride.trim() !== '' ? parseFloat(saleForm.commissionOverride) : null

    addOrder({
      clientId: saleForm.clientId,
      companyId: companyId,
      seasonId: currentSeason.id,
      orderType: saleForm.orderType,
      ...(isRental ? { rentalItems: items } : { retailItems: items }),
      orderNumber: saleForm.orderNumber,
      invoiceNumber: saleForm.invoiceNumber,
      closeDate: saleForm.closeDate,
      stage: saleForm.stage,
      documents: saleForm.documents,
      total,
      commissionOverride: commOverride,
      notes: saleForm.notes,
    })

    setSaleForm({
      clientId: null, clientName: '', orderType: 'Rental',
      items: '', orderNumber: '', invoiceNumber: '', closeDate: '',
      stage: 'Closed - Won', documents: [], total: '', commissionOverride: '', notes: '',
    })
    setClientSearch('')
    setAddSaleOpen(false)
  }

  const handleDocUpload = (e) => {
    const files = Array.from(e.target.files || [])
    const names = files.map((f) => f.name)
    setSaleForm((p) => ({ ...p, documents: [...p.documents, ...names] }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Notes modal
  const openNoteModal = (order) => {
    setNoteOrderId(order.id)
    setNoteText(order.notes || '')
    setNoteModalOpen(true)
  }

  const saveNote = () => {
    if (noteOrderId) {
      updateOrder(noteOrderId, { notes: noteText })
    }
    setNoteModalOpen(false)
    setNoteOrderId(null)
    setNoteText('')
  }

  // Inline editing
  const startEdit = (order) => {
    setEditingOrderId(order.id)
    setEditForm({
      orderType: order.orderType,
      items: getItems(order),
      orderNumber: order.orderNumber,
      invoiceNumber: order.invoiceNumber || '',
      closeDate: order.closeDate,
      stage: order.stage,
      documents: (order.documents || []).join(', '),
      total: String(order.total),
      commissionOverride: order.commissionOverride != null ? String(order.commissionOverride) : '',
    })
  }

  const cancelEdit = () => {
    setEditingOrderId(null)
    setEditForm({})
  }

  const saveEdit = (orderId) => {
    const isRental = editForm.orderType === 'Rental'
    const items = editForm.items.split(',').map((s) => s.trim()).filter(Boolean)
    const docs = editForm.documents.split(',').map((s) => s.trim()).filter(Boolean)
    const commOverride = editForm.commissionOverride.trim() !== '' ? parseFloat(editForm.commissionOverride) : null

    updateOrder(orderId, {
      orderType: editForm.orderType,
      ...(isRental ? { rentalItems: items, retailItems: undefined } : { retailItems: items, rentalItems: undefined }),
      orderNumber: editForm.orderNumber,
      invoiceNumber: editForm.invoiceNumber,
      closeDate: editForm.closeDate,
      stage: editForm.stage,
      documents: docs,
      total: parseFloat(editForm.total) || 0,
      commissionOverride: commOverride,
    })
    setEditingOrderId(null)
    setEditForm({})
  }

  const handleDelete = (orderId) => {
    deleteOrder(orderId)
    if (editingOrderId === orderId) cancelEdit()
  }

  // Current season data filtered by companyId
  const seasonOrders = currentSeason
    ? orders.filter((o) => o.seasonId === currentSeason.id && o.companyId === companyId)
    : []

  const filteredOrders = useMemo(() => {
    let result = seasonOrders

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((o) => {
        const clientName = getClientName(o.clientId).toLowerCase()
        const orderNum = (o.orderNumber || '').toLowerCase()
        const invoiceNum = (o.invoiceNumber || '').toLowerCase()
        const total = String(o.total)
        return clientName.includes(q) || orderNum.includes(q) || invoiceNum.includes(q) || total.includes(q)
      })
    }

    if (filterOrderType) {
      result = result.filter((o) => o.orderType === filterOrderType)
    }

    if (filterStage) {
      result = result.filter((o) => o.stage === filterStage)
    }

    return result
  }, [seasonOrders, searchQuery, filterOrderType, filterStage])

  const uniqueOrderTypes = [...new Set(seasonOrders.map((o) => o.orderType))]
  const uniqueStages = [...new Set(seasonOrders.map((o) => o.stage))]

  const rentalTotal = filteredOrders.filter((o) => o.orderType === 'Rental').reduce((sum, o) => sum + o.total, 0)
  const retailTotal = filteredOrders.filter((o) => o.orderType === 'Retail').reduce((sum, o) => sum + o.total, 0)
  const totalSales = rentalTotal + retailTotal
  const totalCommission = filteredOrders.reduce((sum, o) => sum + getCommission(o).amount, 0)

  return (
    <div className="space-y-6 min-w-0">
      {/* Season tabs bar */}
      <div className="flex items-center gap-1 border-b overflow-x-auto">
        {activeSeasons.map((season) => (
          <div key={season.id} className="group relative">
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
              className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-200 rounded-full p-0.5"
              title="Edit tab"
            >
              <Pencil className="size-3" />
            </button>
          </div>
        ))}

        {archivedSeasons.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-zinc-700 flex items-center gap-1"
            >
              <FolderArchive className="size-3.5" />
              Archived ({archivedSeasons.length})
              <ChevronDown className={`size-3 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
            </button>
            {showArchived && (
              <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-48">
                {archivedSeasons.map((season) => (
                  <div key={season.id} className="flex items-center justify-between px-3 py-2 hover:bg-zinc-50">
                    <button
                      onClick={() => { setActiveTab(season.id); setShowArchived(false) }}
                      className="text-sm text-muted-foreground hover:text-zinc-900 flex-1 text-left"
                    >
                      {season.label}
                    </button>
                    <button
                      onClick={() => { openEditTab(season); setShowArchived(false) }}
                      className="text-muted-foreground hover:text-zinc-700 ml-2"
                      title="Edit tab"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={openCreateTab}
          className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap flex items-center gap-1"
        >
          <Plus className="size-4" /> New Sales Tracker
        </button>
      </div>

      {/* Create / Edit tab dialog */}
      <Dialog open={tabDialogOpen} onOpenChange={(open) => {
        setTabDialogOpen(open)
        if (!open) { setEditingTabId(null); setTabForm({ label: '', year: '', startDate: '', endDate: '' }) }
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
                  value={tabForm.startDate}
                  onChange={(e) => setTabForm((p) => ({ ...p, startDate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={tabForm.endDate}
                  onChange={(e) => setTabForm((p) => ({ ...p, endDate: e.target.value }))}
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

      {/* Add Sale dialog — no company selector */}
      <Dialog open={addSaleOpen} onOpenChange={setAddSaleOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Sale</DialogTitle>
            <DialogDescription>Add a new sale to {currentSeason?.label}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSale} className="space-y-4">
            {/* Account Name - searchable */}
            <div className="space-y-2">
              <Label>Account Name</Label>
              <div className="relative">
                <Input
                  placeholder="Start typing to search..."
                  value={saleForm.clientName || clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value)
                    setSaleForm((p) => ({ ...p, clientId: null, clientName: '' }))
                    setShowClientDropdown(true)
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                  required
                />
                {showClientDropdown && !saleForm.clientId && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                    {filteredClients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setSaleForm((p) => ({ ...p, clientId: client.id, clientName: client.name }))
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Order Type */}
              <div className="space-y-2">
                <Label>Order Type</Label>
                <select
                  value={saleForm.orderType}
                  onChange={(e) => setSaleForm((p) => ({ ...p, orderType: e.target.value }))}
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
                <Label>Order #</Label>
                <Input
                  value={saleForm.orderNumber}
                  onChange={(e) => setSaleForm((p) => ({ ...p, orderNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Invoice #</Label>
                <Input
                  value={saleForm.invoiceNumber}
                  onChange={(e) => setSaleForm((p) => ({ ...p, invoiceNumber: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Close Date</Label>
                <Input
                  type="date"
                  value={saleForm.closeDate}
                  onChange={(e) => setSaleForm((p) => ({ ...p, closeDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Total</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={saleForm.total}
                  onChange={(e) => setSaleForm((p) => ({ ...p, total: e.target.value }))}
                  required
                />
              </div>
            </div>

            {/* Commission Override */}
            <div className="space-y-2">
              <Label>Commission % Override</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder={company ? `Default: ${company.commissionPercent}%` : ''}
                value={saleForm.commissionOverride}
                onChange={(e) => setSaleForm((p) => ({ ...p, commissionOverride: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Leave blank to use the company default.</p>
            </div>

            {/* Documents */}
            <div className="space-y-2">
              <Label>Documents</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleDocUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4 mr-1" /> Upload
                </Button>
                {saleForm.documents.length > 0 && (
                  <span className="text-sm text-muted-foreground">{saleForm.documents.length} file(s)</span>
                )}
              </div>
              {saleForm.documents.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {saleForm.documents.map((doc, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 text-xs">
                      <FileText className="size-3" /> {doc}
                      <button
                        type="button"
                        onClick={() => setSaleForm((p) => ({ ...p, documents: p.documents.filter((_, j) => j !== i) }))}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
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
              <Button type="submit" disabled={!saleForm.clientId}>Add Sale</Button>
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
              {noteOrderId && getClientName(orders.find((o) => o.id === noteOrderId)?.clientId)}
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

          <div className="flex gap-8 text-sm flex-wrap">
            <div>
              <span className="text-muted-foreground">Rental Total:</span>{' '}
              <span className="font-semibold">{fmt(rentalTotal)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Retail Total:</span>{' '}
              <span className="font-semibold">{fmt(retailTotal)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Sales:</span>{' '}
              <span className="font-semibold">{fmt(totalSales)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Commission:</span>{' '}
              <span className="font-semibold">{fmt(totalCommission)}</span>
            </div>
          </div>

          {/* Orders table - scrollable */}
          <div className="overflow-x-auto -mx-4 px-4">
          <div style={{ minWidth: '1600px' }}>
            <Table>
              <TableHeader>
                <TableRow>
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
                  <TableHead className="whitespace-nowrap">Documents</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Commission</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Notes</TableHead>
                  <TableHead className="w-20"></TableHead>
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
                    const isEditing = editingOrderId === order.id
                    const isHovered = hoveredRow === order.id
                    const comm = getCommission(order)
                    const hasNote = order.notes && order.notes.trim().length > 0

                    if (isEditing) {
                      return (
                        <TableRow key={order.id} className="bg-blue-50/50">
                          <TableCell className="font-medium whitespace-nowrap">{getClientName(order.clientId)}</TableCell>
                          <TableCell>
                            <select
                              value={editForm.orderType}
                              onChange={(e) => setEditForm((p) => ({ ...p, orderType: e.target.value }))}
                              className="border rounded px-2 py-1 text-sm w-24"
                            >
                              <option value="Rental">Rental</option>
                              <option value="Retail">Retail</option>
                            </select>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.items}
                              onChange={(e) => setEditForm((p) => ({ ...p, items: e.target.value }))}
                              className="h-8 text-sm min-w-32"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.orderNumber}
                              onChange={(e) => setEditForm((p) => ({ ...p, orderNumber: e.target.value }))}
                              className="h-8 text-sm w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.invoiceNumber}
                              onChange={(e) => setEditForm((p) => ({ ...p, invoiceNumber: e.target.value }))}
                              className="h-8 text-sm w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.closeDate}
                              onChange={(e) => setEditForm((p) => ({ ...p, closeDate: e.target.value }))}
                              className="h-8 text-sm w-28"
                              placeholder="MM/DD/YYYY"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.stage}
                              onChange={(e) => setEditForm((p) => ({ ...p, stage: e.target.value }))}
                              className="h-8 text-sm w-32"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.documents}
                              onChange={(e) => setEditForm((p) => ({ ...p, documents: e.target.value }))}
                              className="h-8 text-sm w-24"
                              placeholder="doc1, doc2"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.total}
                              onChange={(e) => setEditForm((p) => ({ ...p, total: e.target.value }))}
                              className="h-8 text-sm w-24 text-right"
                              type="number"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.commissionOverride}
                              onChange={(e) => setEditForm((p) => ({ ...p, commissionOverride: e.target.value }))}
                              className="h-8 text-sm w-20 text-right"
                              type="number"
                              step="0.1"
                              placeholder={`${comm.defaultPct}%`}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openNoteModal(order)} title="Note">
                              <StickyNote className={`size-4 ${hasNote ? 'text-amber-500' : 'text-muted-foreground'}`} />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveEdit(order.id)} title="Save">
                                <Check className="size-4 text-green-600" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit} title="Cancel">
                                <X className="size-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    }

                    return (
                      <TableRow
                        key={order.id}
                        onMouseEnter={() => setHoveredRow(order.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        className="group"
                      >
                        <TableCell className="font-medium whitespace-nowrap">{getClientName(order.clientId)}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              order.orderType === 'Rental'
                                ? 'bg-green-100 text-green-800 border-green-200'
                                : 'bg-purple-100 text-purple-800 border-purple-200'
                            }
                          >
                            {order.orderType}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-48 truncate">{getItems(order)}</TableCell>
                        <TableCell className="whitespace-nowrap">{order.orderNumber}</TableCell>
                        <TableCell className="whitespace-nowrap">{order.invoiceNumber || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{order.closeDate}</TableCell>
                        <TableCell className="whitespace-nowrap">{order.stage}</TableCell>
                        <TableCell>
                          {order.documents && order.documents.length > 0 ? (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <FileText className="size-3.5" />
                              {order.documents.length}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openNoteModal(order)}
                            title={hasNote ? order.notes : 'Add note'}
                          >
                            <StickyNote className={`size-4 ${hasNote ? 'text-amber-500 fill-amber-100' : 'text-muted-foreground'}`} />
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className={`flex gap-1 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(order)} title="Edit">
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(order.id)} title="Delete">
                              <Trash2 className="size-3.5 text-red-500" />
                            </Button>
                          </div>
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
