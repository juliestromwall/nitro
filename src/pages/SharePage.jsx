import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Search, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { supabase } from '@/lib/supabase'
import { EXCLUDED_STAGES } from '@/lib/constants'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const payStatusBadge = (status) => {
  const s = (status || '').toLowerCase()
  if (s === 'paid') return <Badge className="bg-green-100 text-green-800 border-green-200">{status}</Badge>
  if (s === 'partial') return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{status}</Badge>
  if (s === 'invoice sent') return <Badge className="bg-blue-100 text-blue-800 border-blue-200">{status}</Badge>
  if (s === 'short shipped') return <Badge className="bg-amber-100 text-amber-800 border-amber-200">{status}</Badge>
  if (s === 'unpaid') return <Badge className="bg-red-100 text-red-800 border-red-200">{status}</Badge>
  return <Badge variant="outline">{status || 'pending invoice'}</Badge>
}

const rowHighlight = (status) => {
  if (status === 'paid' || status === 'short shipped') return 'bg-green-50'
  if (status === 'partial') return 'bg-yellow-50'
  return ''
}

export default function SharePage() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [shareData, setShareData] = useState(null)

  const [activeTab, setActiveTab] = useState('all')
  const [cardFilter, setCardFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, dir: 'asc' })
  const [expandedGroups, setExpandedGroups] = useState(new Set())

  const toggleGroup = (clientId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  useEffect(() => {
    async function fetchShareData() {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('get-shared-commission', {
          body: { token },
        })
        if (fnError) throw new Error(fnError.message || 'Failed to load')
        if (!data) throw new Error('No data returned')
        if (data.error) throw new Error(data.error)
        setShareData(typeof data === 'string' ? JSON.parse(data) : data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchShareData()
  }, [token])

  // Derive data
  const company = shareData?.company
  const seasons = shareData?.seasons || []
  const allOrders = shareData?.orders || []
  const commissions = shareData?.commissions || []
  const accounts = shareData?.accounts || []

  const accountMap = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts])
  const getAccountName = (id) => accountMap[id]?.name || 'Unknown'
  const commissionPct = company?.commission_percent || 0

  const getExpectedRate = (orderType) => {
    const categoryPct = company?.category_commissions?.[orderType]
    return categoryPct != null ? categoryPct : commissionPct
  }

  const getOrderCommissionPct = (order) => {
    const expectedPct = getExpectedRate(order.order_type)
    return order.commission_override != null ? order.commission_override : expectedPct
  }

  const isAllView = activeTab === 'all'

  // Filter orders by season
  const closedWonOrders = useMemo(() => {
    if (isAllView) return allOrders.filter(o => !EXCLUDED_STAGES.includes(o.stage) && seasons.some(s => s.id === o.season_id))
    return allOrders.filter(o => o.season_id === activeTab && !EXCLUDED_STAGES.includes(o.stage))
  }, [allOrders, activeTab, isAllView, seasons])

  // Build commission rows
  const commissionRows = useMemo(() => {
    return closedWonOrders.map(order => {
      const commEntry = commissions.find(c => c.order_id === order.id)
      const pct = getOrderCommissionPct(order)
      const commissionDue = order.total * (pct / 100)

      if (commEntry) {
        const paid = commEntry.amount_paid || 0
        return {
          id: order.id, client_id: order.client_id, season_id: order.season_id,
          order_number: order.order_number, stage: order.stage, order_type: order.order_type,
          orderTotal: order.total, commissionDue, close_date: order.close_date,
          pay_status: commEntry.pay_status, amount_paid: paid,
          amount_remaining: Math.max(commissionDue - paid, 0),
        }
      }
      return {
        id: order.id, client_id: order.client_id, season_id: order.season_id,
        order_number: order.order_number, stage: order.stage, order_type: order.order_type,
        orderTotal: order.total, commissionDue, close_date: order.close_date,
        pay_status: 'pending invoice', amount_paid: 0, amount_remaining: commissionDue,
      }
    })
  }, [closedWonOrders, commissions, company])

  // Filter + search
  const filteredRows = useMemo(() => {
    let result = commissionRows
    if (cardFilter === 'paid') result = result.filter(r => r.pay_status === 'paid' || r.pay_status === 'partial' || r.pay_status === 'short shipped')
    if (cardFilter === 'outstanding') result = result.filter(r => r.pay_status !== 'paid' && r.pay_status !== 'short shipped')
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r => {
        return getAccountName(r.client_id).toLowerCase().includes(q) ||
          (r.order_number || '').toLowerCase().includes(q) ||
          String(r.orderTotal).includes(q)
      })
    }
    return result
  }, [commissionRows, cardFilter, searchQuery])

  // Group by account
  const groupedRows = useMemo(() => {
    const groupMap = new Map()
    filteredRows.forEach(row => {
      if (!groupMap.has(row.client_id)) {
        groupMap.set(row.client_id, { clientId: row.client_id, accountName: getAccountName(row.client_id), rows: [] })
      }
      groupMap.get(row.client_id).rows.push(row)
    })

    let groups = Array.from(groupMap.values()).map(group => {
      const totalOrder = group.rows.reduce((s, r) => s + r.orderTotal, 0)
      const totalCommDue = group.rows.reduce((s, r) => s + r.commissionDue, 0)
      const totalPaid = group.rows.reduce((s, r) => s + r.amount_paid, 0)
      const isShortShipped = group.rows.some(r => r.pay_status === 'short shipped')
      const totalRemaining = isShortShipped ? 0 : Math.max(Math.round((totalCommDue - totalPaid) * 100) / 100, 0)

      let aggPayStatus = 'pending invoice'
      if (isShortShipped) aggPayStatus = 'short shipped'
      else {
        const allPaid = group.rows.every(r => r.pay_status === 'paid')
        const anyPaid = group.rows.some(r => r.pay_status === 'paid' || r.pay_status === 'partial')
        const anyInvoiceSent = group.rows.some(r => r.pay_status === 'invoice sent')
        const anyUnpaid = group.rows.some(r => r.pay_status === 'unpaid')
        if (allPaid) aggPayStatus = 'paid'
        else if (anyPaid) aggPayStatus = 'partial'
        else if (anyInvoiceSent) aggPayStatus = 'invoice sent'
        else if (anyUnpaid) aggPayStatus = 'unpaid'
      }

      return { ...group, totalOrder, totalCommDue, totalPaid, totalRemaining, aggPayStatus }
    })

    if (sortConfig.key) {
      groups.sort((a, b) => {
        let av, bv
        switch (sortConfig.key) {
          case 'account': av = a.accountName; bv = b.accountName; break
          case 'total': return sortConfig.dir === 'asc' ? a.totalOrder - b.totalOrder : b.totalOrder - a.totalOrder
          case 'commission_due': return sortConfig.dir === 'asc' ? a.totalCommDue - b.totalCommDue : b.totalCommDue - a.totalCommDue
          case 'amount_paid': return sortConfig.dir === 'asc' ? a.totalPaid - b.totalPaid : b.totalPaid - a.totalPaid
          case 'amount_remaining': return sortConfig.dir === 'asc' ? a.totalRemaining - b.totalRemaining : b.totalRemaining - a.totalRemaining
          case 'pay_status': av = a.aggPayStatus; bv = b.aggPayStatus; break
          default: return 0
        }
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortConfig.dir === 'asc' ? cmp : -cmp
      })
    }

    return groups
  }, [filteredRows, sortConfig])

  // Totals
  const totalEarned = groupedRows.reduce((s, g) => s + g.totalCommDue, 0)
  const totalPaid = groupedRows.reduce((s, g) => s + g.totalPaid, 0)
  const totalOutstanding = Math.max(totalEarned - totalPaid, 0)

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
    }))
  }

  const SortIcon = ({ col }) => {
    if (sortConfig.key !== col) return <ArrowUpDown className="size-3 ml-1 inline text-muted-foreground" />
    return sortConfig.dir === 'asc'
      ? <ArrowUp className="size-3 ml-1 inline text-[#005b5b]" />
      : <ArrowDown className="size-3 ml-1 inline text-[#005b5b]" />
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="size-8 text-[#005b5b] animate-spin" />
        <p className="text-muted-foreground text-sm">Loading commission report...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <div className="text-center max-w-md">
          <img src="/repcommish-logo.png" alt="RepCommish" className="h-10 mx-auto mb-4 opacity-50" />
          <h1 className="text-xl font-bold text-zinc-900 mb-2">Link Unavailable</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          {company?.logo_path && (
            <img src={company.logo_path} alt="" className="w-10 h-10 object-contain" />
          )}
          <div>
            <h1 className="text-xl font-bold text-zinc-900">{company?.name || 'Commission Report'}</h1>
            {shareData?.shareLabel && <p className="text-sm text-muted-foreground">{shareData.shareLabel}</p>}
          </div>
          <div className="ml-auto">
            <img src="/repcommish-logo.png" alt="RepCommish" className="h-6 opacity-40" />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Season tabs */}
        {seasons.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setActiveTab('all'); setCardFilter('all'); setSearchQuery('') }}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${activeTab === 'all' ? 'bg-[#005b5b] text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}
            >
              All Commissions
            </button>
            {seasons.map(s => (
              <button
                key={s.id}
                onClick={() => { setActiveTab(s.id); setCardFilter('all'); setSearchQuery('') }}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${activeTab === s.id ? 'bg-[#005b5b] text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div
            className={`bg-white border-2 rounded-xl px-4 py-3 cursor-pointer transition-all ${cardFilter === 'all' ? 'border-[#005b5b]' : 'border-[#005b5b]/30'}`}
            onClick={() => setCardFilter('all')}
          >
            <p className="text-xs text-[#005b5b] uppercase tracking-wide">Commish Earned</p>
            <p className="text-lg font-bold text-zinc-900">{fmt(totalEarned)}</p>
          </div>
          <div
            className={`bg-white border-2 rounded-xl px-4 py-3 cursor-pointer transition-all ${cardFilter === 'paid' ? 'border-[#005b5b]' : 'border-[#005b5b]/30'}`}
            onClick={() => setCardFilter('paid')}
          >
            <p className="text-xs text-[#005b5b] uppercase tracking-wide">Commish Paid</p>
            <p className="text-lg font-bold text-zinc-900">{fmt(totalPaid)}</p>
          </div>
          <div
            className={`bg-white border-2 rounded-xl px-4 py-3 cursor-pointer transition-all ${cardFilter === 'outstanding' ? 'border-[#005b5b]' : 'border-[#005b5b]/30'}`}
            onClick={() => setCardFilter('outstanding')}
          >
            <p className="text-xs text-[#005b5b] uppercase tracking-wide">Commish Owed</p>
            <p className="text-lg font-bold text-red-600">{fmt(totalOutstanding)}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search account, order #, total..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow className="bg-[#005b5b]">
              <TableHead className="text-white cursor-pointer" onClick={() => handleSort('account')}>
                Account Name <SortIcon col="account" />
              </TableHead>
              <TableHead className="text-white text-right cursor-pointer" onClick={() => handleSort('total')}>
                Sales Total <SortIcon col="total" />
              </TableHead>
              <TableHead className="text-white text-right cursor-pointer" onClick={() => handleSort('commission_due')}>
                Commission Due <SortIcon col="commission_due" />
              </TableHead>
              <TableHead className="text-white text-center cursor-pointer" onClick={() => handleSort('pay_status')}>
                Commission Pay Status <SortIcon col="pay_status" />
              </TableHead>
              <TableHead className="text-white text-right cursor-pointer" onClick={() => handleSort('amount_paid')}>
                Commission Paid <SortIcon col="amount_paid" />
              </TableHead>
              <TableHead className="text-white text-right cursor-pointer" onClick={() => handleSort('amount_remaining')}>
                Commission Owed <SortIcon col="amount_remaining" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedRows.map(group => (
              <>
                {/* Account header row */}
                <TableRow
                  key={`group-${group.clientId}`}
                  className={`cursor-pointer hover:bg-zinc-50 ${rowHighlight(group.aggPayStatus)}`}
                  onClick={() => toggleGroup(group.clientId)}
                >
                  <TableCell className="font-bold">
                    <div className="flex items-center gap-1.5">
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${expandedGroups.has(group.clientId) ? 'rotate-180' : '-rotate-90'}`} />
                      {group.accountName}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-bold">{fmt(group.totalOrder)}</TableCell>
                  <TableCell className="text-right font-bold">{fmt(group.totalCommDue)}</TableCell>
                  <TableCell className="text-center">{payStatusBadge(group.aggPayStatus)}</TableCell>
                  <TableCell className="text-right font-bold">{fmt(group.totalPaid)}</TableCell>
                  <TableCell className={`text-right font-bold ${group.totalRemaining > 0 ? 'text-red-600' : ''}`}>
                    {fmt(group.totalRemaining)}
                  </TableCell>
                </TableRow>

                {/* Order sub-rows */}
                {expandedGroups.has(group.clientId) && group.rows.map(row => (
                  <TableRow key={row.id} className="bg-zinc-50/50">
                    <TableCell className="pl-10 text-sm text-muted-foreground">
                      {row.order_number || '—'}
                      {row.stage && <Badge variant="outline" className="ml-2 text-[10px]">{row.stage}</Badge>}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{fmt(row.orderTotal)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{fmt(row.commissionDue)}</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                  </TableRow>
                ))}
              </>
            ))}
          </TableBody>
        </Table>

        {groupedRows.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No commission data found.</p>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-4 mt-8 text-center">
        <p className="text-xs text-muted-foreground">
          Powered by <a href="https://repcommish.com" className="text-[#005b5b] hover:underline" target="_blank" rel="noopener noreferrer">REPCOMMISH</a>
        </p>
      </footer>
    </div>
  )
}
