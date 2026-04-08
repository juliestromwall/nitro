import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, DollarSign, TrendingUp, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSales, deriveCycle, cycleSortKey } from '@/context/SalesContext'
import { useAuth } from '@/context/AuthContext'
import { useCompanies } from '@/context/CompanyContext'
import { EXCLUDED_STAGES } from '@/lib/constants'
import { useAccounts } from '@/context/AccountContext'
import { useExchangeRates } from '@/hooks/useExchangeRate'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const fmtCompact = (value) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return fmt(value)
}

const currentYear = new Date().getFullYear()
const defaultCycle = `${currentYear}-${currentYear + 1}`

function Dashboard() {
  const { seasons, orders, commissions, loading: salesLoading, getActiveCycles } = useSales()
  const { user } = useAuth()
  const { activeCompanies, loading: companiesLoading } = useCompanies()
  const { accounts, getAccount } = useAccounts()
  const navigate = useNavigate()

  const dataLoading = salesLoading || companiesLoading
  const [showUSD, setShowUSD] = useState(false)

  // Build sorted list of cycles that have trackers
  const activeCycles = useMemo(() => getActiveCycles(), [seasons])

  // Load saved cycle from localStorage, fall back to most recent or default
  const [selectedCycle, setSelectedCycle] = useState(() => {
    if (user) {
      try {
        const saved = localStorage.getItem(`rc_dashboard_cycle_${user.id}`)
        if (saved) return saved
      } catch {}
    }
    return defaultCycle
  })

  // Save selected cycle to localStorage
  useEffect(() => {
    if (user && selectedCycle) {
      try { localStorage.setItem(`rc_dashboard_cycle_${user.id}`, selectedCycle) } catch {}
    }
  }, [selectedCycle, user])

  // If saved cycle no longer exists in data, fall back to the most recent
  useEffect(() => {
    if (activeCycles.length > 0 && !activeCycles.includes(selectedCycle)) {
      setSelectedCycle(activeCycles[activeCycles.length - 1])
    }
  }, [activeCycles])

  const selectedCycleIndex = activeCycles.indexOf(selectedCycle)
  const canGoLeft = activeCycles.length > 0 && selectedCycleIndex > 0
  const canGoRight = activeCycles.length > 0 && selectedCycleIndex < activeCycles.length - 1

  // Build a company lookup for commission rates
  const companyMap = useMemo(() => {
    const map = {}
    activeCompanies.forEach((c) => { map[c.id] = c })
    return map
  }, [activeCompanies])

  // Fetch exchange rates for all accounts with non-USD currencies
  const fxPairs = useMemo(() => {
    const seen = new Set()
    return accounts
      .map((a) => a.currency || 'USD')
      .filter((c) => c !== 'USD' && !seen.has(c) && seen.add(c))
      .map((c) => ({ from: c, to: 'USD' }))
  }, [accounts])
  const { getRate } = useExchangeRates(fxPairs)
  const getAccountCurrency = (clientId) => getAccount(clientId)?.currency || 'USD'

  const brandData = useMemo(() => {
    // Get season IDs that match the selected cycle
    const matchingSeasonIds = new Set(
      seasons.filter((s) => deriveCycle(s) === selectedCycle).map((s) => s.id)
    )

    // Filter excluded stage orders in those seasons
    const yearOrders = orders.filter(
      (o) => matchingSeasonIds.has(o.season_id) && !EXCLUDED_STAGES.includes(o.stage)
    )

    // Build a commission payment lookup by order_id
    const commissionByOrderId = {}
    commissions.forEach((c) => {
      commissionByOrderId[c.order_id] = c
    })

    // Group by company — calculate commission from order data + company rate
    const byCompany = {}
    yearOrders.forEach((o) => {
      if (!byCompany[o.company_id]) {
        byCompany[o.company_id] = { totalSales: 0, commissionEarned: 0, rawCommissionEarned: 0, commissionPaid: 0, orderCount: 0 }
      }
      // Sales stay in original currency (no conversion)
      byCompany[o.company_id].totalSales += o.total || 0
      byCompany[o.company_id].orderCount += 1

      // Track per-category totals (raw, no conversion)
      const cat = o.order_type || 'Other'
      if (!byCompany[o.company_id].categories) byCompany[o.company_id].categories = {}
      byCompany[o.company_id].categories[cat] = (byCompany[o.company_id].categories[cat] || 0) + (o.total || 0)

      // Commission earned — track raw and USD-converted
      const company = companyMap[o.company_id]
      const defaultPct = company?.commission_percent || 0
      const pct = o.commission_override != null ? o.commission_override : defaultPct
      const rawComm = (o.total || 0) * pct / 100
      const acctCur = getAccountCurrency(o.client_id)
      byCompany[o.company_id].rawCommissionEarned += rawComm
      byCompany[o.company_id].commissionEarned += rawComm * getRate(acctCur, 'USD')

      // Commission paid from commissions table (payment tracking)
      const comm = commissionByOrderId[o.id]
      if (comm) {
        byCompany[o.company_id].commissionPaid += comm.amount_paid || 0
      }
    })

    // Map to active companies (include all active, even with no data)
    const rows = activeCompanies.map((c) => {
      const data = byCompany[c.id] || { totalSales: 0, commissionEarned: 0, rawCommissionEarned: 0, commissionPaid: 0, orderCount: 0, categories: {} }
      return {
        id: c.id,
        name: c.name,
        logo_path: c.logo_path,
        commission_percent: c.commission_percent || 0,
        totalSales: data.totalSales,
        commissionEarned: data.commissionEarned,
        rawCommissionEarned: data.rawCommissionEarned,
        commissionOwed: data.commissionEarned - data.commissionPaid,
        rawCommissionOwed: data.rawCommissionEarned - data.commissionPaid,
        orderCount: data.orderCount,
        categories: data.categories || {},
      }
    })

    const totals = rows.reduce(
      (acc, r) => ({
        totalSales: acc.totalSales + r.totalSales,
        commissionEarned: acc.commissionEarned + r.commissionEarned,
        rawCommissionEarned: acc.rawCommissionEarned + r.rawCommissionEarned,
        commissionOwed: acc.commissionOwed + r.commissionOwed,
        rawCommissionOwed: acc.rawCommissionOwed + r.rawCommissionOwed,
      }),
      { totalSales: 0, commissionEarned: 0, rawCommissionEarned: 0, commissionOwed: 0, rawCommissionOwed: 0 }
    )

    const hasConversion = yearOrders.some((o) => getAccountCurrency(o.client_id) !== 'USD')
    return { rows, totals, hasConversion }
  }, [seasons, orders, commissions, activeCompanies, companyMap, selectedCycle, getRate, accounts])

  return (
    <div className="px-6 py-4 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div data-tour="cycle-picker" className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Sales Cycle:</span>
          <div className="flex items-center">
            <button
              onClick={() => {
                if (canGoLeft) setSelectedCycle(activeCycles[selectedCycleIndex - 1])
              }}
              disabled={!canGoLeft}
              className="px-2 py-1.5 text-[#005b5b] hover:bg-[#005b5b]/10 rounded-l-md border border-[#005b5b]/30 border-r-0 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="px-4 py-1.5 bg-[#005b5b] text-white text-sm font-semibold tabular-nums select-none min-w-[120px] text-center">
              {selectedCycle}
            </div>
            <button
              onClick={() => {
                if (canGoRight) setSelectedCycle(activeCycles[selectedCycleIndex + 1])
              }}
              disabled={!canGoRight}
              className="px-2 py-1.5 text-[#005b5b] hover:bg-[#005b5b]/10 rounded-r-md border border-[#005b5b]/30 border-l-0 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Strip */}
      {dataLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-300 border-t-[#005b5b]" />
        </div>
      ) : (
      <>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center gap-3 bg-zinc-900 rounded-xl px-5 py-4">
          <div className="p-2 bg-[#005b5b] rounded-lg">
            <DollarSign className="size-5 text-white" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Total Sales</p>
            <p className="text-xl font-bold text-white">{fmt(brandData.totals.totalSales)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-zinc-900 rounded-xl px-5 py-4">
          <div className="p-2 bg-emerald-600 rounded-lg">
            <TrendingUp className="size-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-zinc-400 uppercase tracking-wide">Commish Earned</p>
              {brandData.hasConversion && (
                <button
                  onClick={() => setShowUSD(!showUSD)}
                  className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${showUSD ? 'bg-[#005b5b] text-white border-[#005b5b]' : 'text-zinc-400 border-zinc-600 hover:bg-zinc-800'}`}
                >
                  <DollarSign className="size-2.5" />
                  USD
                </button>
              )}
            </div>
            <p className="text-xl font-bold text-white">{fmt(showUSD ? brandData.totals.commissionEarned : brandData.totals.rawCommissionEarned)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-zinc-900 rounded-xl px-5 py-4">
          <div className="p-2 bg-amber-500 rounded-lg">
            <AlertCircle className="size-5 text-white" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Commish Owed</p>
            <p className="text-xl font-bold text-white">{fmt(showUSD ? brandData.totals.commissionOwed : brandData.totals.rawCommissionOwed)}</p>
          </div>
        </div>
      </div>

      {/* Brand Cards */}
      {brandData.rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          No brands yet. Add a brand to get started.
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-6">
          {brandData.rows.map((row) => {
            const hasData = row.orderCount > 0
            return (
              <div
                key={row.id}
                onClick={() => navigate(`/app/companies/${row.id}`)}
                className="group relative bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-6 hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-600 transition-all cursor-pointer"
              >
                {/* Logo + Name */}
                <div className="flex flex-col items-center text-center mb-5">
                  {row.logo_path ? (
                    <img
                      src={row.logo_path}
                      alt={row.name}
                      className="w-16 h-16 object-contain mb-2"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center text-zinc-500 dark:text-zinc-400 text-2xl font-bold mb-2">
                      {row.name.charAt(0)}
                    </div>
                  )}
                  <h3 className="font-semibold text-zinc-900 dark:text-white">{row.name}</h3>
                  {hasData && (
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {row.orderCount} order{row.orderCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {hasData ? (
                  <div className="space-y-3">
                    {/* Sales bar */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Sales</span>
                        <span className="font-semibold">{fmtCompact(row.totalSales)}</span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-zinc-800 dark:bg-zinc-400 rounded-full transition-all"
                          style={{ width: `${Math.min(100, brandData.totals.totalSales > 0 ? (row.totalSales / brandData.totals.totalSales) * 100 : 0)}%` }}
                        />
                      </div>
                    </div>
                    {/* Commission earned */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Earned</span>
                        <span className="font-semibold text-emerald-600">{fmtCompact(showUSD ? row.commissionEarned : row.rawCommissionEarned)}</span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, brandData.totals.commissionEarned > 0 ? (row.commissionEarned / brandData.totals.commissionEarned) * 100 : 0)}%` }}
                        />
                      </div>
                    </div>
                    {/* Commission owed */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Owed</span>
                        <span className="font-semibold text-amber-600">{fmtCompact(showUSD ? row.commissionOwed : row.rawCommissionOwed)}</span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all"
                          style={{ width: `${Math.min(100, brandData.totals.commissionOwed > 0 ? (row.commissionOwed / brandData.totals.commissionOwed) * 100 : 0)}%` }}
                        />
                      </div>
                    </div>
                    {/* Category breakdown */}
                    {Object.keys(row.categories).length >= 2 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 border-t border-zinc-100 dark:border-zinc-700">
                        {Object.entries(row.categories).map(([cat, total]) => (
                          <span key={cat} className="text-xs text-muted-foreground">
                            {cat}: <span className="font-medium text-zinc-700 dark:text-zinc-300">{fmtCompact(total)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-center text-muted-foreground py-2">
                    No sales in {selectedCycle}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
      </>
      )}
    </div>
  )
}

export default Dashboard
