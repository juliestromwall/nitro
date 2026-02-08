import { useState } from 'react'
import { Plus, Archive, ArchiveRestore, Pencil, Trash2, Check, X, ChevronDown } from 'lucide-react'
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
import { clients } from '@/data/mockData'
import { useSales } from '@/context/SalesContext'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const getClientName = (clientId) => {
  const client = clients.find((c) => c.id === clientId)
  return client ? client.name : 'Unknown'
}

const getItems = (order) => {
  if (order.orderType === 'Rental' && order.rentalItems) return order.rentalItems.join(', ')
  if (order.orderType === 'Retail' && order.retailItems) return order.retailItems.join(', ')
  return ''
}

function Sales() {
  const {
    activeSeasons, archivedSeasons, orders,
    addSeason, toggleArchiveSeason,
    updateOrder, deleteOrder,
  } = useSales()

  const [activeTab, setActiveTab] = useState(activeSeasons[0]?.id || '')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [tabForm, setTabForm] = useState({ label: '', year: '', startDate: '', endDate: '' })
  const [editingOrderId, setEditingOrderId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [hoveredRow, setHoveredRow] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  // Ensure activeTab is valid
  const allVisibleSeasons = showArchived
    ? [...activeSeasons, ...archivedSeasons]
    : activeSeasons
  const currentSeason = allVisibleSeasons.find((s) => s.id === activeTab) || activeSeasons[0]

  // Add tab dialog
  const handleAddTab = (e) => {
    e.preventDefault()
    const newSeason = addSeason({
      label: tabForm.label,
      year: tabForm.year,
      startDate: tabForm.startDate,
      endDate: tabForm.endDate,
    })
    setActiveTab(newSeason.id)
    setTabForm({ label: '', year: '', startDate: '', endDate: '' })
    setAddDialogOpen(false)
  }

  // Inline editing
  const startEdit = (order) => {
    setEditingOrderId(order.id)
    setEditForm({
      orderType: order.orderType,
      items: getItems(order),
      orderNumber: order.orderNumber,
      closeDate: order.closeDate,
      stage: order.stage,
      total: String(order.total),
    })
  }

  const cancelEdit = () => {
    setEditingOrderId(null)
    setEditForm({})
  }

  const saveEdit = (orderId) => {
    const isRental = editForm.orderType === 'Rental'
    const items = editForm.items.split(',').map((s) => s.trim()).filter(Boolean)
    updateOrder(orderId, {
      orderType: editForm.orderType,
      ...(isRental ? { rentalItems: items, retailItems: undefined } : { retailItems: items, rentalItems: undefined }),
      orderNumber: editForm.orderNumber,
      closeDate: editForm.closeDate,
      stage: editForm.stage,
      total: parseFloat(editForm.total) || 0,
    })
    setEditingOrderId(null)
    setEditForm({})
  }

  const handleDelete = (orderId) => {
    deleteOrder(orderId)
    if (editingOrderId === orderId) cancelEdit()
  }

  // Current season data
  const seasonOrders = currentSeason
    ? orders.filter((o) => o.seasonId === currentSeason.id)
    : []
  const rentalTotal = seasonOrders.filter((o) => o.orderType === 'Rental').reduce((sum, o) => sum + o.total, 0)
  const retailTotal = seasonOrders.filter((o) => o.orderType === 'Retail').reduce((sum, o) => sum + o.total, 0)
  const totalSales = rentalTotal + retailTotal

  return (
    <div className="px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Sales</h1>

      {/* Tabs bar */}
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
            {activeTab === season.id && (
              <button
                onClick={() => toggleArchiveSeason(season.id)}
                className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-200 rounded-full p-0.5"
                title="Archive tab"
              >
                <Archive className="size-3" />
              </button>
            )}
          </div>
        ))}

        {/* Archived tabs dropdown */}
        {archivedSeasons.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-zinc-700 flex items-center gap-1"
            >
              Archived ({archivedSeasons.length})
              <ChevronDown className={`size-3 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
            </button>
            {showArchived && (
              <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-48">
                {archivedSeasons.map((season) => (
                  <div key={season.id} className="flex items-center justify-between px-3 py-2 hover:bg-zinc-50">
                    <button
                      onClick={() => { setActiveTab(season.id); setShowArchived(false) }}
                      className="text-sm text-muted-foreground hover:text-zinc-900"
                    >
                      {season.label}
                    </button>
                    <button
                      onClick={() => toggleArchiveSeason(season.id)}
                      className="text-muted-foreground hover:text-zinc-700"
                      title="Restore tab"
                    >
                      <ArchiveRestore className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setAddDialogOpen(true)}
          className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap flex items-center gap-1"
        >
          <Plus className="size-4" /> Add Tab
        </button>
      </div>

      {/* Add tab dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Sales Tab</DialogTitle>
            <DialogDescription>Create a new tab to track sales for a specific period.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddTab} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tabLabel">Tab Name</Label>
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
            <DialogFooter>
              <Button type="submit">Create Tab</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Summary row */}
      {currentSeason && (
        <>
          <div className="flex gap-8 text-sm">
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
          </div>

          {/* Orders table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account Name</TableHead>
                <TableHead>Order Type</TableHead>
                <TableHead>Items Ordered</TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Close Date</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {seasonOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No orders for this tab.
                  </TableCell>
                </TableRow>
              ) : (
                seasonOrders.map((order) => {
                  const isEditing = editingOrderId === order.id
                  const isHovered = hoveredRow === order.id

                  if (isEditing) {
                    return (
                      <TableRow key={order.id} className="bg-blue-50/50">
                        <TableCell className="font-medium">{getClientName(order.clientId)}</TableCell>
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
                            className="h-8 text-sm"
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
                            value={editForm.total}
                            onChange={(e) => setEditForm((p) => ({ ...p, total: e.target.value }))}
                            className="h-8 text-sm w-24 text-right"
                            type="number"
                            step="0.01"
                          />
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
                      <TableCell className="font-medium">{getClientName(order.clientId)}</TableCell>
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
                      <TableCell className="max-w-xs truncate">{getItems(order)}</TableCell>
                      <TableCell>{order.orderNumber}</TableCell>
                      <TableCell>{order.closeDate}</TableCell>
                      <TableCell>{order.stage}</TableCell>
                      <TableCell className="text-right">{fmt(order.total)}</TableCell>
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
        </>
      )}
    </div>
  )
}

export default Sales
