import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { commissions, seasons, clients } from '@/data/mockData'

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

function Commission() {
  return (
    <div className="px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Commission</h1>

      <Tabs defaultValue="us-2025-2026">
        <TabsList>
          {seasons.map((season) => (
            <TabsTrigger key={season.id} value={season.id}>
              {season.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {seasons.map((season) => {
          const seasonCommissions = commissions
            .filter((c) => c.seasonId === season.id)
            .sort((a, b) => b.amountRemaining - a.amountRemaining)

          const totalDue = seasonCommissions.reduce((sum, c) => sum + c.due, 0)
          const totalPaid = seasonCommissions.reduce((sum, c) => sum + c.amountPaid, 0)
          const outstandingTotal = seasonCommissions.reduce((sum, c) => sum + c.amountRemaining, 0)

          return (
            <TabsContent key={season.id} value={season.id} className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Total Due</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{fmt(totalDue)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Total Paid</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{fmt(totalPaid)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle>
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
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}

export default Commission
