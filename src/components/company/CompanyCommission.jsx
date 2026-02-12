import { useState, useMemo } from 'react'
import { FolderArchive, ChevronDown, Search, Check, X, Pencil, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
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
import { useAccounts } from '@/context/AccountContext'
import { useCompanies } from '@/context/CompanyContext'
import { useSales } from '@/context/SalesContext'
import { getDocumentUrl } from '@/lib/db'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

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

const stickyBg = (status) => {
  if (status === 'paid') return 'bg-green-50'
  if (status === 'partial') return 'bg-yellow-50'
  return 'bg-white'
}

const fmtDate = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d)) return dateStr
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

const centsToDisplay = (raw) => {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const cents = parseInt(digits, 10)
  const dollars = (cents / 100).toFixed(2)
  const [whole, dec] = dollars.split('.')
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${withCommas}.${dec}`
}

const centsToFloat = (raw) => {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 0
  return parseInt(digits, 10) / 100
}

const floatToCents = (val) => {
  const num = parseFloat(val)
  if (isNaN(num)) return ''
  return String(Math.round(num * 100))
}

const getInvoices = (order) => {
  if (order.invoices && order.invoices.length > 0) return order.invoices
  if (order.invoice_number) {
    const nums = order.invoice_number.split(',').map((s) => s.trim()).filter(Boolean)
    return nums.map((num, i) => ({
      number: num,
      amount: 0,
      document: i === 0 ? order.invoice_document || null : null,
    }))
  }
  return []
}

const SortIcon = ({ column, sortConfig }) => {
  if (sortConfig.key !== column) return <ArrowUpDown className="size-3 opacity-40" />
  return sortConfig.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
}

function CompanyCommission({ companyId }) {
  const { getAccountName } = useAccounts()
  const { companies } = useCompanies()
  const { activeSeasons, archivedSeasons, orders, commissions, updateSeason, toggleArchiveSeason, upsertCommission, updateCommission } = useSales()

  const [activeTab, setActiveTab] = useState(activeSeasons[0]?.id || '')
  const [cardFilter, setCardFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [sortConfig, setSortConfig] = useState({ key: null, dir: 'asc' })

  // Edit tab dialog state
  const [tabDialogOpen, setTabDialogOpen] = useState(false)
  const [editingTabId, setEditingTabId] = useState(null)
  const [tabForm, setTabForm] = useState({ label: '', year: '', start_date: '', end_date: '' })

  // Inline editing state — keyed by order id
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ payStatus: '', amountPaid: '', paidDate: '' })
  const [hoveredRow, setHoveredRow] = useState(null)

  const allVisibleSeasons = showArchived
    ? [...activeSeasons, ...archivedSeasons]
    : activeSeasons
  const currentSeason = allVisibleSeasons.find((s) => s.id === activeTab) || activeSeasons[0]
  const company = companies.find((c) => c.id === companyId)
  const commissionPct = company?.commission_percent || 0

  // Get all non-cancelled orders for this company + season (includes Partially Shipped & Short Shipped)
  const closedWonOrders = currentSeason
    ? orders.filter(
        (o) => o.company_id === companyId && o.season_id === currentSeason.id && o.stage !== 'Cancelled'
      )
    : []

  // Build commission rows from orders, looking up commissions by order_id
  const commissionRows = closedWonOrders.map((order) => {
    const commEntry = commissions.find((c) => c.order_id === order.id)

    if (commEntry) {
      return {
        id: order.id,
        orderId: order.id,
        client_id: order.client_id,
        order_number: order.order_number,
        order_document: order.order_document,
        invoices: getInvoices(order),
        orderTotal: order.total,
        commissionDue: commEntry.commission_due,
        pay_status: commEntry.pay_status,
        amount_paid: commEntry.amount_paid,
        paid_date: commEntry.paid_date,
        amount_remaining: commEntry.amount_remaining,
      }
    }

    // No commission record yet — calculate defaults
    const commissionDue = order.total * (commissionPct / 100)
    return {
      id: order.id,
      orderId: order.id,
      client_id: order.client_id,
      order_number: order.order_number,
      order_document: order.order_document,
      invoices: getInvoices(order),
      orderTotal: order.total,
      commissionDue,
      pay_status: 'pending invoice',
      amount_paid: 0,
      paid_date: null,
      amount_remaining: commissionDue,
    }
  })

  // Summary totals (always computed from all rows, not filtered)
  const totalEarned = commissionRows.reduce((sum, r) => sum + r.commissionDue, 0)
  const totalPaid = commissionRows.reduce((sum, r) => sum + r.amount_paid, 0)
  const totalOutstanding = commissionRows.reduce((sum, r) => sum + r.amount_remaining, 0)

  // Apply card filter + search
  const filteredRows = useMemo(() => {
    let result = commissionRows

    // Card filter
    if (cardFilter === 'paid') result = result.filter((r) => r.pay_status === 'paid' || r.pay_status === 'partial')
    if (cardFilter === 'outstanding') result = result.filter((r) => r.pay_status !== 'paid')

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((r) => {
        const clientName = getAccountName(r.client_id).toLowerCase()
        const orderNum = (r.order_number || '').toLowerCase()
        const invoiceNums = (r.invoices || []).map((inv) => (inv.number || '').toLowerCase()).join(' ')
        const total = String(r.orderTotal)
        return clientName.includes(q) || orderNum.includes(q) || invoiceNums.includes(q) || total.includes(q)
      })
    }

    if (sortConfig.key) {
      result = [...result].sort((a, b) => {
        let av, bv
        switch (sortConfig.key) {
          case 'account': av = getAccountName(a.client_id); bv = getAccountName(b.client_id); break
          case 'order_number': av = a.order_number || ''; bv = b.order_number || ''; break
          case 'invoice_number': av = (a.invoices || []).map((inv) => inv.number).join(', '); bv = (b.invoices || []).map((inv) => inv.number).join(', '); break
          case 'total': return sortConfig.dir === 'asc' ? a.orderTotal - b.orderTotal : b.orderTotal - a.orderTotal
          case 'commission_due': return sortConfig.dir === 'asc' ? a.commissionDue - b.commissionDue : b.commissionDue - a.commissionDue
          case 'pay_status': av = a.pay_status || ''; bv = b.pay_status || ''; break
          case 'amount_paid': return sortConfig.dir === 'asc' ? a.amount_paid - b.amount_paid : b.amount_paid - a.amount_paid
          case 'paid_date': av = a.paid_date || ''; bv = b.paid_date || ''; break
          case 'amount_remaining': return sortConfig.dir === 'asc' ? a.amount_remaining - b.amount_remaining : b.amount_remaining - a.amount_remaining
          default: return 0
        }
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortConfig.dir === 'asc' ? cmp : -cmp
      })
    }

    return result
  }, [commissionRows, cardFilter, searchQuery, sortConfig])

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

  // Inline editing
  const startEdit = (row) => {
    setEditingId(row.id)
    setEditForm({
      payStatus: row.pay_status,
      amountPaid: floatToCents(row.amount_paid),
      paidDate: row.paid_date || '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({ payStatus: '', amountPaid: '', paidDate: '' })
  }

  const saveEdit = async (row) => {
    const paid = centsToFloat(editForm.amountPaid)
    await upsertCommission({
      order_id: row.orderId,
      commission_due: row.commissionDue,
      pay_status: editForm.payStatus,
      amount_paid: paid,
      paid_date: editForm.paidDate || null,
      amount_remaining: Math.max(row.commissionDue - paid, 0),
    })
    setEditingId(null)
    setEditForm({ payStatus: '', amountPaid: '', paidDate: '' })
  }

  const toggleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
  }

  return (
    <div className="space-y-6">
      {/* Season tabs — with archive support */}
      <div className="flex items-center gap-1 border-b">
        <div className="flex items-center gap-1 overflow-x-auto min-w-0 flex-1">
          {activeSeasons.map((season) => (
            <div key={season.id} className="group flex items-center">
              <button
                onClick={() => handleTabChange(season.id)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === season.id
                    ? 'border-b-2 border-[#005b5b] text-[#005b5b]'
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
      </div>

      {/* Edit tab dialog */}
      <Dialog open={tabDialogOpen} onOpenChange={(open) => {
        setTabDialogOpen(open)
        if (!open) { setEditingTabId(null); setTabForm({ label: '', year: '', start_date: '', end_date: '' }) }
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
                    className={isArchived ? 'bg-[#005b5b] hover:bg-[#007a7a] mr-auto' : 'mr-auto'}
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

          {/* Sticky search bar */}
          <div className="sticky top-[123px] z-20 bg-background pb-2 pt-1 border-b border-zinc-100">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search account, order #, invoice #, total..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Commission table */}
            <Table>
              <TableHeader className="sticky top-[165px] z-[15]">
                <TableRow className="bg-[#005b5b] hover:bg-[#005b5b]">
                  <TableHead className="w-10 sticky left-0 bg-[#005b5b] z-[16]"></TableHead>
                  <TableHead className="text-white cursor-pointer select-none" onClick={() => toggleSort('account')}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Account Name <SortIcon column="account" sortConfig={sortConfig} /></span>
                  </TableHead>
                  <TableHead className="text-white cursor-pointer select-none" onClick={() => toggleSort('order_number')}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Order # <SortIcon column="order_number" sortConfig={sortConfig} /></span>
                  </TableHead>
                  <TableHead className="text-white cursor-pointer select-none" onClick={() => toggleSort('invoice_number')}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Invoice # <SortIcon column="invoice_number" sortConfig={sortConfig} /></span>
                  </TableHead>
                  <TableHead className="text-white text-right cursor-pointer select-none" onClick={() => toggleSort('total')}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap">Total <SortIcon column="total" sortConfig={sortConfig} /></span>
                  </TableHead>
                  <TableHead className="text-white text-right cursor-pointer select-none" onClick={() => toggleSort('commission_due')}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap">Commission Due <SortIcon column="commission_due" sortConfig={sortConfig} /></span>
                  </TableHead>
                  <TableHead className="text-white cursor-pointer select-none" onClick={() => toggleSort('pay_status')}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Pay Status <SortIcon column="pay_status" sortConfig={sortConfig} /></span>
                  </TableHead>
                  <TableHead className="text-white text-right cursor-pointer select-none" onClick={() => toggleSort('amount_paid')}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap">Amount Paid <SortIcon column="amount_paid" sortConfig={sortConfig} /></span>
                  </TableHead>
                  <TableHead className="text-white cursor-pointer select-none" onClick={() => toggleSort('paid_date')}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Paid Date <SortIcon column="paid_date" sortConfig={sortConfig} /></span>
                  </TableHead>
                  <TableHead className="text-white text-right cursor-pointer select-none" onClick={() => toggleSort('amount_remaining')}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap">Amount Remaining <SortIcon column="amount_remaining" sortConfig={sortConfig} /></span>
                  </TableHead>
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
                    const isHovered = hoveredRow === row.id

                    if (isEditing) {
                      return (
                        <TableRow key={row.id} className="bg-blue-50/50">
                          <TableCell className="sticky left-0 bg-blue-50 z-[5] w-10">
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveEdit(row)} title="Save">
                                <Check className="size-4 text-green-600" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit} title="Cancel">
                                <X className="size-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{getAccountName(row.client_id)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              {(row.order_number || '').split(',').map((num) => num.trim()).filter(Boolean).map((num, i) => (
                                <span key={i} className="text-sm whitespace-nowrap">{num}</span>
                              ))}
                              {!row.order_number && '—'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              {(row.invoices || []).length > 0 ? row.invoices.map((inv, i) => (
                                <span key={i} className="text-sm whitespace-nowrap">{inv.number || '—'}</span>
                              )) : '—'}
                            </div>
                          </TableCell>
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
                            <div className="relative w-28">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                              <Input
                                value={centsToDisplay(editForm.amountPaid)}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^0-9]/g, '')
                                  setEditForm((p) => ({ ...p, amountPaid: raw }))
                                }}
                                className="h-8 text-sm text-right pl-5"
                                inputMode="numeric"
                              />
                            </div>
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
                        </TableRow>
                      )
                    }

                    return (
                      <TableRow
                        key={row.id}
                        className={`group ${rowHighlight(row.pay_status)}`}
                        onMouseEnter={() => setHoveredRow(row.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                      >
                        <TableCell className={`sticky left-0 z-[5] w-10 ${stickyBg(row.pay_status)}`}>
                          <div className={`flex gap-1 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(row)} title="Edit">
                              <Pencil className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          {getAccountName(row.client_id)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            {(row.order_number || '').split(',').map((num) => num.trim()).filter(Boolean).map((num, i) => (
                              row.order_document ? (
                                <a
                                  key={i}
                                  href="#"
                                  onClick={async (e) => {
                                    e.preventDefault()
                                    try {
                                      const url = await getDocumentUrl(row.order_document.path)
                                      window.open(url, '_blank')
                                    } catch (err) {
                                      console.error('Failed to get document URL:', err)
                                    }
                                  }}
                                  className="text-blue-600 underline text-sm whitespace-nowrap"
                                >
                                  {num}
                                </a>
                              ) : (
                                <span key={i} className="text-sm whitespace-nowrap">{num}</span>
                              )
                            ))}
                            {!row.order_number && '—'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const invoices = row.invoices || []
                            if (invoices.length === 0) return '—'
                            const fmt2 = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
                            const invoicedTotal = invoices.reduce((sum, inv) => {
                              const amt = typeof inv.amount === 'number' ? inv.amount : (inv.amount ? parseInt(String(inv.amount).replace(/\D/g, ''), 10) / 100 : 0)
                              return sum + amt
                            }, 0)
                            const pending = row.orderTotal - invoicedTotal
                            return (
                              <div className="flex flex-col gap-0.5">
                                {invoices.map((inv, i) => {
                                  const amt = typeof inv.amount === 'number' ? inv.amount : (inv.amount ? parseInt(String(inv.amount).replace(/\D/g, ''), 10) / 100 : 0)
                                  const label = `${inv.number || '—'}${amt > 0 ? ` (${fmt2(amt)})` : ''}`
                                  return inv.document ? (
                                    <a
                                      key={i}
                                      href="#"
                                      onClick={async (e) => {
                                        e.preventDefault()
                                        try {
                                          const url = await getDocumentUrl(inv.document.path)
                                          window.open(url, '_blank')
                                        } catch (err) {
                                          console.error('Failed to get document URL:', err)
                                        }
                                      }}
                                      className="text-blue-600 underline text-sm whitespace-nowrap"
                                    >
                                      {label}
                                    </a>
                                  ) : (
                                    <span key={i} className="text-sm whitespace-nowrap">{label}</span>
                                  )
                                })}
                                {pending > 0 && (
                                  <span className="text-xs text-amber-600 font-medium whitespace-nowrap">
                                    Pending: {fmt(pending)}
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-right">{fmt(row.orderTotal)}</TableCell>
                        <TableCell className="text-right">{fmt(row.commissionDue)}</TableCell>
                        <TableCell>{statusBadge(row.pay_status)}</TableCell>
                        <TableCell className="text-right">{fmt(row.amount_paid)}</TableCell>
                        <TableCell>{row.paid_date ? fmtDate(row.paid_date) : '—'}</TableCell>
                        <TableCell className="text-right">{fmt(row.amount_remaining)}</TableCell>
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

export default CompanyCommission
