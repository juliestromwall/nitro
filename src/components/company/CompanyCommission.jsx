import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { commissions, clients, companies } from '@/data/mockData'
import { useSales } from '@/context/SalesContext'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const getClientName = (clientId) => {
  const client = clients.find((c) => c.id === clientId)
  return client ? client.name : 'Unknown'
}

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
  const { activeSeasons, orders } = useSales()
  const [activeTab, setActiveTab] = useState(activeSeasons[0]?.id || '')
  const [cardFilter, setCardFilter] = useState('all') // 'all' | 'paid' | 'outstanding'

  const currentSeason = activeSeasons.find((s) => s.id === activeTab) || activeSeasons[0]
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

    // Try to find matching commission entry for this client + season
    const commEntry = commissions.find(
      (c) => c.clientId === order.clientId && c.seasonId === order.seasonId
    )

    // Default pay status based on commission data, or 'pending invoice' if no entry
    const payStatus = commEntry?.payStatus || 'pending invoice'
    const amountPaid = commEntry?.amountPaid || 0
    const paidDate = commEntry?.paidDate || null
    // For amount remaining, calculate from this order's commission
    const amountRemaining = Math.max(commissionDue - (commEntry ? (commEntry.amountPaid / commEntry.due) * commissionDue : 0), 0)

    return {
      id: order.id,
      clientId: order.clientId,
      orderNumber: order.orderNumber,
      invoiceNumber: order.invoiceNumber,
      orderTotal: order.total,
      commissionDue,
      payStatus,
      amountPaid: commEntry ? Math.min((commEntry.amountPaid / commEntry.due) * commissionDue, commissionDue) : 0,
      paidDate,
      amountRemaining,
    }
  })

  // Summary totals (always computed from all rows, not filtered)
  const totalEarned = commissionRows.reduce((sum, r) => sum + r.commissionDue, 0)
  const totalPaid = commissionRows.reduce((sum, r) => sum + r.amountPaid, 0)
  const totalOutstanding = commissionRows.reduce((sum, r) => sum + r.amountRemaining, 0)

  // Apply card filter
  const filteredRows = commissionRows.filter((row) => {
    if (cardFilter === 'paid') return row.payStatus === 'paid' || row.payStatus === 'partial'
    if (cardFilter === 'outstanding') return row.payStatus !== 'paid'
    return true // 'all'
  })

  const handleTabChange = (seasonId) => {
    setActiveTab(seasonId)
    setCardFilter('all')
  }

  return (
    <div className="space-y-6">
      {/* Season tabs - matching Sales tab style */}
      <div className="flex items-center gap-1 border-b overflow-x-auto">
        {activeSeasons.map((season) => (
          <button
            key={season.id}
            onClick={() => handleTabChange(season.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === season.id
                ? 'border-b-2 border-zinc-900 text-zinc-900'
                : 'text-muted-foreground hover:text-zinc-700'
            }`}
          >
            {season.label}
          </button>
        ))}
      </div>

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      No commission data for this season.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.id} className={rowHighlight(row.payStatus)}>
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
                    </TableRow>
                  ))
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
