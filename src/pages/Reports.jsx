import { useState, useMemo } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAccounts } from '@/context/AccountContext'
import { useCompanies } from '@/context/CompanyContext'
import { useSales, deriveCycle } from '@/context/SalesContext'
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
    xlsx: (ctx) => exportSalesXlsx(ctx.orders, ctx.companies, ctx.accounts, ctx.seasons, ctx.filterInfo),
    pdf: (ctx) => exportSalesPdf(ctx.orders, ctx.companies, ctx.accounts, ctx.seasons, ctx.filterInfo),
  },
  {
    key: 'commissions',
    title: 'Commissions',
    description: 'Commission due, paid, and remaining per order.',
    xlsx: (ctx) => exportCommissionsXlsx(ctx.commissions, ctx.orders, ctx.companies, ctx.accounts, ctx.filterInfo),
    pdf: (ctx) => exportCommissionsPdf(ctx.commissions, ctx.orders, ctx.companies, ctx.accounts, ctx.filterInfo),
  },
  {
    key: 'payments',
    title: 'Payments',
    description: 'All individual commission payments with dates.',
    xlsx: (ctx) => exportPaymentsXlsx(ctx.commissions, ctx.orders, ctx.companies, ctx.accounts, ctx.filterInfo),
    pdf: (ctx) => exportPaymentsPdf(ctx.commissions, ctx.orders, ctx.companies, ctx.accounts, ctx.filterInfo),
  },
  {
    key: 'todos',
    title: 'To Dos',
    description: 'All to-do items across every brand.',
    xlsx: (ctx) => exportTodosXlsx(ctx.todos, ctx.companies, ctx.accounts),
    pdf: (ctx) => exportTodosPdf(ctx.todos, ctx.companies, ctx.accounts),
  },
]

const FILTERABLE = new Set(['sales', 'commissions', 'payments'])

export default function Reports() {
  const { accounts } = useAccounts()
  const { companies } = useCompanies()
  const { orders, commissions, seasons, getActiveCycles } = useSales()
  const { todos } = useTodos()
  const [busy, setBusy] = useState(null)
  const [brandId, setBrandId] = useState('all')
  const [accountId, setAccountId] = useState('all')
  const [trackerId, setTrackerId] = useState('all')
  const [cycle, setCycle] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const hasFilters = brandId !== 'all' || accountId !== 'all' || trackerId !== 'all' || cycle !== 'all' || startDate || endDate

  const availableTrackers = useMemo(() => {
    const filtered = brandId === 'all' ? seasons : seasons.filter(s => s.company_id === brandId)
    return [...filtered].sort((a, b) => a.label.localeCompare(b.label))
  }, [brandId, seasons])

  const availableCycles = useMemo(() => {
    if (brandId === 'all') return getActiveCycles()
    return [...new Set(seasons.filter(s => s.company_id === brandId).map(deriveCycle).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
  }, [brandId, seasons, getActiveCycles])

  const seasonCycleMap = useMemo(() =>
    Object.fromEntries(seasons.map(s => [s.id, deriveCycle(s)])),
    [seasons]
  )

  const filtered = useMemo(() => {
    const filteredOrders = orders
      .filter(o => brandId === 'all' || o.company_id === brandId)
      .filter(o => accountId === 'all' || o.client_id === accountId)
      .filter(o => trackerId === 'all' || o.season_id === trackerId)
      .filter(o => cycle === 'all' || seasonCycleMap[o.season_id] === cycle)
      .filter(o => !startDate || (o.close_date && o.close_date >= startDate))
      .filter(o => !endDate || (o.close_date && o.close_date <= endDate))

    const filteredOrderIds = new Set(filteredOrders.map(o => o.id))

    const filteredCommissions = commissions.filter(c => filteredOrderIds.has(c.order_id))

    const filteredSeasons = brandId === 'all'
      ? seasons
      : seasons.filter(s => s.company_id === brandId)

    return { orders: filteredOrders, commissions: filteredCommissions, seasons: filteredSeasons }
  }, [orders, commissions, seasons, brandId, accountId, trackerId, cycle, seasonCycleMap, startDate, endDate])

  const filterInfo = useMemo(() => {
    const parts = []
    const fileParts = []
    if (brandId !== 'all') {
      const name = companies.find(c => c.id === brandId)?.name || ''
      parts.push(name)
      fileParts.push(name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, ''))
    }
    if (accountId !== 'all') {
      const name = accounts.find(a => a.id === accountId)?.name || ''
      parts.push(name)
      fileParts.push(name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, ''))
    }
    if (trackerId !== 'all') {
      const label = seasons.find(s => s.id === trackerId)?.label || ''
      parts.push(label)
      fileParts.push(label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, ''))
    }
    if (cycle !== 'all') {
      parts.push(cycle)
      fileParts.push(cycle.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, ''))
    }
    if (startDate) parts.push(`From ${startDate}`)
    if (endDate) parts.push(`To ${endDate}`)
    if (startDate) fileParts.push(`from-${startDate}`)
    if (endDate) fileParts.push(`to-${endDate}`)
    return {
      label: parts.join('  |  '),
      suffix: fileParts.length ? '_' + fileParts.join('_') : '',
    }
  }, [brandId, accountId, trackerId, cycle, startDate, endDate, companies, accounts, seasons])

  const ctx = { accounts, companies, orders, commissions, seasons, todos }
  const filteredCtx = { ...ctx, ...filtered, filterInfo }

  const handleExport = async (key, format) => {
    const id = `${key}-${format}`
    setBusy(id)
    try {
      const report = reports.find((r) => r.key === key)
      const exportCtx = FILTERABLE.has(key) ? filteredCtx : ctx
      if (format === 'xlsx') {
        await report.xlsx(exportCtx)
      } else {
        await report.pdf(exportCtx)
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

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Brand</Label>
          <Select value={brandId} onValueChange={v => { setBrandId(v); setTrackerId('all'); setCycle('all') }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {companies.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {[...accounts].sort((a, b) => a.name.localeCompare(b.name)).map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Sales Tracker</Label>
          <Select value={trackerId} onValueChange={setTrackerId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trackers</SelectItem>
              {availableTrackers.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Sale Cycle</Label>
          <Select value={cycle} onValueChange={setCycle}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cycles</SelectItem>
              {availableCycles.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Start Date</Label>
          <Input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">End Date</Label>
          <Input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="w-[160px]"
          />
        </div>
        {hasFilters && (
          <button
            onClick={() => { setBrandId('all'); setAccountId('all'); setTrackerId('all'); setCycle('all'); setStartDate(''); setEndDate('') }}
            className="text-xs text-muted-foreground hover:text-foreground underline pb-2"
          >
            Clear filters
          </button>
        )}
        <p className="text-xs text-muted-foreground pb-2 ml-auto">
          Filters apply to Sales, Commissions &amp; Payments
        </p>
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
