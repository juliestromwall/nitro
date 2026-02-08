import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { commissions, clients } from '@/data/mockData'
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
  }
  const labels = {
    paid: 'Paid',
    partial: 'Partial',
    unpaid: 'Unpaid',
  }
  return (
    <Badge className={styles[status] || ''}>
      {labels[status] || status}
    </Badge>
  )
}

function CompanyCommission({ companyId }) {
  const { activeSeasons, orders } = useSales()
  const [activeTab, setActiveTab] = useState(activeSeasons[0]?.id || '')

  const currentSeason = activeSeasons.find((s) => s.id === activeTab) || activeSeasons[0]

  // Find clientIds that have orders for this company
  const companyClientIds = [...new Set(orders.filter((o) => o.companyId === companyId).map((o) => o.clientId))]

  // Filter commissions by season and by clients that have orders with this company
  const seasonCommissions = currentSeason
    ? commissions
        .filter((c) => c.seasonId === currentSeason.id && companyClientIds.includes(c.clientId))
        .sort((a, b) => b.amountRemaining - a.amountRemaining)
    : []

  const totalDue = seasonCommissions.reduce((sum, c) => sum + c.due, 0)
  const totalPaid = seasonCommissions.reduce((sum, c) => sum + c.amountPaid, 0)
  const outstandingTotal = seasonCommissions.reduce((sum, c) => sum + c.amountRemaining, 0)

  return (
    <div className="space-y-6">
      {/* Season tabs - matching Sales tab style */}
      <div className="flex items-center gap-1 border-b overflow-x-auto">
        {activeSeasons.map((season) => (
          <button
            key={season.id}
            onClick={() => setActiveTab(season.id)}
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
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Due</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(totalDue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Paid</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(totalPaid)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(outstandingTotal)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Commission table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account Name</TableHead>
                <TableHead className="text-right">Due $</TableHead>
                <TableHead>Pay Status</TableHead>
                <TableHead className="text-right">Amount Paid</TableHead>
                <TableHead>Paid Date</TableHead>
                <TableHead className="text-right">Amount Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {seasonCommissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No commission data for this season.
                  </TableCell>
                </TableRow>
              ) : (
                seasonCommissions.map((comm) => (
                  <TableRow key={comm.id}>
                    <TableCell className="font-medium">
                      {getClientName(comm.clientId)}
                    </TableCell>
                    <TableCell className="text-right">{fmt(comm.due)}</TableCell>
                    <TableCell>{statusBadge(comm.payStatus)}</TableCell>
                    <TableCell className="text-right">{fmt(comm.amountPaid)}</TableCell>
                    <TableCell>{comm.paidDate || '-'}</TableCell>
                    <TableCell className="text-right">{fmt(comm.amountRemaining)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  )
}

export default CompanyCommission
