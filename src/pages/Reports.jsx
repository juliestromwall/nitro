import { useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAccounts } from '@/context/AccountContext'
import { useCompanies } from '@/context/CompanyContext'
import { useSales } from '@/context/SalesContext'
import { useTodos } from '@/context/TodoContext'

import { exportAccountsXlsx, exportBrandsXlsx, exportSalesXlsx, exportCommissionsXlsx, exportPaymentsXlsx, exportTodosXlsx } from '@/lib/exportXlsx'
import { exportAccountsPdf, exportBrandsPdf, exportSalesPdf, exportCommissionsPdf, exportPaymentsPdf, exportTodosPdf } from '@/lib/exportPdf'

const reports = [
  {
    key: 'accounts',
    title: 'Accounts',
    description: 'All accounts with region, type, and location.',
    xlsx: (ctx) => exportAccountsXlsx(ctx.accounts),
    pdf: (ctx) => exportAccountsPdf(ctx.accounts),
  },
  {
    key: 'brands',
    title: 'Brands',
    description: 'All brands with commission rates and settings.',
    xlsx: (ctx) => exportBrandsXlsx(ctx.companies),
    pdf: (ctx) => exportBrandsPdf(ctx.companies),
  },
  {
    key: 'sales',
    title: 'Sales',
    description: 'All orders across every brand and season.',
    xlsx: (ctx) => exportSalesXlsx(ctx.orders, ctx.companies, ctx.accounts, ctx.seasons),
    pdf: (ctx) => exportSalesPdf(ctx.orders, ctx.companies, ctx.accounts, ctx.seasons),
  },
  {
    key: 'commissions',
    title: 'Commissions',
    description: 'Commission due, paid, and remaining per order.',
    xlsx: (ctx) => exportCommissionsXlsx(ctx.commissions, ctx.orders, ctx.companies, ctx.accounts),
    pdf: (ctx) => exportCommissionsPdf(ctx.commissions, ctx.orders, ctx.companies, ctx.accounts),
  },
  {
    key: 'payments',
    title: 'Payments',
    description: 'All individual commission payments with dates.',
    xlsx: (ctx) => exportPaymentsXlsx(ctx.commissions, ctx.orders, ctx.companies, ctx.accounts),
    pdf: (ctx) => exportPaymentsPdf(ctx.commissions, ctx.orders, ctx.companies, ctx.accounts),
  },
  {
    key: 'todos',
    title: 'To Dos',
    description: 'All to-do items across every brand.',
    xlsx: (ctx) => exportTodosXlsx(ctx.todos, ctx.companies, ctx.accounts),
    pdf: (ctx) => exportTodosPdf(ctx.todos, ctx.companies, ctx.accounts),
  },
]

export default function Reports() {
  const { accounts } = useAccounts()
  const { companies } = useCompanies()
  const { orders, commissions, seasons } = useSales()
  const { todos } = useTodos()
  const [busy, setBusy] = useState(null)

  const ctx = { accounts, companies, orders, commissions, seasons, todos }

  const handleExport = async (key, format) => {
    const id = `${key}-${format}`
    setBusy(id)
    try {
      const report = reports.find((r) => r.key === key)
      if (format === 'xlsx') {
        await report.xlsx(ctx)
      } else {
        await report.pdf(ctx)
      }
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground mt-2">Download your data as spreadsheets or PDFs.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
        {reports.map((r) => (
          <Card key={r.key}>
            <CardHeader>
              <CardTitle>{r.title}</CardTitle>
              <CardDescription>{r.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleExport(r.key, 'xlsx')}
                  disabled={busy !== null}
                  className="flex-1"
                >
                  <FileSpreadsheet className="size-4" />
                  {busy === `${r.key}-xlsx` ? 'Exporting...' : '.xlsx'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport(r.key, 'pdf')}
                  disabled={busy !== null}
                  className="flex-1"
                >
                  <FileText className="size-4" />
                  {busy === `${r.key}-pdf` ? 'Exporting...' : '.pdf'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
