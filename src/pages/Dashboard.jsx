import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { orders, commissions, clients } from '@/data/mockData'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const CURRENT_SEASON = 'us-2025-2026'

function Dashboard() {
  const seasonOrders = orders.filter((o) => o.seasonId === CURRENT_SEASON)
  const seasonCommissions = commissions.filter((c) => c.seasonId === CURRENT_SEASON)

  const totalSales = seasonOrders.reduce((sum, o) => sum + o.total, 0)
  const rentalSales = seasonOrders
    .filter((o) => o.orderType === 'Rental')
    .reduce((sum, o) => sum + o.total, 0)
  const retailSales = seasonOrders
    .filter((o) => o.orderType === 'Retail')
    .reduce((sum, o) => sum + o.total, 0)
  const commissionDue = seasonCommissions.reduce((sum, c) => sum + c.due, 0)
  const commissionPaid = seasonCommissions.reduce((sum, c) => sum + c.amountPaid, 0)
  const outstanding = seasonCommissions.reduce((sum, c) => sum + c.amountRemaining, 0)

  const recentOrders = [...seasonOrders]
    .sort((a, b) => new Date(b.closeDate) - new Date(a.closeDate))
    .slice(0, 10)

  const getClientName = (clientId) => {
    const client = clients.find((c) => c.id === clientId)
    return client ? client.name : 'Unknown'
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-6">
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
            <CardTitle className="text-sm text-muted-foreground">Rental Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(rentalSales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Retail Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(retailSales)}</p>
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
                <TableCell>{getClientName(order.clientId)}</TableCell>
                <TableCell>{order.orderType}</TableCell>
                <TableCell>{order.orderNumber}</TableCell>
                <TableCell>{order.closeDate}</TableCell>
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
