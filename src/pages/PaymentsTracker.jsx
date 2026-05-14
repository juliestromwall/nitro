import { useState, useMemo, useEffect } from 'react'
import { ArrowLeft, ChevronRight, ChevronDown, Plus, DollarSign, Banknote, Wallet, Trash2, Pencil, Check, X, Search, MapPin, Mail, User, Upload, Map, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useCompanies } from '@/context/CompanyContext'
import JSZip from 'jszip'
import { REPS, BRANDS, REP_BRANDS, REP_TERRITORIES, RENTAL_REPS, RENTAL_RATES, ACCOUNTS, ENTRIES, PAYOUTS } from '@/lib/paymentsDemoData'

// Loose column-name matcher for QuickBooks-style payment report imports.
// QB doesn't always label columns the same way, so we accept several variants.
const COLUMN_PATTERNS = {
  contactId: [/customer.*(id|no|number|num)/i, /^num$/i, /account.*(id|no|number)/i],
  accountName: [/customer/i, /company/i, /^name$/i, /account name/i],
  invoice: [/invoice/i, /^doc/i, /^reference/i, /^ref$/i],
  amount: [/^amount paid/i, /^paid/i, /^amount$/i, /^total$/i, /^payment$/i, /open balance/i],
  shipping: [/shipping/i, /freight/i, /ship cost/i],
  date: [/^date$/i, /trans.*date/i, /payment.*date/i, /^paid date/i],
  method: [/method/i, /^type$/i, /pay.*type/i],
}

function detectColumns(headers) {
  const map = {}
  for (const field of Object.keys(COLUMN_PATTERNS)) {
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i] ?? '').trim()
      if (!h) continue
      if (COLUMN_PATTERNS[field].some(rx => rx.test(h))) {
        if (!(field in map)) map[field] = i
      }
    }
  }
  return map
}

// Match a mock-brand id (e.g., 'brand-nitro') to a real company by best name overlap.
function findRealCompanyForMockBrand(mockBrand, companies) {
  if (!mockBrand || !companies?.length) return null
  const mockName = mockBrand.name.toLowerCase()
  // exact name match
  let m = companies.find(c => c.name.toLowerCase() === mockName)
  if (m) return m
  // first word in mock contained in real name
  const firstWord = mockName.split(/\s+/)[0]
  m = companies.find(c => c.name.toLowerCase().includes(firstWord))
  return m || null
}

const METHODS = ['ACH', 'CC', 'WSR', 'DEBIT', 'WIRE']

const fmt = (n) => {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  const abs = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return num < 0 ? `-$${abs}` : `$${abs}`
}

