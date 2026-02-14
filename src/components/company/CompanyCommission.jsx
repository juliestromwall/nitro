import { useState, useMemo, Fragment } from 'react'
import { FolderArchive, ChevronDown, Search, Check, X, Pencil, Plus, Trash2, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react'
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
import { EXCLUDED_STAGES } from '@/lib/constants'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const payStatusOptions = [
  { value: 'paid', label: 'Paid' },
  { value: 'partial', label: 'Partial' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'invoice sent', label: 'Invoice Sent' },
  { value: 'pending invoice', label: 'Pending Invoice' },
  { value: 'short shipped', label: 'Short Shipped' },
]

const rowHighlight = (status) => {
  if (status === 'paid') return 'bg-green-50'
  if (status === 'short shipped') return 'bg-green-50'
  if (status === 'partial') return 'bg-yellow-50'
  return ''
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
  const { activeSeasons, archivedSeasons, orders, commissions, updateSeason, toggleArchiveSeason, upsertCommission, updateCommission, updateOrder } = useSales()

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

  // Short Shipped confirmation state
  const [shortShipConfirmOpen, setShortShipConfirmOpen] = useState(false)
  const [shortShipOrderId, setShortShipOrderId] = useState(null)
  const [shortShipPrevStage, setShortShipPrevStage] = useState('')
  // Account-level short ship confirmation
  const [shortShipAccountConfirmOpen, setShortShipAccountConfirmOpen] = useState(false)
  const [shortShipAccountGroupId, setShortShipAccountGroupId] = useState(null)

  // Collapsed/expanded groups — collapsed by default
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

  const getExpectedRate = (orderType) => {
    const categoryPct = company?.category_commissions?.[orderType]
    return categoryPct != null ? categoryPct : commissionPct
  }

  // Get all non-cancelled orders for this company + season
  const closedWonOrders = currentSeason
    ? orders.filter(
        (o) => o.company_id === companyId && o.season_id === currentSeason.id && o.stage !== 'Cancelled'
      )
    : []

  // Build commission rows from orders
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
        stage: order.stage,
        order_type: order.order_type,
        invoices: getInvoices(order),
        orderTotal: order.total,
        commissionDue: commEntry.commission_due,
        pay_status: commEntry.pay_status,
        amount_paid: commEntry.amount_paid,
        paid_date: commEntry.paid_date,
        amount_remaining: commEntry.amount_remaining,
      }
    }

    const orderPct = getExpectedRate(order.order_type)
    const commissionDue = order.total * (orderPct / 100)
    return {
      id: order.id,
      orderId: order.id,
      client_id: order.client_id,
      order_number: order.order_number,
      order_document: order.order_document,
      close_date: order.close_date,
      stage: order.stage,
      order_type: order.order_type,
      invoices: getInvoices(order),
      orderTotal: order.total,
      commissionDue,
      pay_status: 'pending invoice',
      amount_paid: 0,
      paid_date: null,
      amount_remaining: commissionDue,
    }
  })

  // Apply card filter + search
  const filteredRows = useMemo(() => {
    let result = commissionRows

    if (cardFilter === 'paid') result = result.filter((r) => r.pay_status === 'paid' || r.pay_status === 'partial' || r.pay_status === 'short shipped')
    if (cardFilter === 'outstanding') result = result.filter((r) => r.pay_status !== 'paid' && r.pay_status !== 'short shipped')

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
    const groupMap = new Map()
    filteredRows.forEach((row) => {
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

    let groups = Array.from(groupMap.values()).map((group) => {
      // Full totals from ALL orders (not excluding Short Shipped stages)
      const totalOrder = group.rows.reduce((sum, r) => sum + r.orderTotal, 0)
      const totalCommDue = group.rows.reduce((sum, r) => sum + r.commissionDue, 0)
      const totalPaid = group.rows.reduce((sum, r) => sum + r.amount_paid, 0)
      const totalRemaining = group.rows.some(r => r.pay_status === 'short shipped')
        ? 0
        : Math.max(totalCommDue - totalPaid, 0)

      const allInvoices = group.rows.flatMap((r) => r.invoices || [])
      const invoicedTotal = allInvoices.reduce((sum, inv) => {
        const amt = typeof inv.amount === 'number' ? inv.amount : (inv.amount ? parseInt(String(inv.amount).replace(/\D/g, ''), 10) / 100 : 0)
        return sum + amt
      }, 0)

      // Aggregate pay status — check if any row has 'short shipped'
      const anyShortShipped = group.rows.some(r => r.pay_status === 'short shipped')
      let aggPayStatus = 'pending invoice'
      if (anyShortShipped) {
        aggPayStatus = 'short shipped'
      } else {
        const allPaid = group.rows.every(r => r.pay_status === 'paid')
        const anyPaidOrPartial = group.rows.some(r => r.pay_status === 'paid' || r.pay_status === 'partial')
        const anyInvoiceSent = group.rows.some(r => r.pay_status === 'invoice sent')
        const anyUnpaid = group.rows.some(r => r.pay_status === 'unpaid')
        if (allPaid) aggPayStatus = 'paid'
        else if (anyPaidOrPartial) aggPayStatus = 'partial'
        else if (anyInvoiceSent) aggPayStatus = 'invoice sent'
        else if (anyUnpaid) aggPayStatus = 'unpaid'
      }

      const paidDates = group.rows.filter(r => r.paid_date).map(r => r.paid_date).sort()
      const latestPaidDate = paidDates.length > 0 ? paidDates[paidDates.length - 1] : null

      // Account-level short ship: calculate unshipped sales from commission gap
      const isShortShipped = aggPayStatus === 'short shipped'
      let unshippedSales = 0
      let adjustedSale = totalOrder
      let adjustedCommission = totalCommDue
      if (isShortShipped && totalPaid < totalCommDue) {
        const commissionGap = totalCommDue - totalPaid
        // Use weighted average commission rate to back-calculate unshipped sales
        const avgPct = totalOrder > 0 ? (totalCommDue / totalOrder) * 100 : 0
        unshippedSales = avgPct > 0 ? commissionGap / (avgPct / 100) : 0
        adjustedSale = totalOrder - unshippedSales
        adjustedCommission = totalPaid
      }

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
        isShortShipped,
        unshippedSales,
        adjustedSale,
        adjustedCommission,
      }
    })

    // Sort groups based on sortConfig
    if (sortConfig.key) {
      groups.sort((a, b) => {
        switch (sortConfig.key) {
          case 'account': {
            const cmp = a.accountName.localeCompare(b.accountName, undefined, { numeric: true })
            return sortConfig.dir === 'asc' ? cmp : -cmp
          }
          case 'total':
            return sortConfig.dir === 'asc' ? a.totalOrder - b.totalOrder : b.totalOrder - a.totalOrder
          case 'commission_due':
            return sortConfig.dir === 'asc' ? a.totalCommDue - b.totalCommDue : b.totalCommDue - a.totalCommDue
          case 'pay_status': {
            const cmp = a.aggPayStatus.localeCompare(b.aggPayStatus)
            return sortConfig.dir === 'asc' ? cmp : -cmp
          }
          case 'amount_paid':
            return sortConfig.dir === 'asc' ? a.totalPaid - b.totalPaid : b.totalPaid - a.totalPaid
          case 'paid_date': {
            const av = a.latestPaidDate || ''
            const bv = b.latestPaidDate || ''
            const cmp = av.localeCompare(bv)
            return sortConfig.dir === 'asc' ? cmp : -cmp
          }
          case 'amount_remaining':
            return sortConfig.dir === 'asc' ? a.totalRemaining - b.totalRemaining : b.totalRemaining - a.totalRemaining
          default: return 0
        }
      })
    } else {
      groups.sort((a, b) => a.accountName.localeCompare(b.accountName, undefined, { numeric: true }))
    }

    return groups
  }, [filteredRows, sortConfig])

  // Summary totals — use adjusted values for short shipped accounts
  const totalEarned = useMemo(() => {
    return groupedRows.reduce((sum, g) => sum + (g.isShortShipped ? g.adjustedCommission : g.totalCommDue), 0)
  }, [groupedRows])
  const totalPaid = useMemo(() => {
    return groupedRows.reduce((sum, g) => sum + g.totalPaid, 0)
  }, [groupedRows])
  const totalOutstanding = Math.max(totalEarned - totalPaid, 0)

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
    const firstRow = group.rows[0]
    const commEntry = commissions.find(c => c.order_id === firstRow.orderId)
    const storedPayments = commEntry?.payments || []

    if (storedPayments.length > 0) {
      setPaymentList(storedPayments.map(p => ({
        amount: floatToCents(p.amount),
        date: p.date || '',
      })))
    } else {
      const existing = group.rows
        .filter(r => r.amount_paid > 0)
        .map(r => ({
          amount: floatToCents(r.amount_paid),
          date: r.paid_date || '',
        }))
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

    // Use the manually selected status — only auto-calculate if not explicitly set
    let status = paymentStatus
    if (status !== 'short shipped') {
      if (totalPaidAmt >= group.totalCommDue && group.totalCommDue > 0) {
        status = 'paid'
      } else if (totalPaidAmt > 0 && totalPaidAmt < group.totalCommDue) {
        status = 'partial'
      }
    }

    const groupRemaining = Math.max(group.totalCommDue - totalPaidAmt, 0)

    // Save all payment data on first order's commission
    const firstRow = group.rows[0]
    try {
      await upsertCommission({
        order_id: firstRow.orderId,
        commission_due: firstRow.commissionDue,
        pay_status: status,
        amount_paid: totalPaidAmt,
        paid_date: latestDate,
        amount_remaining: groupRemaining,
        payments,
      })
    } catch (err) {
      console.error('Saving with payments failed, retrying without:', err)
      await upsertCommission({
        order_id: firstRow.orderId,
        commission_due: firstRow.commissionDue,
        pay_status: status,
        amount_paid: totalPaidAmt,
        paid_date: latestDate,
        amount_remaining: groupRemaining,
      })
    }

    // Set same status on other orders — amount_paid=0 but same status
    for (let i = 1; i < group.rows.length; i++) {
      const row = group.rows[i]
      await upsertCommission({
        order_id: row.orderId,
        commission_due: row.commissionDue,
        pay_status: status,
        amount_paid: 0,
        paid_date: null,
        amount_remaining: 0,
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

  // Inline pay status change — saves immediately for all orders in group
  const handleInlinePayStatus = async (group, newStatus) => {
    // If changing to short shipped, show confirmation
    if (newStatus === 'short shipped') {
      setShortShipAccountGroupId(group.clientId)
      setShortShipAccountConfirmOpen(true)
      return
    }
    for (const row of group.rows) {
      await upsertCommission({
        order_id: row.orderId,
        commission_due: row.commissionDue,
        pay_status: newStatus,
        amount_paid: row.amount_paid,
        paid_date: row.paid_date,
        amount_remaining: Math.max(row.commissionDue - row.amount_paid, 0),
      })
    }
  }

  // Confirm account-level short ship from inline dropdown
  const confirmAccountShortShip = async () => {
    const group = groupedRows.find(g => g.clientId === shortShipAccountGroupId)
    if (!group) return
    for (const row of group.rows) {
      await upsertCommission({
        order_id: row.orderId,
        commission_due: row.commissionDue,
        pay_status: 'short shipped',
        amount_paid: row.amount_paid,
        paid_date: row.paid_date,
        amount_remaining: Math.max(row.commissionDue - row.amount_paid, 0),
      })
    }
    setShortShipAccountConfirmOpen(false)
    setShortShipAccountGroupId(null)
  }

  // Stage change handler for individual orders (from payment modal)
  const handleOrderStageChange = async (orderId, newStage, currentStage) => {
    if (newStage === 'Short Shipped') {
      setShortShipOrderId(orderId)
      setShortShipPrevStage(currentStage)
      setShortShipConfirmOpen(true)
    } else {
      await updateOrder(orderId, { stage: newStage })
    }
  }

  const confirmShortShip = async () => {
    if (shortShipOrderId) {
      await updateOrder(shortShipOrderId, { stage: 'Short Shipped' })
    }
    setShortShipConfirmOpen(false)
    setShortShipOrderId(null)
    setShortShipPrevStage('')
  }

  const cancelShortShip = () => {
    setShortShipConfirmOpen(false)
    setShortShipOrderId(null)
    setShortShipPrevStage('')
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
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap">Remaining <SortIcon column="amount_remaining" sortConfig={sortConfig} /></span>
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
                      {/* Group header row */}
                      <TableRow
                        className={`border-t-2 cursor-pointer ${
                          group.aggPayStatus === 'paid' || group.aggPayStatus === 'short shipped'
                            ? 'bg-green-50 hover:bg-green-100'
                            : group.aggPayStatus === 'partial'
                              ? 'bg-yellow-50 hover:bg-yellow-100'
                              : 'bg-zinc-100 hover:bg-zinc-200'
                        }`}
                        onClick={() => toggleGroup(group.clientId)}
                      >
                        <TableCell className="w-10"></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-900">{group.accountName}</span>
                            <Badge variant="secondary" className="text-xs">{group.rows.length} order{group.rows.length !== 1 ? 's' : ''}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-bold">{fmt(group.totalOrder)}</span>
                          {group.isShortShipped && group.unshippedSales > 0 && (
                            <div className="text-xs text-purple-600 font-medium">Updated: {fmt(group.adjustedSale)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-bold">{fmt(group.totalCommDue)}</span>
                          {group.isShortShipped && group.unshippedSales > 0 && (
                            <div className="text-xs text-purple-600 font-medium">Updated: {fmt(group.adjustedCommission)}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <select
                            value={group.aggPayStatus}
                            onChange={(e) => handleInlinePayStatus(group, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className={`text-xs font-medium rounded-md px-2 py-1 border cursor-pointer ${
                              group.aggPayStatus === 'paid' ? 'bg-green-100 text-green-800 border-green-200' :
                              group.aggPayStatus === 'partial' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                              group.aggPayStatus === 'unpaid' ? 'bg-red-100 text-red-800 border-red-200' :
                              group.aggPayStatus === 'invoice sent' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                              group.aggPayStatus === 'short shipped' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                              'bg-zinc-100 text-zinc-700 border-zinc-200'
                            }`}
                          >
                            {payStatusOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </TableCell>
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
                          {group.isShortShipped && group.unshippedSales > 0 && (
                            <div className="text-xs text-purple-600 font-medium">{fmt(group.unshippedSales)} did not ship</div>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Sub-rows — collapsed by default */}
                      {expandedGroups.has(group.clientId) && group.rows.map((row) => {
                        const isExcluded = EXCLUDED_STAGES.includes(row.stage)
                        return (
                          <TableRow key={row.id} className={isExcluded ? 'bg-purple-50' : ''}>
                            <TableCell className="w-10"></TableCell>
                            <TableCell className="pl-8">
                              <div className="flex items-center gap-2">
                                <span className={isExcluded ? 'text-purple-600' : 'text-muted-foreground'}>{row.order_number || '—'}</span>
                                {row.stage && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    row.stage === 'Short Shipped' ? 'bg-purple-100 text-purple-700' :
                                    row.stage === 'Partially Shipped' ? 'bg-amber-100 text-amber-700' :
                                    'bg-zinc-100 text-zinc-500'
                                  }`}>
                                    {row.stage}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className={`text-right ${isExcluded ? 'text-purple-600' : 'text-muted-foreground'}`}>
                              {fmt(row.orderTotal)}
                            </TableCell>
                            <TableCell className={`text-right ${isExcluded ? 'text-purple-600' : 'text-muted-foreground'}`}>
                              {fmt(row.commissionDue)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">{row.close_date ? fmtDate(row.close_date) : '—'}</TableCell>
                            <TableCell colSpan={3}></TableCell>
                          </TableRow>
                        )
                      })}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>

          {/* Short Shipped confirmation dialog — individual order */}
          <Dialog open={shortShipConfirmOpen} onOpenChange={(open) => { if (!open) cancelShortShip() }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Confirm Short Shipped</DialogTitle>
                <DialogDescription>
                  Are you sure there are no more items to ship on this order? The order total will be excluded from total sales and commission due.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={cancelShortShip}>Cancel</Button>
                <Button variant="destructive" onClick={confirmShortShip}>
                  Confirm Short Shipped
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Short Shipped confirmation dialog — account-level */}
          <Dialog open={shortShipAccountConfirmOpen} onOpenChange={(open) => {
            if (!open) { setShortShipAccountConfirmOpen(false); setShortShipAccountGroupId(null) }
          }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Mark Account as Short Shipped</DialogTitle>
                <DialogDescription>
                  This marks the account's commission as final. The system will calculate the unshipped sales amount based on the remaining commission gap and deduct it from your totals.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShortShipAccountConfirmOpen(false); setShortShipAccountGroupId(null) }}>
                  Cancel
                </Button>
                <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={confirmAccountShortShip}>
                  Confirm Short Shipped
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                  const isShortShipStatus = paymentStatus === 'short shipped'
                  const avgPct = group.totalOrder > 0 ? (group.totalCommDue / group.totalOrder) * 100 : 0
                  const unshippedCalc = isShortShipStatus && remaining > 0 && avgPct > 0
                    ? remaining / (avgPct / 100)
                    : 0
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
                      {isShortShipStatus && unshippedCalc > 0 && (
                        <div className="border-t pt-2 mt-2 space-y-1">
                          <div className="flex justify-between text-purple-600">
                            <span className="font-medium">Sales that did not ship:</span>
                            <span className="font-bold">{fmt(unshippedCalc)}</span>
                          </div>
                          <div className="flex justify-between text-purple-600">
                            <span className="font-medium">Updated Sale:</span>
                            <span className="font-bold">{fmt(group.totalOrder - unshippedCalc)}</span>
                          </div>
                          <div className="flex justify-between text-purple-600">
                            <span className="font-medium">Updated Commission:</span>
                            <span className="font-bold">{fmt(totalPaidNow)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Order stages — update shipment status */}
                {paymentGroupId && (() => {
                  const group = groupedRows.find(g => g.clientId === paymentGroupId)
                  if (!group || group.rows.length === 0) return null
                  return (
                    <div className="space-y-2">
                      <Label>Order Shipment Status</Label>
                      <div className="space-y-1.5">
                        {group.rows.map((row) => (
                          <div key={row.id} className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${
                            EXCLUDED_STAGES.includes(row.stage) ? 'bg-purple-50 border border-purple-200' : 'bg-zinc-50 border'
                          }`}>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{row.order_number || '—'}</span>
                              <span className="text-muted-foreground ml-2">{fmt(row.orderTotal)}</span>
                            </div>
                            <select
                              value={row.stage}
                              onChange={(e) => handleOrderStageChange(row.orderId, e.target.value, row.stage)}
                              className={`text-xs rounded-md px-2 py-1 border cursor-pointer ${
                                row.stage === 'Short Shipped' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                row.stage === 'Partially Shipped' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                'bg-white border-zinc-200'
                              }`}
                            >
                              <option value={row.stage}>{row.stage}</option>
                              {row.stage !== 'Partially Shipped' && <option value="Partially Shipped">Partially Shipped</option>}
                              {row.stage !== 'Short Shipped' && <option value="Short Shipped">Short Shipped</option>}
                            </select>
                          </div>
                        ))}
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
