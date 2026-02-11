import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { useSales } from '@/context/SalesContext'
import { useAccounts } from '@/context/AccountContext'
import { useCompanies } from '@/context/CompanyContext'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

function Dashboard() {
  const { orders, commissions, activeSeasons } = useSales()
  const { getAccountName } = useAccounts()
  const { companies } = useCompanies()

  // Use the most recent active season as current
  const currentSeason = activeSeasons.length > 0 ? activeSeasons[activeSeasons.length - 1] : null
  const currentSeasonId = currentSeason?.id || ''

  const seasonOrders = orders.filter((o) => o.season_id === currentSeasonId && o.stage !== 'Cancelled')

  const totalSales = seasonOrders.reduce((sum, o) => sum + (o.total || 0), 0)

  // Commission totals from commissions table (joined via order)
  const seasonOrderIds = new Set(seasonOrders.map((o) => o.id))
  const seasonCommissions = commissions.filter((c) => seasonOrderIds.has(c.order_id))
  const commissionDue = seasonCommissions.reduce((sum, c) => sum + (c.commission_due || 0), 0)
  const commissionPaid = seasonCommissions.reduce((sum, c) => sum + (c.amount_paid || 0), 0)
  const outstanding = seasonCommissions.reduce((sum, c) => sum + (c.amount_remaining || 0), 0)

  const recentOrders = [...seasonOrders]
    .sort((a, b) => new Date(b.close_date) - new Date(a.close_date))
    .slice(0, 10)

  return (
    <div className="px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      {currentSeason && (
        <p className="text-sm text-muted-foreground">{currentSeason.label}</p>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(totalSales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Commission Due</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(commissionDue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Commission Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(commissionPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(outstanding)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders Table */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Recent Orders</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account Name</TableHead>
              <TableHead>Order Type</TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Close Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentOrders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{getAccountName(order.client_id)}</TableCell>
                <TableCell>{order.order_type}</TableCell>
                <TableCell>{order.order_number}</TableCell>
                <TableCell>{order.close_date}</TableCell>
                <TableCell className="text-right">{fmt(order.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export default Dashboard