const fmtDate = (s) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`
}

function PaymentsTracker() {
  const { activeCompanies } = useCompanies()
  const [reps] = useState(REPS)
  const [accounts, setAccounts] = useState(ACCOUNTS)
  const [rateOverrides, setRateOverrides] = useState({}) // { brandId: rateAsDecimal } — local-only overrides

  // Build the brand list from real Supabase companies (the user's actual brands),
  // falling back to hardcoded BRANDS if companies haven't loaded yet.
  const brands = useMemo(() => {
    if (!activeCompanies?.length) {
      return BRANDS.map(b => ({ ...b, defaultRate: rateOverrides[b.id] ?? b.defaultRate }))
    }
    return activeCompanies.map(c => ({
      id: String(c.id),
      name: c.name,
      defaultRate: rateOverrides[String(c.id)] ?? ((c.commission_percent ?? 7) / 100),
      logoPath: c.logo_path,
    }))
  }, [activeCompanies, rateOverrides])

  // Map mock brand ids → real company ids by name
  const mockBrandToReal = useMemo(() => {
    const map = {}
    for (const mock of BRANDS) {
      const real = findRealCompanyForMockBrand(mock, activeCompanies || [])
      if (real) map[mock.id] = String(real.id)
    }
    return map
  }, [activeCompanies])

  // Remap mock entries' brandIds to real-company ids when possible
  const [entries, setEntries] = useState(ENTRIES)
  const remappedEntries = useMemo(
    () => entries.map(e => ({ ...e, brandId: mockBrandToReal[e.brandId] || e.brandId })),
    [entries, mockBrandToReal]
  )
  const [payouts, setPayouts] = useState(PAYOUTS)
  const remappedPayouts = useMemo(
    () => payouts.map(p => ({ ...p, brandId: mockBrandToReal[p.brandId] || p.brandId })),
    [payouts, mockBrandToReal]
  )
  // Remap rep_brands too
  const remappedRepBrands = useMemo(
    () => REP_BRANDS.map(rb => ({ ...rb, brandId: mockBrandToReal[rb.brandId] || rb.brandId })),
    [mockBrandToReal]
  )

  const [view, setView] = useState('reps') // 'reps' | 'brands' | 'ledger'
  const [selectedRepId, setSelectedRepId] = useState(null)
  const [selectedBrandId, setSelectedBrandId] = useState(null)
  const [expandedPayouts, setExpandedPayouts] = useState({})

  const [addEntryOpen, setAddEntryOpen] = useState(false)
  const [schedulePayoutOpen, setSchedulePayoutOpen] = useState(false)
  const [editingRate, setEditingRate] = useState(false)

  // ===== Derived =====
  const repBrands = useMemo(() => {
    if (!selectedRepId) return []
    // Show ALL real brands for the selected rep, plus any mock-rep-brand mappings
    const explicit = remappedRepBrands.filter(rb => rb.repId === selectedRepId)
      .map(rb => brands.find(b => b.id === rb.brandId))
      .filter(Boolean)
    // Adam (the seed rep) gets ALL the user's real brands by default — so whatever they put in the demo account shows up
    if (selectedRepId === 'rep-adam' && activeCompanies?.length) {
      const seenIds = new Set(explicit.map(b => b.id))
      for (const b of brands) {
        if (!seenIds.has(b.id)) explicit.push(b)
      }
    }
    return explicit
  }, [selectedRepId, brands, remappedRepBrands, activeCompanies])

  const ledgerEntries = useMemo(() => {
    return remappedEntries.filter(e => e.repId === selectedRepId && e.brandId === selectedBrandId)
  }, [remappedEntries, selectedRepId, selectedBrandId])

  const ledgerPayouts = useMemo(() => {
    return remappedPayouts.filter(p => p.repId === selectedRepId && p.brandId === selectedBrandId)
  }, [remappedPayouts, selectedRepId, selectedBrandId])

  // Accounts are global (Tony's master list), shared across brands
  const brandAccounts = accounts

  const selectedRep = reps.find(r => r.id === selectedRepId)
  const selectedBrand = brands.find(b => b.id === selectedBrandId)

  const pendingEntries = ledgerEntries.filter(e => !e.payoutId)
  const pendingTotal = pendingEntries.reduce((sum, e) => sum + (e.commission || 0), 0)
  const totalEarnedAllTime = ledgerEntries.reduce((sum, e) => sum + (e.commission || 0), 0)
  const totalPaidOut = totalEarnedAllTime - pendingTotal

  const repTotals = useMemo(() => {
    const totals = {}
    for (const rep of reps) {
      const myEntries = remappedEntries.filter(e => e.repId === rep.id)
      const earned = myEntries.reduce((s, e) => s + (e.commission || 0), 0)
      const pending = myEntries.filter(e => !e.payoutId).reduce((s, e) => s + (e.commission || 0), 0)
      // Brand count: explicit rep_brands plus all real companies for adam
      const explicit = remappedRepBrands.filter(rb => rb.repId === rep.id).length
      const brandCount = rep.id === 'rep-adam' && activeCompanies?.length
        ? Math.max(explicit, brands.length)
        : explicit
      totals[rep.id] = { earned, pending, brandCount }
    }
    return totals
  }, [reps, remappedEntries, remappedRepBrands, activeCompanies, brands])

  const brandTotals = useMemo(() => {
    const totals = {}
    for (const brand of repBrands) {
      const myEntries = remappedEntries.filter(e => e.repId === selectedRepId && e.brandId === brand.id)
      const earned = myEntries.reduce((s, e) => s + (e.commission || 0), 0)
      const pending = myEntries.filter(e => !e.payoutId).reduce((s, e) => s + (e.commission || 0), 0)
      totals[brand.id] = { earned, pending, count: myEntries.length }
    }
    return totals
  }, [repBrands, remappedEntries, selectedRepId])

  // Account totals (cross-rep, cross-brand)
  const accountTotals = useMemo(() => {
    const t = {}
    for (const e of remappedEntries) {
      if (!e.accountId) continue
      const cur = t[e.accountId] || { entries: 0, paid: 0, commission: 0 }
      cur.entries += 1
      cur.paid += e.actualPaid || 0
      cur.commission += e.commission || 0
      t[e.accountId] = cur
    }
    return t
  }, [remappedEntries])

  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [accountSearch, setAccountSearch] = useState('')
  const [accountTerritoryFilter, setAccountTerritoryFilter] = useState('all')

  // Rep ↔ territory mapping (used for routing imported payments)
  const [repTerritories, setRepTerritories] = useState(REP_TERRITORIES)
  const [territoryModalOpen, setTerritoryModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [salesImportOpen, setSalesImportOpen] = useState(false)
  const selectedAccount = accounts.find(a => a.id === selectedAccountId)
  const selectedAccountEntries = useMemo(
    () => remappedEntries.filter(e => e.accountId === selectedAccountId),
    [remappedEntries, selectedAccountId]
  )

  // ===== Actions =====
  const goToRep = (repId) => { setSelectedRepId(repId); setView('brands') }
  const goToBrand = (brandId) => { setSelectedBrandId(brandId); setView('ledger') }
  const goToAccount = (id) => { setSelectedAccountId(id); setView('account-detail') }
  const backToReps = () => { setSelectedRepId(null); setSelectedBrandId(null); setView('reps') }
  const backToBrands = () => { setSelectedBrandId(null); setView('brands') }
  const backToAccounts = () => { setSelectedAccountId(null); setView('accounts') }

  const togglePayout = (id) => setExpandedPayouts(p => ({ ...p, [id]: !p[id] }))

  const addEntry = (entry) => {
    const id = `e-new-${Date.now()}`
    setEntries(prev => [...prev, { ...entry, id, repId: selectedRepId, brandId: selectedBrandId, payoutId: null }])
  }

  const addAccount = (name, territory) => {
    const id = `acct-new-${Date.now()}`
    const acct = { id, name, territory: territory || null }
    setAccounts(prev => [...prev, acct])
    return acct
  }

  const deleteEntry = (id) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const schedulePayout = ({ date, method }) => {
    if (pendingEntries.length === 0) return
    const id = `payout-new-${Date.now()}`
    const amount = pendingTotal
    const newPayout = { id, repId: selectedRepId, brandId: selectedBrandId, date, amount, method }
    // Use original (un-remapped) brandId for setEntries since that's the source state
    const pendingIds = new Set(pendingEntries.map(e => e.id))
    setPayouts(prev => [...prev, newPayout])
    setEntries(prev => prev.map(e => pendingIds.has(e.id) ? { ...e, payoutId: id } : e))
  }

  const updateBrandRate = (brandId, ratePercent) => {
    const decimal = (parseFloat(ratePercent) || 0) / 100
    setRateOverrides(prev => ({ ...prev, [brandId]: decimal }))
  }

  // Look up which rep covers a given territory (first hit wins)
  const repForTerritory = (terr) => {
    if (!terr) return null
    for (const repId of Object.keys(repTerritories)) {
      if (repTerritories[repId].includes(terr)) return repId
    }
    return null
  }

  // Bulk-add imported entries: each row already has resolved repId/brandId/accountId
  const applyImportedEntries = (rows) => {
    const newEntries = rows.map((r, i) => ({
      id: `e-import-${Date.now()}-${i}`,
      repId: r.repId,
      brandId: r.brandId,
      date: r.date,
      accountId: r.accountId,
      accountText: r.accountText,
      invoice: r.invoice,
      method: r.method,
      amountPaid: r.amountPaid,
      shippingCost: r.shippingCost,
      actualPaid: r.actualPaid,
      commission: r.commission,
      notes: r.notes,
      payoutId: null,
      status: r.status || 'paid',
    }))
    setEntries(prev => [...prev, ...newEntries])
  }

  // Look up the rental rep for a brand (works with both mock and real brand ids)
  const rentalRepForBrand = (brandId) => {
    if (RENTAL_REPS[brandId]) return RENTAL_REPS[brandId]
    // Real brand id — match back to mock brand by name then look up
    const realBrand = brands.find(b => b.id === brandId)
    if (!realBrand) return null
    const mockBrand = BRANDS.find(b => b.name.toLowerCase().includes(realBrand.name.split(' ')[0].toLowerCase()))
    return mockBrand ? RENTAL_REPS[mockBrand.id] : null
  }
  const ratesForBrand = (brandId) => {
    if (RENTAL_RATES[brandId]) return RENTAL_RATES[brandId]
    const realBrand = brands.find(b => b.id === brandId)
    if (!realBrand) return null
    const mockBrand = BRANDS.find(b => b.name.toLowerCase().includes(realBrand.name.split(' ')[0].toLowerCase()))
    return mockBrand ? RENTAL_RATES[mockBrand.id] : null
  }

  // ===== Render =====
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
      {/* Top-level tab bar (only on top-level views) */}
      {(view === 'reps' || view === 'accounts') && (
        <div className="flex items-center gap-2 border-b">
          <button
            onClick={() => setView('reps')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              view === 'reps' ? 'border-[#005b5b] text-[#005b5b]' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Reps
          </button>
          <button
            onClick={() => setView('accounts')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              view === 'accounts' ? 'border-[#005b5b] text-[#005b5b]' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Accounts <span className="text-xs text-muted-foreground">({accounts.length})</span>
          </button>
        </div>
      )}

      {/* Breadcrumb (drilled-in views) */}
      {(view === 'brands' || view === 'ledger') && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={backToReps} className="hover:text-foreground transition-colors">Reps</button>
          <ChevronRight className="size-3.5" />
          <button onClick={backToBrands} className={`hover:text-foreground transition-colors ${view === 'brands' ? 'text-foreground font-semibold' : ''}`}>
            {selectedRep?.name}
          </button>
          {selectedBrand && (
            <>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-semibold">{selectedBrand.name}</span>
            </>
          )}
        </div>
      )}
      {view === 'account-detail' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={backToAccounts} className="hover:text-foreground transition-colors">Accounts</button>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground font-semibold">{selectedAccount?.name}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {view === 'reps' && 'Rep Payments'}
          {view === 'accounts' && 'Accounts'}
          {view === 'brands' && `${selectedRep?.name}`}
          {view === 'ledger' && `${selectedRep?.name} • ${selectedBrand?.name}`}
          {view === 'account-detail' && selectedAccount?.name}
        </h1>
        {view === 'reps' && <p className="mt-2 text-muted-foreground">Track commission payments for each rep</p>}
        {view === 'accounts' && <p className="mt-2 text-muted-foreground">{accounts.length} accounts across {new Set(accounts.map(a => a.territory).filter(Boolean)).size} territories</p>}
        {view === 'brands' && <p className="mt-2 text-muted-foreground">Select a brand to view payment history</p>}
        {view === 'ledger' && (
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span>Default rate</span>
            <RateEditor
              value={selectedBrand?.defaultRate}
              editing={editingRate}
              onStartEdit={() => setEditingRate(true)}
              onCancel={() => setEditingRate(false)}
              onSave={(pct) => { updateBrandRate(selectedBrandId, pct); setEditingRate(false) }}
            />
            <span>• All amounts in USD</span>
          </div>
        )}
        {view === 'account-detail' && (
          <p className="mt-2 text-muted-foreground">
            {selectedAccount?.territory || 'No territory'}
            {selectedAccount?.email && <> • <a href={`mailto:${selectedAccount.email}`} className="hover:text-foreground">{selectedAccount.email}</a></>}
            {(selectedAccount?.firstName || selectedAccount?.lastName) && <> • {[selectedAccount.firstName, selectedAccount.lastName].filter(Boolean).join(' ')}</>}
          </p>
        )}
      </div>

      {/* === REPS VIEW === */}
      {view === 'reps' && (
        <>
          <div className="flex items-center justify-end gap-2 -mt-2">
            <Button variant="outline" size="sm" onClick={() => setTerritoryModalOpen(true)}>
              <Map className="size-4 mr-1.5" /> Manage Territories
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSalesImportOpen(true)}>
              <FileSpreadsheet className="size-4 mr-1.5" /> Import Sales (Bright Pearl)
            </Button>
            <Button size="sm" onClick={() => setImportModalOpen(true)} className="bg-[#005b5b] hover:bg-[#004848]">
              <Upload className="size-4 mr-1.5" /> Import Payments
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {reps.map((rep) => {
              const t = repTotals[rep.id]
              const territories = repTerritories[rep.id] || []
              return (
                <Card key={rep.id} onClick={() => goToRep(rep.id)} className="cursor-pointer hover:border-[#005b5b] transition-colors">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-[#005b5b] text-white flex items-center justify-center font-bold">
                        {rep.name.charAt(0)}
                      </div>
                      {rep.name}
                    </CardTitle>
                    <CardDescription>{rep.email}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Brands</span>
                        <span className="font-medium">{t.brandCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Territories</span>
                        <span className="font-medium">{territories.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lifetime earned</span>
                        <span className="font-medium">{fmt(t.earned)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pending payout</span>
                        <span className={`font-bold ${t.pending > 0 ? 'text-[#005b5b]' : ''}`}>{fmt(t.pending)}</span>
                      </div>
                    </div>
                    {territories.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {territories.map(t => (
                          <span key={t} className="inline-flex items-center gap-1 text-[10px] uppercase font-medium px-2 py-0.5 rounded-full bg-[#005b5b]/10 text-[#005b5b]">
                            <MapPin className="size-2.5" /> {t.replace(/\s*\([^)]*\)/, '')}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* === ACCOUNTS VIEW === */}
      {view === 'accounts' && (
        <AccountsView
          accounts={accounts}
          accountTotals={accountTotals}
          search={accountSearch}
          onSearchChange={setAccountSearch}
          territoryFilter={accountTerritoryFilter}
          onTerritoryChange={setAccountTerritoryFilter}
          onSelect={goToAccount}
        />
      )}

      {/* === ACCOUNT DETAIL VIEW === */}
      {view === 'account-detail' && selectedAccount && (
        <AccountDetailView
          account={selectedAccount}
          entries={selectedAccountEntries}
          reps={reps}
          brands={brands}
          onBack={backToAccounts}
        />
      )}

      {/* === BRANDS VIEW === */}
      {view === 'brands' && (
        <>
          <Button variant="ghost" size="sm" onClick={backToReps}>
            <ArrowLeft className="size-4 mr-1" /> Back to all reps
          </Button>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {repBrands.map((brand) => {
              const t = brandTotals[brand.id]
              return (
                <Card key={brand.id} onClick={() => goToBrand(brand.id)} className="cursor-pointer hover:border-[#005b5b] transition-colors">
                  <CardHeader>
                    <CardTitle>{brand.name}</CardTitle>
                    <CardDescription>Default rate {(brand.defaultRate * 100).toFixed(2)}%</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Entries</span>
                        <span className="font-medium">{t.count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lifetime earned</span>
                        <span className="font-medium">{fmt(t.earned)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pending payout</span>
                        <span className={`font-bold ${t.pending > 0 ? 'text-[#005b5b]' : ''}`}>{fmt(t.pending)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* === LEDGER VIEW === */}
      {view === 'ledger' && (
        <>
          <Button variant="ghost" size="sm" onClick={backToBrands}>
            <ArrowLeft className="size-4 mr-1" /> Back to {selectedRep?.name}'s brands
          </Button>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <DollarSign className="size-4 text-[#005b5b]" /> Lifetime earned
                </CardDescription>
                <CardTitle className="text-2xl">{fmt(totalEarnedAllTime)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Banknote className="size-4 text-emerald-600" /> Paid out
                </CardDescription>
                <CardTitle className="text-2xl">{fmt(totalPaidOut)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-[#005b5b] border-2">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Wallet className="size-4 text-[#005b5b]" /> Pending payout
                </CardDescription>
                <CardTitle className="text-2xl text-[#005b5b]">{fmt(pendingTotal)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Pending section */}
          <Card className="border-[#005b5b]/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-[#005b5b]">Pending — not yet paid out</CardTitle>
                  <CardDescription>{pendingEntries.length} entries • {fmt(pendingTotal)}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setAddEntryOpen(true)}>
                    <Plus className="size-4 mr-1" /> Add Entry
                  </Button>
                  <Button size="sm" disabled={pendingEntries.length === 0} onClick={() => setSchedulePayoutOpen(true)} className="bg-[#005b5b] hover:bg-[#004848]">
                    Schedule Payout
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <LedgerTable
                entries={pendingEntries}
                accounts={accounts}
                onDelete={deleteEntry}
              />
            </CardContent>
          </Card>

          {/* Past payouts (newest first) */}
          {ledgerPayouts.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-muted-foreground">Past payouts</h2>
              {[...ledgerPayouts].reverse().map((payout) => {
                const expanded = expandedPayouts[payout.id]
                const payoutEntries = ledgerEntries.filter(e => e.payoutId === payout.id)
                return (
                  <Card key={payout.id}>
                    <CardHeader onClick={() => togglePayout(payout.id)} className="cursor-pointer hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          <div>
                            <CardTitle className="text-base">Payout {fmtDate(payout.date)}</CardTitle>
                            <CardDescription>{payoutEntries.length} entries • {payout.method}</CardDescription>
                          </div>
                        </div>
                        <div className="text-2xl font-bold">{fmt(payout.amount)}</div>
                      </div>
                    </CardHeader>
                    {expanded && (
                      <CardContent>
                        <LedgerTable entries={payoutEntries} accounts={accounts} readOnly />
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>
          )}

          {/* Modals */}
          <AddEntryModal
            open={addEntryOpen}
            onOpenChange={setAddEntryOpen}
            brand={selectedBrand}
            accounts={brandAccounts}
            onAdd={addEntry}
            onAddAccount={addAccount}
          />
          <SchedulePayoutModal
            open={schedulePayoutOpen}
            onOpenChange={setSchedulePayoutOpen}
            pendingCount={pendingEntries.length}
            pendingTotal={pendingTotal}
            onSchedule={schedulePayout}
          />
        </>
      )}

      {/* Tony-portal-level modals (available from reps view) */}
      <TerritoryManagerModal
        open={territoryModalOpen}
        onOpenChange={setTerritoryModalOpen}
        reps={reps}
        accounts={accounts}
        repTerritories={repTerritories}
        onSave={setRepTerritories}
      />
      <ImportPaymentsModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        brands={brands}
        accounts={accounts}
        repForTerritory={repForTerritory}
        reps={reps}
        onApply={applyImportedEntries}
      />
      <ImportSalesModal
        open={salesImportOpen}
        onOpenChange={setSalesImportOpen}
        brands={brands}
        accounts={accounts}
        reps={reps}
        repForTerritory={repForTerritory}
        rentalRepForBrand={rentalRepForBrand}
        ratesForBrand={ratesForBrand}
        onApply={applyImportedEntries}
      />
    </div>
  )
}

// =====================================================================
// AccountsView — Tony's master list of all 439 accounts
// =====================================================================
function AccountsView({ accounts, accountTotals, search, onSearchChange, territoryFilter, onTerritoryChange, onSelect }) {
  const territories = useMemo(() => {
    const set = new Set(accounts.map(a => a.territory).filter(Boolean))
    return Array.from(set).sort()
  }, [accounts])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return accounts.filter(a => {
      if (territoryFilter !== 'all' && a.territory !== territoryFilter) return false
      if (!q) return true
      return (
        a.name.toLowerCase().includes(q) ||
        (a.email || '').toLowerCase().includes(q) ||
        (a.firstName || '').toLowerCase().includes(q) ||
        (a.lastName || '').toLowerCase().includes(q) ||
        (a.territory || '').toLowerCase().includes(q)
      )
    })
  }, [accounts, search, territoryFilter])

  // Group by territory
  const grouped = useMemo(() => {
    const g = {}
    for (const a of filtered) {
      const key = a.territory || 'No territory'
      if (!g[key]) g[key] = []
      g[key].push(a)
    }
    for (const k of Object.keys(g)) g[k].sort((a, b) => a.name.localeCompare(b.name))
    return g
  }, [filtered])

  const territoryOrder = useMemo(() => {
    return Object.keys(grouped).sort((a, b) => {
      if (a === 'No territory') return 1
      if (b === 'No territory') return -1
      return a.localeCompare(b)
    })
  }, [grouped])

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by account, contact, email, territory..."
            className="pl-9"
          />
        </div>
        <select
          value={territoryFilter}
          onChange={(e) => onTerritoryChange(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-transparent text-sm min-w-[260px]"
        >
          <option value="all">All territories ({accounts.length})</option>
          {territories.map(t => (
            <option key={t} value={t}>{t} ({accounts.filter(a => a.territory === t).length})</option>
          ))}
        </select>
      </div>

      {/* Grouped list */}
      <div className="space-y-6">
        {territoryOrder.map((terr) => (
          <div key={terr}>
            <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background py-2 z-[1]">
              <MapPin className="size-4 text-[#005b5b]" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#005b5b]">{terr}</h2>
              <span className="text-xs text-muted-foreground">{grouped[terr].length} {grouped[terr].length === 1 ? 'account' : 'accounts'}</span>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 text-xs uppercase text-muted-foreground border-b">
                    <th className="py-2 px-4 text-left font-medium">Account</th>
                    <th className="py-2 px-4 text-left font-medium">Contact</th>
                    <th className="py-2 px-4 text-left font-medium">Email</th>
                    <th className="py-2 px-4 text-right font-medium">Entries</th>
                    <th className="py-2 px-4 text-right font-medium">Lifetime Paid</th>
                    <th className="py-2 px-4 text-right font-medium">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[terr].map((a) => {
                    const t = accountTotals[a.id]
                    const contact = [a.firstName, a.lastName].filter(Boolean).join(' ')
                    return (
                      <tr key={a.id} onClick={() => onSelect(a.id)} className="border-b last:border-0 cursor-pointer hover:bg-muted/30">
                        <td className="py-2.5 px-4 font-medium">{a.name}</td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground">{contact || '—'}</td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground">{a.email || '—'}</td>
                        <td className="py-2.5 px-4 text-right text-xs">{t?.entries || 0}</td>
                        <td className="py-2.5 px-4 text-right">{t?.paid ? fmt(t.paid) : '—'}</td>
                        <td className={`py-2.5 px-4 text-right font-bold ${t?.commission ? 'text-[#005b5b]' : 'text-muted-foreground'}`}>
                          {t?.commission ? fmt(t.commission) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// =====================================================================
// AccountDetailView — cross-rep, cross-brand history for one account
// =====================================================================
function AccountDetailView({ account, entries, reps, brands, onBack }) {
  const totals = useMemo(() => {
    const paid = entries.reduce((s, e) => s + (e.actualPaid || 0), 0)
    const commission = entries.reduce((s, e) => s + (e.commission || 0), 0)
    return { paid, commission, count: entries.length }
  }, [entries])

  const sorted = useMemo(() => [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || '')), [entries])
  const repName = (id) => reps.find(r => r.id === id)?.name || id
  const brandName = (id) => brands.find(b => b.id === id)?.name || id

  return (
    <>
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4 mr-1" /> Back to all accounts
      </Button>

      {/* Contact card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-4 text-[#005b5b]" />
            {account.territory || 'No territory'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="size-4 text-muted-foreground" />
              <span>{[account.firstName, account.lastName].filter(Boolean).join(' ') || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" />
              {account.email ? <a href={`mailto:${account.email}`} className="hover:text-[#005b5b]">{account.email}</a> : <span>—</span>}
            </div>
            {account.contactId && (
              <div className="text-muted-foreground text-xs">Contact ID: {account.contactId}</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Entries</CardDescription>
            <CardTitle className="text-2xl">{totals.count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lifetime Paid</CardDescription>
            <CardTitle className="text-2xl">{fmt(totals.paid)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Commission Earned</CardDescription>
            <CardTitle className="text-2xl text-[#005b5b]">{fmt(totals.commission)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Entries across reps + brands */}
      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>Across all reps and brands</CardDescription>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">No payments recorded yet for this account.</div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="py-3 px-4 text-left font-medium">Date</th>
                    <th className="py-3 px-4 text-left font-medium">Rep</th>
                    <th className="py-3 px-4 text-left font-medium">Brand</th>
                    <th className="py-3 px-4 text-left font-medium">Invoice</th>
                    <th className="py-3 px-4 text-left font-medium">Method</th>
                    <th className="py-3 px-4 text-right font-medium">Actual</th>
                    <th className="py-3 px-4 text-right font-medium">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e) => (
                    <tr key={e.id} className="border-b">
                      <td className="py-3 px-4 whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="py-3 px-4">{repName(e.repId)}</td>
                      <td className="py-3 px-4">{brandName(e.brandId)}</td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">{e.invoice || '—'}</td>
                      <td className="py-3 px-4 text-xs">{e.method || '—'}</td>
                      <td className="py-3 px-4 text-right">{fmt(e.actualPaid)}</td>
                      <td className={`py-3 px-4 text-right font-bold ${e.commission < 0 ? 'text-red-600' : 'text-[#005b5b]'}`}>{fmt(e.commission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// =====================================================================
// RateEditor — inline % editor for brand default rate
// =====================================================================
function RateEditor({ value, editing, onStartEdit, onCancel, onSave }) {
  const display = value != null ? (value * 100).toFixed(2) : '0.00'
  const [draft, setDraft] = useState(display)
  useEffect(() => { setDraft(display) }, [display, editing])
  if (!editing) {
    return (
      <button onClick={onStartEdit} className="inline-flex items-center gap-1 text-foreground font-semibold hover:text-[#005b5b] transition-colors group">
        {display}%
        <Pencil className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        step="0.01"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSave(draft); if (e.key === 'Escape') onCancel() }}
        className="w-20 h-7 px-2 text-sm rounded border border-input"
      />
      <span>%</span>
      <button onClick={() => onSave(draft)} className="p-1 rounded hover:bg-[#005b5b]/10 text-[#005b5b]">
        <Check className="size-4" />
      </button>
      <button onClick={onCancel} className="p-1 rounded hover:bg-muted text-muted-foreground">
        <X className="size-4" />
      </button>
    </span>
  )
}

// =====================================================================
// LedgerTable
// =====================================================================
function LedgerTable({ entries, accounts, onDelete, readOnly }) {
  if (entries.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-8">No entries yet.</div>
  }
  const accountFor = (e) => e.accountId ? accounts.find(a => a.id === e.accountId) : null
  const accountName = (e) => {
    const acct = accountFor(e)
    return acct?.name || e.accountText || '—'
  }
  const territoryFor = (e) => accountFor(e)?.territory || null
  const sorted = [...entries].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs uppercase text-muted-foreground">
            <th className="py-3 px-4 text-left font-medium">Date</th>
            <th className="py-3 px-4 text-left font-medium">Account</th>
            <th className="py-3 px-4 text-left font-medium">Territory</th>
            <th className="py-3 px-4 text-left font-medium">Invoice</th>
            <th className="py-3 px-4 text-left font-medium">Method</th>
            <th className="py-3 px-4 text-right font-medium">Amount</th>
            <th className="py-3 px-4 text-right font-medium">Shipping</th>
            <th className="py-3 px-4 text-right font-medium">Actual</th>
            <th className="py-3 px-4 text-right font-medium">Commission</th>
            <th className="py-3 px-4 text-left font-medium">Notes</th>
            {!readOnly && <th className="py-3 px-2"></th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr key={e.id} className={`border-b hover:bg-muted/30 ${e.commission < 0 ? 'bg-red-50/50 dark:bg-red-950/20' : e.status === 'expected' ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}>
              <td className="py-3 px-4 whitespace-nowrap">
                {fmtDate(e.date)}
                {e.status === 'expected' && (
                  <span className="ml-2 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Expected</span>
                )}
              </td>
              <td className="py-3 px-4">{accountName(e)}</td>
              <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">{territoryFor(e) || '—'}</td>
              <td className="py-3 px-4 text-xs text-muted-foreground">{e.invoice || '—'}</td>
              <td className="py-3 px-4 text-xs">{e.method || '—'}</td>
              <td className="py-3 px-4 text-right">{fmt(e.amountPaid)}</td>
              <td className="py-3 px-4 text-right text-muted-foreground">{e.shippingCost ? fmt(e.shippingCost) : '—'}</td>
              <td className="py-3 px-4 text-right">{fmt(e.actualPaid)}</td>
              <td className={`py-3 px-4 text-right font-bold ${e.commission < 0 ? 'text-red-600' : 'text-[#005b5b]'}`}>{fmt(e.commission)}</td>
              <td className="py-3 px-4 text-xs text-muted-foreground">{e.notes || '—'}</td>
              {!readOnly && (
                <td className="py-3 px-2">
                  <button onClick={() => onDelete(e.id)} className="text-muted-foreground hover:text-red-600 transition-colors">
                    <Trash2 className="size-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// =====================================================================
// AddEntryModal
// =====================================================================
function AddEntryModal({ open, onOpenChange, brand, accounts, onAdd, onAddAccount }) {
  const today = new Date().toISOString().slice(0, 10)
  const defaultRate = brand?.defaultRate ? (brand.defaultRate * 100).toFixed(2) : '7.00'

  const [date, setDate] = useState(today)
  const [accountId, setAccountId] = useState('')
  const [accountSearch, setAccountSearch] = useState('')
  const [showAccountList, setShowAccountList] = useState(false)
  const [invoice, setInvoice] = useState('')
  const [method, setMethod] = useState('ACH')
  const [checkNum, setCheckNum] = useState('')
  const [amountPaid, setAmountPaid] = useState('')
  const [shippingCost, setShippingCost] = useState('')
  const [rate, setRate] = useState(defaultRate)
  const [notes, setNotes] = useState('')

  const reset = () => {
    setDate(today); setAccountId(''); setAccountSearch(''); setInvoice('')
    setMethod('ACH'); setCheckNum(''); setAmountPaid(''); setShippingCost('')
    setRate(defaultRate); setNotes('')
  }

  // When the modal opens, refresh the rate to the brand's current default
  useEffect(() => {
    if (open) setRate(defaultRate)
  }, [open, defaultRate])

  const close = () => { reset(); onOpenChange(false) }

  const actualPaid = useMemo(() => {
    const a = parseFloat(amountPaid) || 0
    const s = parseFloat(shippingCost) || 0
    return a - s
  }, [amountPaid, shippingCost])

  const commission = useMemo(() => {
    return actualPaid * ((parseFloat(rate) || 0) / 100)
  }, [actualPaid, rate])

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.toLowerCase().trim()
    if (!q) return accounts.slice(0, 8)
    return accounts.filter(a => a.name.toLowerCase().includes(q)).slice(0, 8)
  }, [accounts, accountSearch])

  const exactMatch = accounts.find(a => a.name.toLowerCase() === accountSearch.trim().toLowerCase())

  const submit = () => {
    let finalAccountId = accountId
    let finalAccountText = accountSearch
    if (!finalAccountId && accountSearch.trim() && !exactMatch) {
      const newAcct = onAddAccount(accountSearch.trim())
      finalAccountId = newAcct.id
      finalAccountText = newAcct.name
    } else if (exactMatch) {
      finalAccountId = exactMatch.id
      finalAccountText = exactMatch.name
    }

    onAdd({
      date,
      accountId: finalAccountId,
      accountText: finalAccountText,
      invoice: invoice.trim() || null,
      method: method === 'CHECK' ? `CHECK#${checkNum.trim()}` : method,
      amountPaid: parseFloat(amountPaid) || 0,
      shippingCost: parseFloat(shippingCost) || 0,
      actualPaid,
      commission,
      notes: notes.trim() || null,
    })
    close()
  }

  const canSubmit = (accountSearch.trim() || accountId) && amountPaid

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Payment Entry</DialogTitle>
          <DialogDescription>{brand?.name} • Default rate {defaultRate}%</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2 relative">
              <Label>Account</Label>
              <Input
                value={accountSearch}
                onChange={(e) => { setAccountSearch(e.target.value); setAccountId(''); setShowAccountList(true) }}
                onFocus={() => setShowAccountList(true)}
                onBlur={() => setTimeout(() => setShowAccountList(false), 200)}
                placeholder="Search or type new account..."
              />
              {showAccountList && filteredAccounts.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-64 overflow-y-auto">
                  {filteredAccounts.map(a => (
                    <button
                      key={a.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setAccountId(a.id); setAccountSearch(a.name); setShowAccountList(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    >
                      <div className="font-medium">{a.name}</div>
                      {a.territory && <div className="text-xs text-muted-foreground">{a.territory}</div>}
                    </button>
                  ))}
                  {accountSearch.trim() && !exactMatch && (
                    <div className="px-3 py-2 text-xs text-[#005b5b] border-t bg-muted/30">
                      Hit Add to create new account: "{accountSearch.trim()}"
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Invoice #(s)</Label>
              <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="SI-12345 or comma-separated" />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="flex gap-2">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="flex-1 h-9 px-3 rounded-md border border-input bg-transparent text-sm"
                >
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  <option value="CHECK">Check #</option>
                </select>
                {method === 'CHECK' && (
                  <Input value={checkNum} onChange={(e) => setCheckNum(e.target.value)} placeholder="check #" className="w-32" />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Amount Paid</Label>
              <Input type="number" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Shipping Cost</Label>
              <Input type="number" step="0.01" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Actual (auto)</Label>
              <Input value={actualPaid.toFixed(2)} readOnly className="bg-muted font-medium" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Commission Rate %</Label>
              <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Commission (auto)</Label>
              <Input value={commission.toFixed(2)} readOnly className="bg-[#005b5b]/10 font-bold text-[#005b5b]" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="RETAIL, SPLIT W/CODY, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button disabled={!canSubmit} onClick={submit} className="bg-[#005b5b] hover:bg-[#004848]">Add Entry</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =====================================================================
// SchedulePayoutModal
// =====================================================================
function SchedulePayoutModal({ open, onOpenChange, pendingCount, pendingTotal, onSchedule }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [method, setMethod] = useState('ACH')

  const submit = () => {
    onSchedule({ date, method })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule Payout</DialogTitle>
          <DialogDescription>
            {pendingCount} pending {pendingCount === 1 ? 'entry' : 'entries'} totaling{' '}
            <span className="font-bold text-[#005b5b]">{fmt(pendingTotal)}</span> will be marked as paid out.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Payout Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm"
            >
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} className="bg-[#005b5b] hover:bg-[#004848]">Mark as Paid Out</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =====================================================================
// TerritoryManagerModal — assign territories to reps
// =====================================================================
function TerritoryManagerModal({ open, onOpenChange, reps, accounts, repTerritories, onSave }) {
  const allTerritories = useMemo(() => {
    const s = new Set()
    for (const a of accounts) if (a.territory) s.add(a.territory)
    return Array.from(s).sort()
  }, [accounts])

  const [draft, setDraft] = useState(repTerritories)
  useEffect(() => { if (open) setDraft(repTerritories) }, [open, repTerritories])

  const toggle = (repId, terr) => {
    setDraft(prev => {
      const cur = prev[repId] || []
      const next = cur.includes(terr) ? cur.filter(t => t !== terr) : [...cur, terr]
      // Remove the territory from any other rep (single-rep-per-territory rule)
      const cleaned = {}
      for (const id of Object.keys(prev)) {
        cleaned[id] = id === repId ? next : (prev[id] || []).filter(t => t !== terr)
      }
      return cleaned
    })
  }

  const repForTerr = (terr) => {
    for (const id of Object.keys(draft)) {
      if (draft[id]?.includes(terr)) return id
    }
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Territory Coverage</DialogTitle>
          <DialogDescription>
            Assign each territory to one rep. Imported payments will route to the rep covering the account's territory.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {allTerritories.map((terr) => {
            const assignedRep = repForTerr(terr)
            const accountCount = accounts.filter(a => a.territory === terr).length
            return (
              <div key={terr} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                <div>
                  <div className="text-sm font-medium">{terr}</div>
                  <div className="text-xs text-muted-foreground">{accountCount} accounts</div>
                </div>
                <div className="flex items-center gap-1">
                  {reps.map(rep => {
                    const active = draft[rep.id]?.includes(terr)
                    return (
                      <button
                        key={rep.id}
                        onClick={() => toggle(rep.id, terr)}
                        className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                          active
                            ? 'bg-[#005b5b] text-white'
                            : 'bg-muted text-muted-foreground hover:bg-muted/70'
                        }`}
                      >
                        {rep.name.split(' ')[0]}
                      </button>
                    )
                  })}
                  {!assignedRep && (
                    <span className="text-[10px] uppercase text-amber-600 font-semibold ml-2">Unassigned</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSave(draft); onOpenChange(false) }} className="bg-[#005b5b] hover:bg-[#004848]">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =====================================================================
// ImportPaymentsModal — drop a QuickBooks payment report, route by territory
// =====================================================================
function ImportPaymentsModal({ open, onOpenChange, brands, accounts, repForTerritory, reps, onApply }) {
  const [step, setStep] = useState(1) // 1 pick brand+file, 2 preview, 3 done
  const [brandId, setBrandId] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState(null) // { rows, matched, unmatched, byRep }
  const [parseError, setParseError] = useState(null)

  useEffect(() => {
    if (open) {
      setStep(1); setBrandId(brands[0]?.id || ''); setFileName(''); setPreview(null); setParseError(null)
    }
  }, [open, brands])

  const selectedBrand = brands.find(b => b.id === brandId)

  // Build a fast contactId → account map and a fuzzy name → account map
  const accountByContactId = useMemo(() => {
    const m = {}
    for (const a of accounts) if (a.contactId) m[String(a.contactId)] = a
    return m
  }, [accounts])

  const normalize = (s) => String(s || '').toUpperCase().replace(/['’]/g, '').replace(/\([^)]*\)/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

  const accountByNormName = useMemo(() => {
    const m = {}
    for (const a of accounts) m[normalize(a.name)] = a
    return m
  }, [accounts])

  const findAccount = (rawName, rawContactId) => {
    if (rawContactId != null && rawContactId !== '') {
      const hit = accountByContactId[String(rawContactId).trim()]
      if (hit) return { account: hit, matchedBy: 'contactId' }
    }
    const n = normalize(rawName)
    if (n && accountByNormName[n]) return { account: accountByNormName[n], matchedBy: 'name' }
    if (n) {
      // substring fallback
      for (const key of Object.keys(accountByNormName)) {
        if (key && (key.includes(n) || n.includes(key)) && Math.min(key.length, n.length) >= 4) {
          return { account: accountByNormName[key], matchedBy: 'name' }
        }
      }
    }
    return { account: null, matchedBy: null }
  }

  const parseDate = (v) => {
    if (!v) return null
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    const s = String(v).trim()
    // ISO yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    // mm/dd/yyyy or mm/dd/yy
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (m) {
      let y = parseInt(m[3]); if (y < 100) y += 2000
      return `${y}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`
    }
    // m.d.yy
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
    if (m) {
      let y = parseInt(m[3]); if (y < 100) y += 2000
      return `${y}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`
    }
    return null
  }

  const parseNumber = (v) => {
    if (v == null || v === '') return null
    const n = parseFloat(String(v).replace(/[$,]/g, ''))
    return isNaN(n) ? null : n
  }

  const handleFile = async (file) => {
    if (!file) return
    setParseError(null)
    setFileName(file.name)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
      // Find the header row — first row with any non-null string cell
      let headerIdx = matrix.findIndex(r => r.some(c => c != null && String(c).trim() !== ''))
      if (headerIdx === -1) throw new Error('Empty file')
      const headers = matrix[headerIdx]
      const colMap = detectColumns(headers)
      if (colMap.amount == null && colMap.contactId == null && colMap.accountName == null) {
        throw new Error("Couldn't detect columns. Need at least Customer ID, Customer Name, or Amount.")
      }
      const rate = (selectedBrand?.defaultRate ?? 0.07)
      const parsed = []
      for (let i = headerIdx + 1; i < matrix.length; i++) {
        const r = matrix[i]
        if (!r || r.every(c => c == null || String(c).trim() === '')) continue
        const rawAccount = colMap.accountName != null ? r[colMap.accountName] : null
        const rawContactId = colMap.contactId != null ? r[colMap.contactId] : null
        const amountPaid = parseNumber(colMap.amount != null ? r[colMap.amount] : null) || 0
        if (!rawAccount && !rawContactId && !amountPaid) continue
        const shippingCost = parseNumber(colMap.shipping != null ? r[colMap.shipping] : null) || 0
        const actualPaid = amountPaid - shippingCost
        const commission = actualPaid * rate
        const date = parseDate(colMap.date != null ? r[colMap.date] : null) || new Date().toISOString().slice(0, 10)
        const invoice = colMap.invoice != null ? (r[colMap.invoice] != null ? String(r[colMap.invoice]) : null) : null
        const method = colMap.method != null ? (r[colMap.method] != null ? String(r[colMap.method]).toUpperCase() : 'ACH') : 'ACH'

        const { account, matchedBy } = findAccount(rawAccount, rawContactId)
        const territory = account?.territory || null
        const repId = territory ? repForTerritory(territory) : null

        parsed.push({
          rowIdx: i + 1,
          rawAccount,
          rawContactId,
          accountId: account?.id || null,
          accountText: account?.name || (rawAccount ? String(rawAccount).trim() : null),
          territory,
          matchedBy,
          repId,
          brandId,
          date,
          invoice,
          method,
          amountPaid,
          shippingCost,
          actualPaid,
          commission,
          notes: null,
        })
      }

      const matched = parsed.filter(r => r.accountId)
      const unmatched = parsed.filter(r => !r.accountId)
      const byRep = {}
      for (const r of matched) {
        const k = r.repId || '__unassigned__'
        if (!byRep[k]) byRep[k] = { repId: r.repId, count: 0, commission: 0, paid: 0 }
        byRep[k].count += 1
        byRep[k].commission += r.commission
        byRep[k].paid += r.actualPaid
      }
      setPreview({ rows: parsed, matched, unmatched, byRep })
      setStep(2)
    } catch (err) {
      console.error(err)
      setParseError(err.message || 'Failed to parse file')
    }
  }

  const onConfirm = () => {
    if (!preview) return
    const importable = preview.rows.filter(r => r.accountId && r.repId) // only import matched + routable
    onApply(importable)
    setStep(3)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Payments from QuickBooks</DialogTitle>
          <DialogDescription>
            Drop a payment report (.xlsx or .csv). Rows match by Customer ID, then by name. Each row routes to the rep covering that account's territory.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Which brand is this report for?</Label>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm"
              >
                {brands.map(b => (
                  <option key={b.id} value={b.id}>{b.name} — {(b.defaultRate * 100).toFixed(2)}%</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Payment report file</Label>
              <label className="block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-[#005b5b] hover:bg-[#005b5b]/5 transition-colors">
                <FileSpreadsheet className="size-8 mx-auto mb-2 text-muted-foreground" />
                <div className="text-sm font-medium">{fileName || 'Click to select an .xlsx or .csv file'}</div>
                <div className="text-xs text-muted-foreground mt-1">Auto-detects QuickBooks columns: Customer ID, Customer Name, Num/Invoice, Amount, Shipping, Date</div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>
              {parseError && <p className="text-sm text-red-600">{parseError}</p>}
            </div>
          </div>
        )}

        {step === 2 && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Total rows</CardDescription>
                  <CardTitle className="text-2xl">{preview.rows.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Matched to accounts</CardDescription>
                  <CardTitle className="text-2xl text-[#005b5b]">{preview.matched.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Skipped (unmatched)</CardDescription>
                  <CardTitle className="text-2xl text-amber-600">{preview.unmatched.length}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Routing by territory</h3>
              <div className="border rounded-lg divide-y">
                {Object.values(preview.byRep).map((r, i) => {
                  const repName = r.repId ? (reps.find(rep => rep.id === r.repId)?.name || r.repId) : 'Unassigned territory'
                  return (
                    <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                      <div>
                        <div className={`font-medium ${!r.repId ? 'text-amber-600' : ''}`}>{repName}</div>
                        <div className="text-xs text-muted-foreground">{r.count} entries • {fmt(r.paid)} paid</div>
                      </div>
                      <div className={`font-bold ${r.repId ? 'text-[#005b5b]' : 'text-amber-600'}`}>{fmt(r.commission)}</div>
                    </div>
                  )
                })}
              </div>
              {preview.unmatched.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  {preview.unmatched.length} row{preview.unmatched.length === 1 ? '' : 's'} couldn't be matched to an account and will be skipped. {preview.unmatched.slice(0, 3).map(u => u.rawAccount || `#${u.rowIdx}`).join(', ')}{preview.unmatched.length > 3 ? '…' : ''}
                </p>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#005b5b]/10 flex items-center justify-center mb-3">
              <Check className="size-6 text-[#005b5b]" />
            </div>
            <h3 className="text-lg font-semibold">Imported!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {preview?.matched.filter(r => r.repId).length || 0} entries added to reps' ledgers.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 1 && <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button
                onClick={onConfirm}
                disabled={preview.matched.filter(r => r.repId).length === 0}
                className="bg-[#005b5b] hover:bg-[#004848]"
              >
                Import {preview.matched.filter(r => r.repId).length} entries
              </Button>
            </>
          )}
          {step === 3 && <Button onClick={() => onOpenChange(false)} className="bg-[#005b5b] hover:bg-[#004848]">Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =====================================================================
// ImportSalesModal — drop a Bright Pearl rental zip, route by territory
// with rental/retail commission split logic
// =====================================================================
function normalizeForMatch(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/['’]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// PHASE 1: mock PDF "extraction" from filename + a placeholder line-item shape.
// PHASE 2 (post-demo): replace with a Supabase edge function calling Claude per PDF.
function mockExtractFromFilename(fileName, fileSize) {
  // Filename pattern: "<ACCOUNT NAME> 26:27 NITRO RENTAL CONFIRMATION[ #N].pdf"
  const stripped = fileName.replace(/\.pdf$/i, '').replace(/\s*#\d+\s*$/, '')
  const match = stripped.match(/^(.+?)\s+\d{2}:\d{2}\s+/)
  const accountName = (match ? match[1] : stripped).trim()
  const isRental = /rental/i.test(fileName)
  // Placeholder total derived from file size (so totals look believable in demo);
  // real Claude extraction will pull the actual Total from each PDF.
  const baseTotal = Math.round((fileSize / 100) * 10) / 10
  const orderTotal = Math.max(500, Math.min(60000, baseTotal))
  // Mock: assume entire order is rental if filename says RENTAL CONFIRMATION
  const items = [
    { sku: 'MOCK-RENTAL', name: 'NITRO RENTAL ITEMS', qty: 1, total: orderTotal, isRental },
  ]
  const poMatch = fileName.match(/PO#?(\d+)/i)
  return {
    fileName,
    accountName,
    poNumber: poMatch ? poMatch[1] : null,
    orderDate: new Date().toISOString().slice(0, 10),
    orderTotal,
    items,
    rentalTotal: isRental ? orderTotal : 0,
    retailTotal: isRental ? 0 : orderTotal,
  }
}

function ImportSalesModal({ open, onOpenChange, brands, accounts, reps, repForTerritory, rentalRepForBrand, ratesForBrand, onApply }) {
  const [step, setStep] = useState(1)
  const [brandId, setBrandId] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [extracted, setExtracted] = useState([])
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    if (open) {
      setStep(1)
      // Default to whichever brand is named "Nitro" since this is the rental flow
      const nitro = brands.find(b => /nitro/i.test(b.name))
      setBrandId(nitro?.id || brands[0]?.id || '')
      setExtracting(false); setProgress(0); setExtracted([]); setPreview(null); setError(null); setFileName('')
    }
  }, [open, brands])

  const accountByNorm = useMemo(() => {
    const m = {}
    for (const a of accounts) m[normalizeForMatch(a.name)] = a
    return m
  }, [accounts])

  const findAccount = (rawName) => {
    const n = normalizeForMatch(rawName)
    if (!n) return null
    if (accountByNorm[n]) return accountByNorm[n]
    for (const key of Object.keys(accountByNorm)) {
      if (key && (key.includes(n) || n.includes(key)) && Math.min(key.length, n.length) >= 4) {
        return accountByNorm[key]
      }
    }
    return null
  }

  const handleZip = async (file) => {
    if (!file) return
    setError(null); setFileName(file.name); setExtracting(true); setProgress(0); setExtracted([])
    try {
      const zip = await JSZip.loadAsync(file)
      const pdfFiles = []
      zip.forEach((path, entry) => {
        if (entry.dir) return
        if (path.includes('__MACOSX')) return
        if (path.endsWith('.DS_Store')) return
        if (!path.toLowerCase().endsWith('.pdf')) return
        pdfFiles.push({ path, entry })
      })

      if (pdfFiles.length === 0) {
        throw new Error('No PDFs found in the zip.')
      }

      const results = []
      let done = 0
      for (const f of pdfFiles) {
        const base = f.path.split('/').pop()
        const blob = await f.entry.async('blob')
        const data = mockExtractFromFilename(base, blob.size)
        results.push(data)
        done += 1
        setProgress(Math.round((done / pdfFiles.length) * 100))
      }
      setExtracted(results)

      // Build preview by routing each order
      const rates = ratesForBrand(brandId) || { rentalSplit: 0.10, retail: 0.07, rentalSelf: 0.07 }
      const rentalRepId = rentalRepForBrand(brandId)
      const orderRows = []
      for (const order of results) {
        const account = findAccount(order.accountName)
        const territory = account?.territory || null
        const territoryRepId = territory ? repForTerritory(territory) : null
        const rentalRepIsTerritoryRep = rentalRepId && territoryRepId === rentalRepId

        // Retail portion → 100% to territory rep at retail rate
        if (order.retailTotal > 0 && territoryRepId) {
          orderRows.push({
            kind: 'retail',
            order,
            account,
            territory,
            repId: territoryRepId,
            base: order.retailTotal,
            rate: rates.retail,
            commission: order.retailTotal * rates.retail,
          })
        }
        // Rental portion → split if rental rep ≠ territory rep, else flat 7% to one rep
        if (order.rentalTotal > 0) {
          if (rentalRepIsTerritoryRep) {
            orderRows.push({
              kind: 'rental-self',
              order,
              account,
              territory,
              repId: territoryRepId,
              base: order.rentalTotal,
              rate: rates.rentalSelf,
              commission: order.rentalTotal * rates.rentalSelf,
            })
          } else {
            const half = rates.rentalSplit / 2 // each gets 5%
            if (rentalRepId) {
              orderRows.push({
                kind: 'rental-split-rentalrep',
                order, account, territory,
                repId: rentalRepId,
                base: order.rentalTotal,
                rate: half,
                commission: order.rentalTotal * half,
              })
            }
            if (territoryRepId) {
              orderRows.push({
                kind: 'rental-split-territory',
                order, account, territory,
                repId: territoryRepId,
                base: order.rentalTotal,
                rate: half,
                commission: order.rentalTotal * half,
              })
            }
          }
        }
      }

      // Aggregate per rep
      const byRep = {}
      let unrouted = 0, unroutedAmount = 0
      for (const row of orderRows) {
        if (!row.repId) { unrouted += 1; unroutedAmount += row.commission; continue }
        if (!byRep[row.repId]) byRep[row.repId] = { repId: row.repId, count: 0, base: 0, commission: 0 }
        byRep[row.repId].count += 1
        byRep[row.repId].base += row.base
        byRep[row.repId].commission += row.commission
      }

      const matched = results.filter(r => findAccount(r.accountName))
      const unmatched = results.filter(r => !findAccount(r.accountName))

      setPreview({ orders: results, orderRows, byRep, matched, unmatched, unrouted, unroutedAmount, rentalRepId, rates })
      setStep(2)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to read zip')
    } finally {
      setExtracting(false)
    }
  }

  const onConfirm = () => {
    if (!preview) return
    const importable = preview.orderRows
      .filter(r => r.repId && r.account)
      .map(r => ({
        repId: r.repId,
        brandId,
        date: r.order.orderDate,
        accountId: r.account.id,
        accountText: r.account.name,
        invoice: r.order.poNumber ? `PO#${r.order.poNumber}` : r.order.fileName.replace(/\.pdf$/i, ''),
        method: null,
        amountPaid: r.base,
        shippingCost: 0,
        actualPaid: r.base,
        commission: r.commission,
        notes: r.kind === 'rental-split-rentalrep' ? `Rental split (${(r.rate * 100).toFixed(2)}%)`
             : r.kind === 'rental-split-territory' ? `Rental split (${(r.rate * 100).toFixed(2)}%)`
             : r.kind === 'rental-self' ? 'Rental — own territory'
             : 'Retail',
        status: 'expected',
      }))
    onApply(importable)
    setStep(3)
  }

  const repName = (id) => reps.find(r => r.id === id)?.name || id

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Sales (Bright Pearl)</DialogTitle>
          <DialogDescription>
            Drop a zip of Bright Pearl sales orders. Rental items split 50/50 between the rental rep and the territory rep.
            When the rental rep covers the territory, no split — flat retail rate applies.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Brand</Label>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm"
              >
                {brands.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {brandId && rentalRepForBrand(brandId) && (
                <p className="text-xs text-muted-foreground">
                  Rental rep for this brand: <span className="font-medium text-foreground">{repName(rentalRepForBrand(brandId))}</span>
                  {' • '}Rental: 10% split (5%/5%) · 7% solo · Retail: 7%
                </p>
              )}
              {brandId && !rentalRepForBrand(brandId) && (
                <p className="text-xs text-amber-700">No rental rep configured for this brand. All commission will go to the territory rep at the brand default rate.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Bright Pearl zip file</Label>
              <label className="block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-[#005b5b] hover:bg-[#005b5b]/5 transition-colors">
                <FileSpreadsheet className="size-8 mx-auto mb-2 text-muted-foreground" />
                <div className="text-sm font-medium">{fileName || 'Click to select a .zip of sales-order PDFs'}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Today: account name pulled from filename. Production: Claude reads each PDF for line-item rental/retail breakdown.
                </div>
                <input
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => handleZip(e.target.files?.[0])}
                />
              </label>
              {extracting && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Reading PDFs… {progress}%</div>
                  <div className="h-2 bg-muted rounded overflow-hidden">
                    <div className="h-full bg-[#005b5b] transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          </div>
        )}

        {step === 2 && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Sales orders</CardDescription>
                  <CardTitle className="text-2xl">{preview.orders.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Matched to accounts</CardDescription>
                  <CardTitle className="text-2xl text-[#005b5b]">{preview.matched.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Unmatched</CardDescription>
                  <CardTitle className="text-2xl text-amber-600">{preview.unmatched.length}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Commission split by rep</h3>
              <div className="border rounded-lg divide-y">
                {Object.values(preview.byRep).map((r, i) => {
                  const isRental = r.repId === preview.rentalRepId
                  return (
                    <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {repName(r.repId)}
                          {isRental && <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#005b5b]/10 text-[#005b5b]">Rental Rep</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{r.count} entries • {fmt(r.base)} base</div>
                      </div>
                      <div className="text-lg font-bold text-[#005b5b]">{fmt(r.commission)}</div>
                    </div>
                  )
                })}
                {preview.unrouted > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 text-sm bg-amber-50/50">
                    <div>
                      <div className="font-medium text-amber-700">Unassigned territory</div>
                      <div className="text-xs text-amber-700">{preview.unrouted} entries — assign a rep to cover the territory first</div>
                    </div>
                    <div className="text-lg font-bold text-amber-700">{fmt(preview.unroutedAmount)}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-3 space-y-1">
              <div>• Entries import as <span className="font-semibold text-amber-700">Expected</span> — they flip to Paid when QuickBooks payment matches.</div>
              <div>• Rental orders going to a territory ≠ Adam: 5% to Adam + 5% to territory rep.</div>
              <div>• Rental orders in Adam's own territory (PNW/NORCAL/SW): flat 7% to Adam — no split.</div>
              {preview.unmatched.length > 0 && (
                <div className="text-amber-700">• {preview.unmatched.length} order{preview.unmatched.length === 1 ? '' : 's'} couldn't match to an account: {preview.unmatched.slice(0, 3).map(u => u.accountName).join(', ')}{preview.unmatched.length > 3 ? '…' : ''}</div>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#005b5b]/10 flex items-center justify-center mb-3">
              <Check className="size-6 text-[#005b5b]" />
            </div>
            <h3 className="text-lg font-semibold">Sales orders imported</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Expected commission entries created. They'll flip to Paid when QuickBooks payments come in.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 1 && <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button
                onClick={onConfirm}
                disabled={preview.orderRows.filter(r => r.repId && r.account).length === 0}
                className="bg-[#005b5b] hover:bg-[#004848]"
              >
                Import {preview.orderRows.filter(r => r.repId && r.account).length} expected entries
              </Button>
            </>
          )}
          {step === 3 && <Button onClick={() => onOpenChange(false)} className="bg-[#005b5b] hover:bg-[#004848]">Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PaymentsTracker
