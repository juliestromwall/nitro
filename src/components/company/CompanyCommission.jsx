import { useState, useMemo } from 'react'
import { FolderArchive, ChevronDown, Search, Check, X, Pencil } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
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
import { commissions, clients, companies } from '@/data/mockData'
import { useSales } from '@/context/SalesContext'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const getClientName = (clientId) => {
  const client = clients.find((c) => c.id === clientId)
  return client ? client.name : 'Unknown'
}

const payStatusOptions = [
  { value: 'paid', label: 'Paid' },
  { value: 'partial', label: 'Partial' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'invoice sent', label: 'Invoice Sent' },
  { value: 'pending invoice', label: 'Pending Invoice' },
]

const statusBadge = (status) => {
  const styles = {
    paid: 'bg-green-100 text-green-800 border-green-200',
    partial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    unpaid: 'bg-red-100 text-red-800 border-red-200',
    'invoice sent': 'bg-blue-100 text-blue-800 border-blue-200',
    'pending invoice': 'bg-zinc-100 text-zinc-700 border-zinc-200',
  }
  const labels = {
    paid: 'Paid',
    partial: 'Partial',
    unpaid: 'Unpaid',
    'invoice sent': 'Invoice Sent',
    'pending invoice': 'Pending Invoice',
  }
  return (
    <Badge className={styles[status] || 'bg-zinc-100 text-zinc-700 border-zinc-200'}>
      {labels[status] || status}
    </Badge>
  )
}

const rowHighlight = (status) => {
  if (status === 'paid') return 'bg-green-50'
  if (status === 'partial') return 'bg-yellow-50'
  return ''
}

