import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { orders, commissions, clients, seasons } from '@/data/mockData'
import { useCompanies } from '@/context/CompanyContext'

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)

function CompanyDetail() {
  const { id } = useParams()
  const { companies } = useCompanies()
  const company = companies.find((c) => c.id === parseInt(id))

  if (!company) {
    return (
      <div className="px-6 py-8">
        <p>Company not found.</p>
        <Link to="/companies" className="text-blue-600 underline">Back to Companies</Link>
      </div>
    )
  }

  const companyOrders = orders.filter((o) => o.companyId === company.id)
  const totalSales = companyOrders.reduce((sum, o) => sum + o.total, 0)
  const commissionDue = totalSales * (company.commissionPercent / 100)

  // Commission records for this company's clients
  const companyClientIds = [...new Set(companyOrders.map((o) => o.clientId))]
  const companyCommissions = commissions.filter((c) => companyClientIds.includes(c.clientId))
  const totalPaid = companyCommissions.reduce((sum, c) => sum + c.amountPaid, 0)
  const totalRemaining = commissionDue - totalPaid

  // Orders by season
  const ordersBySeasons = seasons
    .map((season) => {
      const seasonOrders = companyOrders.filter((o) => o.seasonId === season.id)
      const seasonTotal = seasonOrders.reduce((sum, o) => sum + o.total, 0)
      return { season, orders: seasonOrders, total: seasonTotal }
    })
    .filter((s) => s.orders.length > 0)

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/companies" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-3">
          {company.logo ? (
            <img src={company.logo} alt="" className="w-8 h-8 object-contain" />
          ) : (
            <div className="w-8 h-8 rounded bg-zinc-200 flex items-center justify-center text-zinc-600 text-sm font-bold">
              {company.name.charAt(0)}
            </div>
          )}
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <Badge variant="outline">{company.commissionPercent}% Commission</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(totalSales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Commission Due</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(commissionDue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Commission Paid</CardTitle>
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
            <p className="text-2xl font-bold text-red-600">{fmt(totalRemaining > 0 ? totalRemaining : 0)}</p>
          </CardContent>
        </Card>
      </div>

      {ordersBySeasons.map(({ season, orders: seasonOrders, total }) => (
        <div key={season.id} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{season.label}</h2>
            <span className="text-sm text-muted-foreground">Season Total: {fmt(total)}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account Name</TableHead>
                <TableHead>Order Type</TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Close Date</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {seasonOrders.map((order) => {
                const client = clients.find((c) => c.id === order.clientId)
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{client?.name || 'Unknown'}</TableCell>
                    <TableCell>
                      <Badge variant={order.orderType === 'Rental' ? 'default' : 'secondary'}>
                        {order.orderType}
                      </Badge>
                    </TableCell>
                    <TableCell>{order.orderNumber}</TableCell>
                    <TableCell>{order.closeDate}</TableCell>
                    <TableCell>{order.stage}</TableCell>
                    <TableCell className="text-right">{fmt(order.total)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  )
}

export default CompanyDetail
