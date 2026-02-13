import { useState, useMemo, Fragment } from 'react'
import { FolderArchive, ChevronDown, Search, Check, X, Pencil, Plus, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
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

  // Payment modal state — account-level
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentGroupId, setPaymentGroupId] = useState(null)
  const [paymentStatus, setPaymentStatus] = useState('pending invoice')
  const [paymentList, setPaymentList] = useState([])

  // Collapsed/expanded groups
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const toggleGroup = (clientId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

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
        close_date: order.close_date,
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
      close_date: order.close_date,
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

  // Group filtered rows by account
  const groupedRows = useMemo(() => {
    const sorted = [...filteredRows].sort((a, b) => {
      const aName = getAccountName(a.client_id)
      const bName = getAccountName(b.client_id)
      return aName.localeCompare(bName, undefined, { numeric: true })
    })

    const groupMap = new Map()
    sorted.forEach((row) => {
      const key = row.client_id
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          clientId: key,
          accountName: getAccountName(key),
          rows: [],
        })
      }
      groupMap.get(key).rows.push(row)
    })

    return Array.from(groupMap.values()).map((group) => {
      const totalOrder = group.rows.reduce((sum, r) => sum + r.orderTotal, 0)
      const totalCommDue = group.rows.reduce((sum, r) => sum + r.commissionDue, 0)
      const totalPaid = group.rows.reduce((sum, r) => sum + r.amount_paid, 0)
      const totalRemaining = group.rows.reduce((sum, r) => sum + r.amount_remaining, 0)
      const allInvoices = group.rows.flatMap((r) => r.invoices || [])
      const invoicedTotal = allInvoices.reduce((sum, inv) => {
        const amt = typeof inv.amount === 'number' ? inv.amount : (inv.amount ? parseInt(String(inv.amount).replace(/\D/g, ''), 10) / 100 : 0)
        return sum + amt
      }, 0)

      // Aggregate pay status
      const allPaid = group.rows.every(r => r.pay_status === 'paid')
      const anyPaidOrPartial = group.rows.some(r => r.pay_status === 'paid' || r.pay_status === 'partial')
      const anyInvoiceSent = group.rows.some(r => r.pay_status === 'invoice sent')
      let aggPayStatus = 'pending invoice'
      if (allPaid) aggPayStatus = 'paid'
      else if (anyPaidOrPartial) aggPayStatus = 'partial'
      else if (anyInvoiceSent) aggPayStatus = 'invoice sent'

      const paidDates = group.rows.filter(r => r.paid_date).map(r => r.paid_date).sort()
      const latestPaidDate = paidDates.length > 0 ? paidDates[paidDates.length - 1] : null

      return {
        ...group,
        totalOrder,
        totalCommDue,
        totalPaid,
        totalRemaining,
        aggPayStatus,
        latestPaidDate,
        allInvoices,
        invoicedTotal,
        pending: totalOrder - invoicedTotal,
      }
    })
  }, [filteredRows])

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

  // Payment modal handlers — account-level
  const openPaymentModal = (group) => {
    setPaymentGroupId(group.clientId)
    setPaymentStatus(group.aggPayStatus)
    // Load existing payments from first order's commission record
    const firstRow = group.rows[0]
    const commEntry = commissions.find(c => c.order_id === firstRow.orderId)
    const storedPayments = commEntry?.payments || []

    if (storedPayments.length > 0) {
      setPaymentList(storedPayments.map(p => ({
        amount: floatToCents(p.amount),
        date: p.date || '',
      })))
    } else {
      // Fallback: collect from per-order commission records
      const existing = group.rows
        .filter(r => r.amount_paid > 0)
        .map(r => ({
          amount: floatToCents(r.amount_paid),
          date: r.paid_date || '',
        }))
      // If no existing payments, start with one empty row
      setPaymentList(existing.length > 0 ? existing : [{ amount: '', date: '' }])
    }
    setPaymentModalOpen(true)
  }

  const addPayment = () => {
    setPaymentList(prev => [...prev, { amount: '', date: '' }])
  }

  const updatePayment = (index, field, value) => {
    setPaymentList(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const removePayment = (index) => {
    setPaymentList(prev => prev.filter((_, i) => i !== index))
  }

  const savePayments = async () => {
    const group = groupedRows.find(g => g.clientId === paymentGroupId)
    if (!group) return

    const payments = paymentList
      .filter(p => p.amount)
      .map(p => ({
        amount: centsToFloat(p.amount),
        date: p.date || null,
      }))

    const totalPaidAmt = payments.reduce((sum, p) => sum + p.amount, 0)
    const latestDate = payments
      .filter(p => p.date)
      .map(p => p.date)
      .sort()
      .pop() || null

    // Determine auto pay status based on payments
    let status = paymentStatus
    if (totalPaidAmt >= group.totalCommDue && group.totalCommDue > 0) {
      status = 'paid'
    } else if (totalPaidAmt > 0 && totalPaidAmt < group.totalCommDue) {
      status = 'partial'
    }

    // Save all payment data on first order's commission
    const firstRow = group.rows[0]
    try {
      await upsertCommission({
        order_id: firstRow.orderId,
        commission_due: firstRow.commissionDue,
        pay_status: status,
        amount_paid: totalPaidAmt,
        paid_date: latestDate,
        amount_remaining: Math.max(group.totalCommDue - totalPaidAmt, 0),
        payments,
      })
    } catch (err) {
      // Fallback if payments column doesn't exist yet
      console.error('Saving with payments failed, retrying without:', err)
      await upsertCommission({
        order_id: firstRow.orderId,
        commission_due: firstRow.commissionDue,
        pay_status: status,
        amount_paid: totalPaidAmt,
        paid_date: latestDate,
        amount_remaining: Math.max(group.totalCommDue - totalPaidAmt, 0),
      })
    }

    // Set same status on other orders, clear their individual payment data
    for (let i = 1; i < group.rows.length; i++) {
      const row = group.rows[i]
      await upsertCommission({
        order_id: row.orderId,
        commission_due: row.commissionDue,
        pay_status: status,
        amount_paid: 0,
        paid_date: null,
        amount_remaining: row.commissionDue,
      })
    }

    setPaymentModalOpen(false)
    setPaymentGroupId(null)
    setPaymentList([])
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
                {groupedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      {searchQuery ? 'No commissions match your search.' : 'No commission data for this season.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedRows.map((group) => (
                    <Fragment key={`group-${group.clientId}`}>
                      {/* Group header row — shows all aggregated column data */}
                      <TableRow className="bg-zinc-100 border-t-2 hover:bg-zinc-200 cursor-pointer" onClick={() => toggleGroup(group.clientId)}>
                        <TableCell className="w-10"></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-900">{group.accountName}</span>
                            <Badge variant="secondary" className="text-xs">{group.rows.length} order{group.rows.length !== 1 ? 's' : ''}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right"><span className="font-bold">{fmt(group.totalOrder)}</span></TableCell>
                        <TableCell className="text-right"><span className="font-bold">{fmt(group.totalCommDue)}</span></TableCell>
                        <TableCell>{statusBadge(group.aggPayStatus)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-bold">{fmt(group.totalPaid)}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); openPaymentModal(group) }}
                              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5 whitespace-nowrap"
                            >
                              <Plus className="size-3" /> Payment
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>{group.latestPaidDate ? fmtDate(group.latestPaidDate) : '—'}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-bold ${group.totalRemaining > 0 ? 'text-red-600' : ''}`}>{fmt(group.totalRemaining)}</span>
                        </TableCell>
                      </TableRow>

                      {/* Sub-rows — collapsed by default, show order #, date, amount only */}
                      {expandedGroups.has(group.clientId) && group.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="w-10"></TableCell>
                          <TableCell className="pl-8 text-muted-foreground">{row.order_number || '—'}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{fmt(row.orderTotal)}</TableCell>
                          <TableCell className="text-muted-foreground">{row.close_date ? fmtDate(row.close_date) : '—'}</TableCell>
                          <TableCell colSpan={4}></TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>

          {/* Payment modal — account-level */}
          <Dialog open={paymentModalOpen} onOpenChange={(open) => {
            if (!open) { setPaymentModalOpen(false); setPaymentGroupId(null); setPaymentList([]) }
          }}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Manage Payments</DialogTitle>
                <DialogDescription>
                  {paymentGroupId && getAccountName(paymentGroupId)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Pay Status */}
                <div className="space-y-2">
                  <Label>Pay Status</Label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    {payStatusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Summary */}
                {paymentGroupId && (() => {
                  const group = groupedRows.find(g => g.clientId === paymentGroupId)
                  if (!group) return null
                  const totalPaidNow = paymentList.reduce((sum, p) => {
                    const digits = String(p.amount).replace(/\D/g, '')
                    return sum + (digits ? parseInt(digits, 10) / 100 : 0)
                  }, 0)
                  const remaining = group.totalCommDue - totalPaidNow
                  return (
                    <div className="bg-zinc-50 rounded-lg p-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Commission Due:</span>
                        <span className="font-bold">{fmt(group.totalCommDue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Paid:</span>
                        <span className="font-bold text-green-700">{fmt(totalPaidNow)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1">
                        <span className="text-muted-foreground">Remaining:</span>
                        <span className={`font-bold ${remaining > 0 ? 'text-red-600' : ''}`}>{fmt(remaining)}</span>
                      </div>
                    </div>
                  )
                })()}

                {/* Payment list */}
                {paymentList.length > 0 && (
                  <div className="space-y-2">
                    <Label>Payments</Label>
                    {paymentList.map((payment, idx) => (
                      <div key={idx} className="flex items-center gap-2 border rounded-md p-2 bg-white">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center border rounded-md px-2 h-8 focus-within:ring-2 focus-within:ring-ring">
                            <span className="text-xs text-muted-foreground select-none">$</span>
                            <input
                              inputMode="numeric"
                              placeholder="0.00"
                              value={payment.amount ? centsToDisplay(String(payment.amount)) : ''}
                              onChange={(e) => {
                                const digits = e.target.value.replace(/\D/g, '')
                                updatePayment(idx, 'amount', digits || '')
                              }}
                              className="flex-1 text-sm bg-transparent outline-none ml-1"
                            />
                          </div>
                          <Input
                            type="date"
                            value={payment.date}
                            onChange={(e) => updatePayment(idx, 'date', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removePayment(idx)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addPayment}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <Plus className="size-4" /> Add Payment
                </button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setPaymentModalOpen(false); setPaymentGroupId(null); setPaymentList([]) }}>
                  Cancel
                </Button>
                <Button onClick={savePayments}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}

export default CompanyCommission