function CompanyCommission({ companyId }) {
  const { activeSeasons, archivedSeasons, orders, updateSeason, toggleArchiveSeason } = useSales()
  const [activeTab, setActiveTab] = useState(activeSeasons[0]?.id || '')
  const [cardFilter, setCardFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  // Edit tab dialog state
  const [tabDialogOpen, setTabDialogOpen] = useState(false)
  const [editingTabId, setEditingTabId] = useState(null)
  const [tabForm, setTabForm] = useState({ label: '', year: '', startDate: '', endDate: '' })

  // Inline editing state — keyed by order id
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ payStatus: '', amountPaid: '', paidDate: '' })

  // Commission overrides — local state for pay status edits (since no backend)
  const [commissionOverrides, setCommissionOverrides] = useState({})

  const allVisibleSeasons = showArchived
    ? [...activeSeasons, ...archivedSeasons]
    : activeSeasons
  const currentSeason = allVisibleSeasons.find((s) => s.id === activeTab) || activeSeasons[0]
  const company = companies.find((c) => c.id === companyId)
  const commissionPct = company?.commissionPercent || 0

  // Get all "Closed - Won" orders for this company + season
  const closedWonOrders = currentSeason
    ? orders.filter(
        (o) => o.companyId === companyId && o.seasonId === currentSeason.id && o.stage === 'Closed - Won'
      )
    : []

  // Build commission rows from orders, joining with commission mock data for pay status
  const commissionRows = closedWonOrders.map((order) => {
    const commissionDue = order.total * (commissionPct / 100)

    // Check for local overrides first
    const override = commissionOverrides[order.id]
    if (override) {
      const amountPaid = override.amountPaid
      return {
        id: order.id,
        clientId: order.clientId,
        orderNumber: order.orderNumber,
        invoiceNumber: order.invoiceNumber,
        orderTotal: order.total,
        commissionDue,
        payStatus: override.payStatus,
        amountPaid,
        paidDate: override.paidDate,
        amountRemaining: Math.max(commissionDue - amountPaid, 0),
      }
    }

    // Fall back to mock commission data
    const commEntry = commissions.find(
      (c) => c.clientId === order.clientId && c.seasonId === order.seasonId
    )

    const payStatus = commEntry?.payStatus || 'pending invoice'
    const paidDate = commEntry?.paidDate || null
    const amountPaid = commEntry ? Math.min((commEntry.amountPaid / commEntry.due) * commissionDue, commissionDue) : 0
    const amountRemaining = Math.max(commissionDue - amountPaid, 0)

    return {
      id: order.id,
      clientId: order.clientId,
      orderNumber: order.orderNumber,
      invoiceNumber: order.invoiceNumber,
      orderTotal: order.total,
      commissionDue,
      payStatus,
      amountPaid,
      paidDate,
      amountRemaining,
    }
  })

  // Summary totals (always computed from all rows, not filtered)
  const totalEarned = commissionRows.reduce((sum, r) => sum + r.commissionDue, 0)
  const totalPaid = commissionRows.reduce((sum, r) => sum + r.amountPaid, 0)
  const totalOutstanding = commissionRows.reduce((sum, r) => sum + r.amountRemaining, 0)

  // Apply card filter + search
  const filteredRows = useMemo(() => {
    let result = commissionRows

    // Card filter
    if (cardFilter === 'paid') result = result.filter((r) => r.payStatus === 'paid' || r.payStatus === 'partial')
    if (cardFilter === 'outstanding') result = result.filter((r) => r.payStatus !== 'paid')

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((r) => {
        const clientName = getClientName(r.clientId).toLowerCase()
        const orderNum = (r.orderNumber || '').toLowerCase()
        const invoiceNum = (r.invoiceNumber || '').toLowerCase()
        const total = String(r.orderTotal)
        return clientName.includes(q) || orderNum.includes(q) || invoiceNum.includes(q) || total.includes(q)
      })
    }

    return result
  }, [commissionRows, cardFilter, searchQuery])

  const handleTabChange = (seasonId) => {
    setActiveTab(seasonId)
    setCardFilter('all')
    setSearchQuery('')
  }

  // Tab dialog handlers
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
    if (activeTab === id) {
      const remaining = activeSeasons.filter((s) => s.id !== id)
      setActiveTab(remaining[0]?.id || '')
    }
  }

  // Inline editing
  const startEdit = (row) => {
    setEditingId(row.id)
    setEditForm({
      payStatus: row.payStatus,
      amountPaid: String(row.amountPaid ? row.amountPaid.toFixed(2) : '0'),
      paidDate: row.paidDate || '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({ payStatus: '', amountPaid: '', paidDate: '' })
  }

  const saveEdit = (row) => {
    const amountPaid = parseFloat(editForm.amountPaid) || 0
    setCommissionOverrides((prev) => ({
      ...prev,
      [row.id]: {
        payStatus: editForm.payStatus,
        amountPaid,
        paidDate: editForm.paidDate || null,
      },
    }))
    setEditingId(null)
    setEditForm({ payStatus: '', amountPaid: '', paidDate: '' })
  }

  return (
    <div className="space-y-6">
      {/* Season tabs — with archive support */}
      <div className="flex items-center gap-1 border-b overflow-x-auto">
        {activeSeasons.map((season) => (
          <div key={season.id} className="group relative">
            <button
              onClick={() => handleTabChange(season.id)}
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
      </div>

      {/* Edit tab dialog */}
      <Dialog open={tabDialogOpen} onOpenChange={(open) => {
        setTabDialogOpen(open)
        if (!open) { setEditingTabId(null); setTabForm({ label: '', year: '', startDate: '', endDate: '' }) }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Commission Tracker</DialogTitle>
            <DialogDescription>Update this tracker or change its archive status.</DialogDescription>
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
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {currentSeason && (
        <>
          {/* Summary cards — clickable filters */}
          <div className="grid grid-cols-3 gap-6">
            <Card
              className={`cursor-pointer transition-shadow hover:shadow-md ${cardFilter === 'all' ? 'ring-2 ring-zinc-900' : ''}`}
              onClick={() => setCardFilter('all')}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Commission Earned</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(totalEarned)}</p>
              </CardContent>
            </Card>
            <Card
              className={`cursor-pointer transition-shadow hover:shadow-md ${cardFilter === 'paid' ? 'ring-2 ring-zinc-900' : ''}`}
              onClick={() => setCardFilter('paid')}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Commission Paid</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(totalPaid)}</p>
              </CardContent>
            </Card>
            <Card
              className={`cursor-pointer transition-shadow hover:shadow-md ${cardFilter === 'outstanding' ? 'ring-2 ring-zinc-900' : ''}`}
              onClick={() => setCardFilter('outstanding')}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Commission Outstanding</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">{fmt(totalOutstanding)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Search bar */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search account, order #, invoice #, total..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Commission table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Commission Due</TableHead>
                  <TableHead>Pay Status</TableHead>
                  <TableHead className="text-right">Amount Paid</TableHead>
                  <TableHead>Paid Date</TableHead>
                  <TableHead className="text-right">Amount Remaining</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      {searchQuery ? 'No commissions match your search.' : 'No commission data for this season.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => {
                    const isEditing = editingId === row.id

                    if (isEditing) {
                      return (
                        <TableRow key={row.id} className="bg-blue-50/50">
                          <TableCell className="font-medium whitespace-nowrap">{getClientName(row.clientId)}</TableCell>
                          <TableCell className="whitespace-nowrap">{row.orderNumber}</TableCell>
                          <TableCell className="whitespace-nowrap">{row.invoiceNumber}</TableCell>
                          <TableCell className="text-right">{fmt(row.orderTotal)}</TableCell>
                          <TableCell className="text-right">{fmt(row.commissionDue)}</TableCell>
                          <TableCell>
                            <select
                              value={editForm.payStatus}
                              onChange={(e) => setEditForm((p) => ({ ...p, payStatus: e.target.value }))}
                              className="border rounded px-2 py-1 text-sm w-36"
                            >
                              {payStatusOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.amountPaid}
                              onChange={(e) => setEditForm((p) => ({ ...p, amountPaid: e.target.value }))}
                              className="h-8 text-sm w-24 text-right"
                              type="number"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.paidDate}
                              onChange={(e) => setEditForm((p) => ({ ...p, paidDate: e.target.value }))}
                              className="h-8 text-sm w-28"
                              placeholder="MM/DD/YYYY"
                            />
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">—</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveEdit(row)} title="Save">
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
                      <TableRow key={row.id} className={`group ${rowHighlight(row.payStatus)}`}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {getClientName(row.clientId)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{row.orderNumber}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.invoiceNumber}</TableCell>
                        <TableCell className="text-right">{fmt(row.orderTotal)}</TableCell>
                        <TableCell className="text-right">{fmt(row.commissionDue)}</TableCell>
                        <TableCell>{statusBadge(row.payStatus)}</TableCell>
                        <TableCell className="text-right">{fmt(row.amountPaid)}</TableCell>
                        <TableCell>{row.paidDate || '—'}</TableCell>
                        <TableCell className="text-right">{fmt(row.amountRemaining)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(row)} title="Edit">
                              <Pencil className="size-3.5" />
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
        </>
      )}
    </div>
  )
}

export default CompanyCommission
