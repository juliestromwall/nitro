import { useState, useMemo } from 'react'
import { Plus, Trash2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useAccounts } from '@/context/AccountContext'
import { useCompanies } from '@/context/CompanyContext'
import { useSales } from '@/context/SalesContext'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const centsToDisplay = (raw) => {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const cents = parseInt(digits, 10)
  const dollars = (cents / 100).toFixed(2)
  const [whole, dec] = dollars.split('.')
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${withCommas}.${dec}`
}

const centsToFloat = (raw) => {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 0
  return parseInt(digits, 10) / 100
}

const floatToCents = (val) => {
  const num = parseFloat(val)
  if (isNaN(num)) return ''
  return String(Math.round(num * 100))
}

const payStatusOptions = [
  { value: 'paid', label: 'Paid' },
  { value: 'partial', label: 'Partial' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'invoice sent', label: 'Invoice Sent' },
  { value: 'pending invoice', label: 'Pending Invoice' },
  { value: 'short shipped', label: 'Short Shipped' },
]

function BulkPaymentModal({ open, onOpenChange, companyId }) {
  const { getAccountName } = useAccounts()
  const { companies } = useCompanies()
  const { orders, commissions, upsertCommission } = useSales()

  const [date, setDate] = useState('')
  const [rows, setRows] = useState([{ accountSearch: '', clientId: null, accountName: '', payStatus: '', amount: '', showDropdown: false }])
  const [saving, setSaving] = useState(false)

  // Short shipped confirmation
  const [shortShipConfirmOpen, setShortShipConfirmOpen] = useState(false)
  const [shortShipRowIndex, setShortShipRowIndex] = useState(null)

  const company = companies.find((c) => c.id === companyId)
  const commPct = company?.commission_percent || 0

  const getExpectedRate = (orderType) => {
    const categoryPct = company?.category_commissions?.[orderType]
    return categoryPct != null ? categoryPct : commPct
  }

  // Precompute per-account commission summaries
  const accountSummaries = useMemo(() => {
    const companyOrders = orders.filter((o) => o.company_id === companyId && o.stage !== 'Cancelled')
    const byClient = new Map()

    companyOrders.forEach((o) => {
      if (!byClient.has(o.client_id)) {
        byClient.set(o.client_id, {
          clientId: o.client_id,
          accountName: getAccountName(o.client_id),
          orders: [],
        })
      }
      byClient.get(o.client_id).orders.push(o)
    })

    const summaries = new Map()
    for (const [clientId, group] of byClient) {
      const totalOrder = group.orders.reduce((sum, o) => sum + o.total, 0)
      const totalCommDue = group.orders.reduce((sum, o) => {
        const pct = getExpectedRate(o.order_type)
        return sum + (o.total * pct / 100)
      }, 0)

      // Sum amount_paid from ALL commission entries for this client's orders
      const orderIds = new Set(group.orders.map((o) => o.id))
      const clientComms = commissions.filter((c) => orderIds.has(c.order_id))
      const totalPaid = clientComms.reduce((sum, c) => sum + (c.amount_paid || 0), 0)

      // Check short shipped status
      const anyShortShipped = clientComms.some((c) => c.pay_status === 'short shipped')

      // Determine current aggregate pay status
      let aggPayStatus = 'pending invoice'
      if (anyShortShipped) {
        aggPayStatus = 'short shipped'
      } else {
        const allPaid = clientComms.length > 0 && clientComms.every((c) => c.pay_status === 'paid')
        const anyPaidOrPartial = clientComms.some((c) => c.pay_status === 'paid' || c.pay_status === 'partial')
        const anyInvoiceSent = clientComms.some((c) => c.pay_status === 'invoice sent')
        const anyUnpaid = clientComms.some((c) => c.pay_status === 'unpaid')
        if (allPaid) aggPayStatus = 'paid'
        else if (anyPaidOrPartial) aggPayStatus = 'partial'
        else if (anyInvoiceSent) aggPayStatus = 'invoice sent'
        else if (anyUnpaid) aggPayStatus = 'unpaid'
      }

      // Find first order's commission (where payments are stored)
      const firstOrder = group.orders[0]
      const firstComm = commissions.find((c) => c.order_id === firstOrder.id)

      summaries.set(clientId, {
        clientId,
        accountName: group.accountName,
        totalOrder,
        totalCommDue,
        totalPaid,
        aggPayStatus,
        anyShortShipped,
        firstOrderId: firstOrder.id,
        firstComm,
        orders: group.orders,
      })
    }

    return summaries
  }, [orders, commissions, companyId, getAccountName, company])

  // Build dropdown list from summaries
  const commissionAccounts = useMemo(() => {
    return Array.from(accountSummaries.values()).sort((a, b) => a.accountName.localeCompare(b.accountName))
  }, [accountSummaries])

  const addRow = () => {
    setRows((prev) => [...prev, { accountSearch: '', clientId: null, accountName: '', payStatus: '', amount: '', showDropdown: false }])
  }

  const updateRow = (index, field, value) => {
    setRows((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const removeRow = (index) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const selectAccount = (index, account) => {
    const summary = accountSummaries.get(account.clientId)
    setRows((prev) => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        clientId: account.clientId,
        accountName: account.accountName,
        accountSearch: '',
        showDropdown: false,
        payStatus: summary?.aggPayStatus || 'pending invoice',
      }
      return updated
    })
  }

  const clearAccount = (index) => {
    setRows((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], clientId: null, accountName: '', payStatus: '', amount: '' }
      return updated
    })
  }

  const handlePayStatusChange = (index, newStatus) => {
    if (newStatus === 'short shipped') {
      setShortShipRowIndex(index)
      setShortShipConfirmOpen(true)
    } else {
      updateRow(index, 'payStatus', newStatus)
    }
  }

  const confirmShortShip = () => {
    if (shortShipRowIndex !== null) {
      updateRow(shortShipRowIndex, 'payStatus', 'short shipped')
    }
    setShortShipConfirmOpen(false)
    setShortShipRowIndex(null)
  }

  const totalAmount = rows.reduce((sum, r) => sum + (r.amount ? centsToFloat(r.amount) : 0), 0)

  const handleSave = async () => {
    const validRows = rows.filter((r) => r.clientId && r.amount)
    if (validRows.length === 0) return

    setSaving(true)
    try {
      // Aggregate rows targeting the same account
      const byClient = new Map()
      validRows.forEach((r) => {
        if (!byClient.has(r.clientId)) {
          byClient.set(r.clientId, { clientId: r.clientId, payStatus: r.payStatus, payments: [] })
        }
        byClient.get(r.clientId).payments.push({
          amount: centsToFloat(r.amount),
          date: date || null,
        })
        byClient.get(r.clientId).payStatus = r.payStatus
      })

      for (const [clientId, entry] of byClient) {
        const summary = accountSummaries.get(clientId)
        if (!summary) continue

        const { firstOrderId, firstComm, orders: clientOrders, totalCommDue, totalPaid: existingTotalPaid } = summary

        // Get existing payments from first order's commission
        const existingPayments = firstComm?.payments || []
        const legacyPayments = existingPayments.length === 0 && firstComm?.amount_paid > 0
          ? [{ amount: firstComm.amount_paid, date: firstComm.paid_date || null }]
          : existingPayments

        // Append new payments
        const allPayments = [...legacyPayments, ...entry.payments]
        const newPaymentTotal = entry.payments.reduce((sum, p) => sum + p.amount, 0)

        // Total paid = existing total (from ALL commission entries) + new payments
        const totalPaidNow = existingTotalPaid + newPaymentTotal
        const latestDate = allPayments.filter((p) => p.date).map((p) => p.date).sort().pop() || null

        // Determine status using correct totals
        let status = entry.payStatus
        const paidCents = Math.round(totalPaidNow * 100)
        const dueCents = Math.round(totalCommDue * 100)
        if (status !== 'short shipped') {
          if (paidCents >= dueCents && dueCents > 0) status = 'paid'
          else if (paidCents > 0 && paidCents < dueCents) status = 'partial'
        }

        const remaining = Math.max(totalCommDue - totalPaidNow, 0)

        // Save on first order's commission
        try {
          await upsertCommission({
            order_id: firstOrderId,
            commission_due: firstComm?.commission_due || (clientOrders[0].total * getExpectedRate(clientOrders[0].order_type) / 100),
            pay_status: status,
            amount_paid: totalPaidNow,
            paid_date: latestDate,
            amount_remaining: remaining,
            payments: allPayments,
          })
        } catch (err) {
          console.error('Saving with payments failed, retrying without:', err)
          await upsertCommission({
            order_id: firstOrderId,
            commission_due: firstComm?.commission_due || (clientOrders[0].total * getExpectedRate(clientOrders[0].order_type) / 100),
            pay_status: status,
            amount_paid: totalPaidNow,
            paid_date: latestDate,
            amount_remaining: remaining,
          })
        }

        // Update other orders in group to same status
        for (let i = 1; i < clientOrders.length; i++) {
          const o = clientOrders[i]
          const oCommDue = o.total * getExpectedRate(o.order_type) / 100
          await upsertCommission({
            order_id: o.id,
            commission_due: oCommDue,
            pay_status: status,
            amount_paid: 0,
            paid_date: null,
            amount_remaining: 0,
          })
        }
      }

      // Reset and close
      setRows([{ accountSearch: '', clientId: null, accountName: '', payStatus: '', amount: '', showDropdown: false }])
      setDate('')
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to save bulk payments:', err)
      alert('Failed to save payments. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setRows([{ accountSearch: '', clientId: null, accountName: '', payStatus: '', amount: '', showDropdown: false }])
    setDate('')
    onOpenChange(false)
  }

  // Render summary box for a row
  const renderSummary = (row) => {
    if (!row.clientId) return null
    const summary = accountSummaries.get(row.clientId)
    if (!summary) return null

    const newPayment = row.amount ? centsToFloat(row.amount) : 0
    const totalPaidNow = summary.totalPaid + newPayment
    // Round to cents to avoid floating point display issues
    const paidCents = Math.round(totalPaidNow * 100)
    const dueCents = Math.round(summary.totalCommDue * 100)
    const remaining = (dueCents - paidCents) / 100
    const isShortShipStatus = row.payStatus === 'short shipped'
    const avgPct = summary.totalOrder > 0 ? (summary.totalCommDue / summary.totalOrder) * 100 : 0
    const unshippedCalc = isShortShipStatus && remaining > 0 && avgPct > 0
      ? remaining / (avgPct / 100)
      : 0

    // Overpaid — only when paid cents strictly exceed due cents
    const isOverpaid = !isShortShipStatus && paidCents > dueCents && dueCents > 0

    return (
      <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Commission Due:</span>
          <span className="font-bold">{fmt(summary.totalCommDue)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Paid:</span>
          <span className="font-bold text-green-700">{fmt(totalPaidNow)}</span>
        </div>
        <div className="flex justify-between border-t pt-1">
          <span className="text-muted-foreground">Remaining:</span>
          <span className={`font-bold ${remaining > 0 ? 'text-red-600' : ''}`}>{fmt(remaining)}</span>
        </div>
        {isShortShipStatus && unshippedCalc > 0 && (
          <div className="border-t pt-2 mt-2 space-y-1">
            <div className="flex justify-between text-purple-600">
              <span className="font-medium">Sales that did not ship:</span>
              <span className="font-bold">{fmt(unshippedCalc)}</span>
            </div>
            <div className="flex justify-between text-purple-600">
              <span className="font-medium">Updated Sale:</span>
              <span className="font-bold">{fmt(summary.totalOrder - unshippedCalc)}</span>
            </div>
            <div className="flex justify-between text-purple-600">
              <span className="font-medium">Updated Commission:</span>
              <span className="font-bold">{fmt(totalPaidNow)}</span>
            </div>
          </div>
        )}
        {isOverpaid && (() => {
          const overpaidSale = avgPct > 0 ? totalPaidNow / (avgPct / 100) : summary.totalOrder
          return (
            <div className="border-t pt-2 mt-2 space-y-1">
              <div className="flex justify-between text-emerald-600">
                <span className="font-medium">Overpaid by:</span>
                <span className="font-bold">{fmt(totalPaidNow - summary.totalCommDue)}</span>
              </div>
              <div className="flex justify-between text-emerald-600">
                <span className="font-medium">Updated Sale:</span>
                <span className="font-bold">{fmt(overpaidSale)}</span>
              </div>
              <div className="flex justify-between text-emerald-600">
                <span className="font-medium">Updated Commission:</span>
                <span className="font-bold">{fmt(totalPaidNow)}</span>
              </div>
            </div>
          )
        })()}
      </div>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          showCloseButton={false}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {/* Company banner */}
          <div className="flex items-center justify-center gap-3 pb-2">
            {company?.logo_path && (
              <img src={company.logo_path} alt={company.name} className="w-10 h-10 object-contain" />
            )}
            <span className="text-xl font-bold text-zinc-900">{company?.name}</span>
          </div>

          <DialogHeader>
            <DialogTitle>Add Payments</DialogTitle>
            <DialogDescription>Add payment entries for multiple accounts at once.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Shared date */}
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {/* Payment rows */}
            <div className="space-y-3">
              <Label>Payments</Label>
              {rows.map((row, idx) => (
                <div key={idx} className="flex items-start gap-2 border rounded-md p-3 bg-zinc-50 dark:bg-zinc-800">
                  <div className="flex-1 space-y-2">
                    {/* Account selector */}
                    <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) updateRow(idx, 'showDropdown', false) }}>
                      {row.clientId ? (
                        <div className="flex items-center gap-2 border rounded-md px-3 h-9 bg-white dark:bg-zinc-700">
                          <span className="text-sm font-medium flex-1">{row.accountName}</span>
                          <button
                            type="button"
                            onClick={() => clearAccount(idx)}
                            className="text-muted-foreground hover:text-zinc-700"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                            <input
                              placeholder="Search account..."
                              value={row.accountSearch}
                              onChange={(e) => {
                                updateRow(idx, 'accountSearch', e.target.value)
                                updateRow(idx, 'showDropdown', true)
                              }}
                              onFocus={() => updateRow(idx, 'showDropdown', true)}
                              className="w-full border rounded-md pl-7 pr-3 h-9 text-sm bg-white dark:bg-zinc-700 dark:border-zinc-600"
                            />
                          </div>
                          {row.showDropdown && (
                            <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-zinc-800 border dark:border-zinc-700 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto" tabIndex={-1}>
                              {commissionAccounts
                                .filter((a) => !row.accountSearch || a.accountName.toLowerCase().includes(row.accountSearch.toLowerCase()))
                                .map((account) => (
                                  <button
                                    key={account.clientId}
                                    type="button"
                                    onClick={() => selectAccount(idx, account)}
                                    className="block w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                  >
                                    {account.accountName}
                                  </button>
                                ))}
                              {commissionAccounts.filter((a) => !row.accountSearch || a.accountName.toLowerCase().includes(row.accountSearch.toLowerCase())).length === 0 && (
                                <div className="px-3 py-2 text-sm text-muted-foreground">No accounts found</div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Pay Status + Amount — only show after account selected */}
                    {row.clientId && (
                      <>
                        <div className="flex gap-2">
                          <select
                            value={row.payStatus}
                            onChange={(e) => handlePayStatusChange(idx, e.target.value)}
                            className={`text-xs font-medium rounded-md px-2 py-1 h-8 border cursor-pointer flex-1 ${
                              row.payStatus === 'paid' ? 'bg-green-100 text-green-800 border-green-200' :
                              row.payStatus === 'partial' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                              row.payStatus === 'unpaid' ? 'bg-red-100 text-red-800 border-red-200' :
                              row.payStatus === 'invoice sent' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                              row.payStatus === 'short shipped' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                              'bg-white dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-100'
                            }`}
                          >
                            {payStatusOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>

                          <div className="flex items-center border rounded-md px-2 h-8 bg-white dark:bg-zinc-700 focus-within:ring-2 focus-within:ring-ring flex-1">
                            <span className="text-xs text-muted-foreground select-none">$</span>
                            <input
                              inputMode="numeric"
                              placeholder="0.00"
                              value={row.amount ? centsToDisplay(row.amount) : ''}
                              onChange={(e) => {
                                const digits = e.target.value.replace(/\D/g, '')
                                updateRow(idx, 'amount', digits || '')
                              }}
                              className="flex-1 text-sm bg-transparent outline-none ml-1"
                            />
                          </div>
                        </div>

                        {/* Commission summary */}
                        {renderSummary(row)}
                      </>
                    )}
                  </div>

                  {/* Remove row */}
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="text-red-500 hover:text-red-700 p-1 mt-1"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add row */}
            <button
              type="button"
              onClick={addRow}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <Plus className="size-4" /> Add Row
            </button>

            {/* Total */}
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Total</span>
              <span className="text-lg font-bold text-zinc-900 dark:text-white">{fmt(totalAmount)}</span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || rows.every((r) => !r.clientId || !r.amount)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? 'Saving...' : 'Save Payments'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Short Shipped confirmation */}
      <Dialog open={shortShipConfirmOpen} onOpenChange={(o) => {
        if (!o) { setShortShipConfirmOpen(false); setShortShipRowIndex(null) }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as Short Shipped</DialogTitle>
            <DialogDescription>
              Are you sure? The system will calculate the unshipped sales amount based on the remaining commission gap and deduct it from your totals.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShortShipConfirmOpen(false); setShortShipRowIndex(null) }}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={confirmShortShip}>
              Confirm Short Shipped
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default BulkPaymentModal
