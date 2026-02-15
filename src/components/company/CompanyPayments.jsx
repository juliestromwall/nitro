import { useState, useMemo } from 'react'
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { useAccounts } from '@/context/AccountContext'
import { useCompanies } from '@/context/CompanyContext'
import { useSales } from '@/context/SalesContext'
import { EXCLUDED_STAGES } from '@/lib/constants'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const fmtDate = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d)) return dateStr
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

const SortIcon = ({ column, sortConfig }) => {
  if (sortConfig.key !== column) return <ArrowUpDown className="size-3 opacity-40" />
  return sortConfig.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
}

function CompanyPayments({ companyId }) {
  const { getAccountName } = useAccounts()
  const { companies } = useCompanies()
  const { orders, commissions } = useSales()

  const [searchQuery, setSearchQuery] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: 'date', dir: 'desc' })

  const company = companies.find((c) => c.id === companyId)

  // Flatten all payments from commissions linked to this company's orders
  const allPayments = useMemo(() => {
    const companyOrders = orders.filter((o) => o.company_id === companyId)
    const orderMap = {}
    companyOrders.forEach((o) => { orderMap[o.id] = o })

    const payments = []

    commissions.forEach((comm) => {
      const order = orderMap[comm.order_id]
      if (!order) return

      // New payments JSONB array
      if (comm.payments && comm.payments.length > 0) {
        comm.payments.forEach((p) => {
          if (p.amount > 0) {
            payments.push({
              accountName: getAccountName(order.client_id),
              clientId: order.client_id,
              date: p.date || '',
              amount: p.amount,
            })
          }
        })
      } else if (comm.amount_paid > 0) {
        // Legacy fallback
        payments.push({
          accountName: getAccountName(order.client_id),
          clientId: order.client_id,
          date: comm.paid_date || '',
          amount: comm.amount_paid,
        })
      }
    })

    return payments
  }, [orders, commissions, companyId, getAccountName])

  // Filter by search
  const filteredPayments = useMemo(() => {
    if (!searchQuery.trim()) return allPayments
    const q = searchQuery.toLowerCase()
    return allPayments.filter((p) => p.accountName.toLowerCase().includes(q))
  }, [allPayments, searchQuery])

  // Sort
  const sortedPayments = useMemo(() => {
    const sorted = [...filteredPayments]
    if (sortConfig.key) {
      sorted.sort((a, b) => {
        let av, bv
        switch (sortConfig.key) {
          case 'account': av = a.accountName; bv = b.accountName; break
          case 'date': av = a.date; bv = b.date; break
          case 'amount': return sortConfig.dir === 'asc' ? a.amount - b.amount : b.amount - a.amount
          default: return 0
        }
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortConfig.dir === 'asc' ? cmp : -cmp
      })
    }
    return sorted
  }, [filteredPayments, sortConfig])

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups = new Map()
    sortedPayments.forEach((p) => {
      const dateKey = p.date || 'No Date'
      if (!groups.has(dateKey)) groups.set(dateKey, [])
      groups.get(dateKey).push(p)
    })
    return Array.from(groups.entries())
  }, [sortedPayments])

  const toggleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
  }

  const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0)

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-800 border-2 border-[#005b5b]/30 dark:border-zinc-700 rounded-xl px-4 py-3">
          <p className="text-xs text-[#005b5b] uppercase tracking-wide">Total Payments</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-white">{fmt(totalAmount)}</p>
        </div>
        <div className="bg-white dark:bg-zinc-800 border-2 border-[#005b5b]/30 dark:border-zinc-700 rounded-xl px-4 py-3">
          <p className="text-xs text-[#005b5b] uppercase tracking-wide">Payment Count</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-white">{filteredPayments.length}</p>
        </div>
      </div>

      {/* Sticky search bar */}
      <div className="sticky top-[107px] z-20 bg-background pb-2 pt-1 border-b border-zinc-100 dark:border-zinc-700">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by account name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Payments table */}
      <Table>
        <TableHeader className="sticky top-[149px] z-[15]">
          <TableRow className="bg-[#005b5b] hover:bg-[#005b5b]">
            <TableHead className="text-white cursor-pointer select-none" onClick={() => toggleSort('account')}>
              <span className="flex items-center gap-1 whitespace-nowrap">Account <SortIcon column="account" sortConfig={sortConfig} /></span>
            </TableHead>
            <TableHead className="text-white cursor-pointer select-none" onClick={() => toggleSort('date')}>
              <span className="flex items-center gap-1 whitespace-nowrap">Date of Payment <SortIcon column="date" sortConfig={sortConfig} /></span>
            </TableHead>
            <TableHead className="text-white text-right cursor-pointer select-none" onClick={() => toggleSort('amount')}>
              <span className="flex items-center justify-end gap-1 whitespace-nowrap">Amount <SortIcon column="amount" sortConfig={sortConfig} /></span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedByDate.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                {searchQuery ? 'No payments match your search.' : 'No payment data yet.'}
              </TableCell>
            </TableRow>
          ) : (
            groupedByDate.map(([dateKey, payments]) => (
              <>
                {/* Date group header */}
                <TableRow key={`date-${dateKey}`} className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <TableCell colSpan={2} className="font-bold text-zinc-900 dark:text-white py-2">
                    {dateKey === 'No Date' ? 'No Date' : fmtDate(dateKey)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-zinc-900 dark:text-white py-2">
                    {fmt(payments.reduce((sum, p) => sum + p.amount, 0))}
                  </TableCell>
                </TableRow>
                {/* Payment rows */}
                {payments.map((payment, idx) => (
                  <TableRow key={`${dateKey}-${idx}`}>
                    <TableCell>{payment.accountName}</TableCell>
                    <TableCell>{payment.date ? fmtDate(payment.date) : '—'}</TableCell>
                    <TableCell className="text-right">{fmt(payment.amount)}</TableCell>
                  </TableRow>
                ))}
              </>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export default CompanyPayments
