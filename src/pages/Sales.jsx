import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { orders, seasons, clients } from '@/data/mockData'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const getClientName = (clientId) => {
  const client = clients.find((c) => c.id === clientId)
  return client ? client.name : 'Unknown'
}

const getItems = (order) => {
  if (order.orderType === 'Rental' && order.rentalItems) {
    return order.rentalItems.join(', ')
  }
  if (order.orderType === 'Retail' && order.retailItems) {
    return order.retailItems.join(', ')
  }
  return ''
}

function Sales() {
  return (
    <div className="px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Sales</h1>

      <Tabs defaultValue="us-2025-2026">
        <TabsList>
          {seasons.map((season) => (
            <TabsTrigger key={season.id} value={season.id}>
              {season.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {seasons.map((season) => {
          const seasonOrders = orders.filter((o) => o.seasonId === season.id)
          const rentalTotal = seasonOrders
            .filter((o) => o.orderType === 'Rental')
            .reduce((sum, o) => sum + o.total, 0)
          const retailTotal = seasonOrders
            .filter((o) => o.orderType === 'Retail')
            .reduce((sum, o) => sum + o.total, 0)
          const totalSales = rentalTotal + retailTotal

          return (
            <TabsContent key={season.id} value={season.id} className="space-y-6">
              {/* Summary row */}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {seasonOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No orders for this season.
                      </TableCell>
                    </TableRow>
                  ) : (
                    seasonOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          {getClientName(order.clientId)}
                        </TableCell>
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
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}

export default Sales
