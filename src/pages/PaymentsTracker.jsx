import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from 'react'
import { ArrowLeft, ChevronRight, ChevronDown, Plus, Minus, DollarSign, Banknote, Wallet, Trash2, Pencil, Check, X, Search, MapPin, Mail, User, Upload, Map as MapIcon, FileSpreadsheet, AlertTriangle, Info } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useCompanies } from '@/context/CompanyContext'
import JSZip from 'jszip'
import { REPS, BRANDS, REP_BRANDS, REP_TERRITORIES, RENTAL_REPS, RENTAL_RATES, ACCOUNTS, ENTRIES, PAYOUTS, TERRITORIES, STARTING_ADJUSTMENTS, ADJUSTMENT_ANCHOR, ADJUSTMENT_ANCHORS, EARNED_SNAPSHOTS } from '@/lib/paymentsDemoData'
import { computeCommissions, aggregateByRep } from '@/lib/commissionEngine'
import { lookupBrand } from '@/lib/catalogs'
import { shouldIgnoreCustomer, isWsrPostPaymentCustomer } from '@/lib/customerIgnoreList'
import { loadLineItems, saveLineItems as idbSaveLineItems, clearLineItems as idbClearLineItems } from '@/lib/lineItemsStore'
import { loadPaymentsTx, savePaymentsTx as idbSavePaymentsTx, clearPaymentsTx as idbClearPaymentsTx } from '@/lib/paymentsStore'
import { loadBpOverrides, mergeBpOverrides as idbMergeBpOverrides, clearBpOverrides as idbClearBpOverrides } from '@/lib/bpOverridesStore'
import { loadWsrRemittances, addWsrRemittance as idbAddWsrRemittance, clearWsrRemittances as idbClearWsrRemittances } from '@/lib/wsrRemittanceStore'
import { exportRepReportPDF, exportRepReportXLSX } from '@/lib/repReport'
import { supabase } from '@/lib/supabase'
import { pget, pset, pdel } from '@/lib/portalStore'
import { migrateLocalToServer } from '@/lib/portalMigrate'

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
  // first word in mock contained in real name (split on whitespace AND slash,
  // so combined names like "Autumn/Corduroy" still match a real "Autumn" company)
  const firstWord = mockName.split(/[\s/]+/)[0]
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

// localStorage key for persisting Manage Territories modal edits across refresh.
// Portal datasets (invoices, line items, payments, WSR, payouts, territories,
// AR snapshots) persist to Supabase via portal_data (see portalStore.js) so
// they're shared across logins. Dataset keys are defined at each use site.

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

  const [view, setView] = useState('reps') // 'reps' | 'accounts' | 'invoices' | 'rep-ledger' | 'brands' | 'ledger' | 'account-detail'
  const [selectedRepId, setSelectedRepId] = useState(null)
  // Rep ledger surfaces its export/email actions here so the buttons can live
  // in the page header row next to the "<Rep> — Commission Ledger" title.
  const [ledgerActions, setLedgerActions] = useState(null)
  const registerLedgerActions = useCallback((a) => setLedgerActions(a), [])
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

  // Per-rep brand list — used to render brand pills on rep cards.
  // Walks REP_BRANDS pairs; for each, prefer the real Supabase company match,
  // and fall back to the mock BRANDS entry so unmatched brands (e.g. EIVY when
  // there's no real Eivy company) still render instead of being dropped silently.
  const brandsByRep = useMemo(() => {
    const map = {}
    for (const rep of reps) {
      const list = REP_BRANDS
        .filter(rb => rb.repId === rep.id)
        .map(rb => {
          const realId = mockBrandToReal[rb.brandId]
          const real = realId ? brands.find(b => b.id === realId) : null
          return real || BRANDS.find(b => b.id === rb.brandId)
        })
        .filter(Boolean)
      // Adam (the seed rep) gets ALL the user's real brands by default
      if (rep.id === 'rep-adam' && activeCompanies?.length) {
        const seen = new Set(list.map(b => b.id))
        for (const b of brands) if (!seen.has(b.id)) list.push(b)
      }
      map[rep.id] = list
    }
    return map
  }, [reps, brands, mockBrandToReal, activeCompanies])

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

  // Rep ↔ territory mapping. Persisted to Supabase (portal_data) so Manage
  // Territories edits are shared across logins. Starts from the seed default
  // and is overwritten once the stored mapping loads.
  const [repTerritories, setRepTerritoriesState] = useState(REP_TERRITORIES)
  useEffect(() => {
    pget('rep_territories').then(v => { if (v && typeof v === 'object') setRepTerritoriesState(v) }).catch(() => {})
  }, [])
  const setRepTerritories = (next) => {
    setRepTerritoriesState(prev => {
      const value = typeof next === 'function' ? next(prev) : next
      pset('rep_territories', value).catch(() => {})
      return value
    })
  }
  const resetRepTerritories = () => {
    pdel('rep_territories').catch(() => {})
    setRepTerritoriesState(REP_TERRITORIES)
  }

  // Lifted from InvoicesView so other views (e.g. AccountDetailView) can
  // navigate to a specific customer's drill-down. `invoiceDrillHighlight` is
  // an optional Num — when set, the drill-in scrolls to and flashes that row.
  const [invoiceDrillCustomer, setInvoiceDrillCustomer] = useState(null)
  const [invoiceDrillHighlight, setInvoiceDrillHighlight] = useState(null)

  // Invoices (lifted from InvoicesView so AccountsView can derive Open Balance).
  // Persisted to Supabase (portal_data); loaded async on mount.
  const [invoicesRaw, setInvoicesState] = useState([])
  const [invoicesMeta, setInvoicesMetaState] = useState(null)
  useEffect(() => {
    Promise.all([pget('invoices'), pget('invoices_meta')]).then(([inv, meta]) => {
      if (Array.isArray(inv)) setInvoicesState(inv)
      if (meta) setInvoicesMetaState(meta)
    }).catch(() => {})
  }, [])
  const saveInvoices = (rows, meta) => {
    setInvoicesState(rows)
    setInvoicesMetaState(meta)
    pset('invoices', rows).catch(() => {})
    pset('invoices_meta', meta).catch(() => {})
    setLastInvoicesImport({ mode: 'replace', added: rows.length, updated: 0, total: rows.length })
  }
  const clearInvoicesState = () => {
    setInvoicesState([])
    setInvoicesMetaState(null)
    pdel('invoices').catch(() => {})
    pdel('invoices_meta').catch(() => {})
  }
  // Append: merge by Num, incoming rows replace existing rows with the same Num.
  // Returns { added, updated, total } so the UI can show a summary.
  const [lastInvoicesImport, setLastInvoicesImport] = useState(null)
  const appendInvoices = (rows, meta) => {
    const map = new Map(invoicesRaw.map(r => [r.num, r]))
    let added = 0, updated = 0, wsrPreserved = 0
    for (const r of rows) {
      if (!r?.num) continue
      if (map.has(r.num)) {
        updated++
        const existing = map.get(r.num)
        // WSR special case: when QB renames a member's invoice to "WSR" on
        // payment, preserve the original member name from our prior record so
        // territory routing & customer matching survive the rename.
        if (isWsrPostPaymentCustomer(r.customer) && !isWsrPostPaymentCustomer(existing.customer)) {
          map.set(r.num, { ...r, customer: existing.customer })
          wsrPreserved++
        } else {
          map.set(r.num, r)
        }
      } else {
        added++
        map.set(r.num, r)
      }
    }
    const merged = Array.from(map.values())
    const newMeta = {
      ...meta,
      count: merged.length,
      lastAppendCount: rows.length,
      lastAppendFile: meta?.fileName,
    }
    setInvoicesState(merged)
    setInvoicesMetaState(newMeta)
    pset('invoices', merged).catch(() => {})
    pset('invoices_meta', newMeta).catch(() => {})
    setLastInvoicesImport({ mode: 'append', added, updated, wsrPreserved, total: merged.length })
  }

  // Invoice line items — separate CSV ("items by invoice"), joined to invoices
  // by `num`. Used for SKU → brand attribution. Stored in IndexedDB (legacy
  // localStorage data is auto-migrated on first load).
  const [lineItems, setLineItemsState] = useState([])
  const [lineItemsMeta, setLineItemsMetaState] = useState(null)
  useEffect(() => {
    loadLineItems().then(({ items, meta }) => {
      setLineItemsState(items)
      setLineItemsMetaState(meta)
    })
  }, [])
  const [lineItemsStorageError, setLineItemsStorageError] = useState(null)
  const [lastLineItemsImport, setLastLineItemsImport] = useState(null)
  const persistLineItems = (rows, meta) => {
    setLineItemsState(rows)
    setLineItemsMetaState(meta)
    idbSaveLineItems(rows, meta)
      .then(() => setLineItemsStorageError(null))
      .catch((e) => {
        setLineItemsStorageError(
          `Saved in memory for this session, but IndexedDB save failed (${e?.message || e}). Data will not survive a browser refresh.`
        )
      })
  }
  const saveLineItems = (rows, meta) => {
    persistLineItems(rows, meta)
    setLastLineItemsImport({
      mode: 'replace',
      invoicesAdded: new Set(rows.map(r => r.num)).size,
      invoicesUpdated: 0,
      itemsTotal: rows.length,
    })
  }
  // Append line items: incoming rows for a given Num completely replace any
  // existing rows for that Num. (Keeps the join key consistent — one invoice
  // re-uploaded = the new file's items win wholesale.)
  const appendLineItems = (rows, meta) => {
    const incomingByNum = new Map()
    for (const item of rows) {
      if (!item?.num) continue
      if (!incomingByNum.has(item.num)) incomingByNum.set(item.num, [])
      incomingByNum.get(item.num).push(item)
    }
    const existingNums = new Set(lineItems.map(item => item.num).filter(Boolean))
    let invoicesUpdated = 0, invoicesAdded = 0
    for (const num of incomingByNum.keys()) {
      if (existingNums.has(num)) invoicesUpdated++
      else invoicesAdded++
    }
    const kept = lineItems.filter(item => !incomingByNum.has(item.num))
    const merged = [...kept, ...rows]
    const newMeta = {
      ...meta,
      count: merged.length,
      invoiceCount: new Set(merged.map(r => r.num)).size,
      lastAppendItemCount: rows.length,
      lastAppendFile: meta?.fileName,
    }
    persistLineItems(merged, newMeta)
    setLastLineItemsImport({
      mode: 'append',
      invoicesAdded,
      invoicesUpdated,
      itemsTotal: merged.length,
    })
  }
  const clearLineItemsState = () => {
    setLineItemsState([])
    setLineItemsMetaState(null)
    idbClearLineItems().catch(() => {})
  }

  // QB Payments transaction CSV — single-file replace semantics.
  const [paymentsTx, setPaymentsTxState] = useState([])
  const [paymentsTxMeta, setPaymentsTxMetaState] = useState(null)
  useEffect(() => {
    loadPaymentsTx().then(({ transactions, meta }) => {
      setPaymentsTxState(transactions)
      setPaymentsTxMetaState(meta)
    }).catch(() => {})
  }, [])
  const savePaymentsTxState = (transactions, meta) => {
    setPaymentsTxState(transactions)
    setPaymentsTxMetaState(meta)
    idbSavePaymentsTx(transactions, meta).catch(() => {})
  }
  const clearPaymentsTxState = () => {
    setPaymentsTxState([])
    setPaymentsTxMetaState(null)
    idbClearPaymentsTx().catch(() => {})
  }

  // Brightpearl invoice → original customer name overrides. Merge semantics.
  const [bpOverrides, setBpOverridesState] = useState({})
  const [bpOverridesMeta, setBpOverridesMetaState] = useState(null)
  useEffect(() => {
    loadBpOverrides().then(({ overrides, meta }) => {
      setBpOverridesState(overrides)
      setBpOverridesMetaState(meta)
    }).catch(() => {})
  }, [])
  const mergeBpOverridesState = async (newOverrides, meta) => {
    const merged = await idbMergeBpOverrides(newOverrides, meta)
    setBpOverridesState(merged)
    setBpOverridesMetaState(meta)
  }
  const clearBpOverridesState = () => {
    setBpOverridesState({})
    setBpOverridesMetaState(null)
    idbClearBpOverrides().catch(() => {})
  }

  // WSR ACH payment remittances — one upload per check. Dedupe by checkNumber.
  const [wsrRemittances, setWsrRemittancesState] = useState([])
  useEffect(() => {
    loadWsrRemittances().then(setWsrRemittancesState).catch(() => {})
  }, [])
  const addWsrRemittanceState = async (rec) => {
    const next = await idbAddWsrRemittance(rec)
    setWsrRemittancesState(next)
  }
  const clearWsrRemittancesState = () => {
    setWsrRemittancesState([])
    idbClearWsrRemittances().catch(() => {})
  }

  // ───────────────────────────────────────────────────────────────────
  // Derived: WSR remittance → per-invoice payment events + memberId chain
  // ───────────────────────────────────────────────────────────────────
  // Map<invoiceNum, Array<{checkDate, checkNumber, amountPaid, memberId}>>.
  // SC-prefix entries (credit memos) are excluded.
  const wsrInvoicePayments = useMemo(() => {
    const m = new Map()
    for (const r of wsrRemittances || []) {
      for (const inv of r.invoices || []) {
        if (!inv.invoiceNum) continue
        if (/^SC/i.test(inv.invoiceNum)) continue
        if (!m.has(inv.invoiceNum)) m.set(inv.invoiceNum, [])
        m.get(inv.invoiceNum).push({
          checkDate: r.checkDate,
          checkNumber: r.checkNumber,
          amountPaid: inv.amountPaid || 0,
          memberId: inv.memberId || '',
        })
      }
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.checkDate || '').localeCompare(b.checkDate || ''))
    return m
  }, [wsrRemittances])

  // Chain: WSR remittance gives invoiceNum→memberId; BP overrides give
  // invoiceNum→customerName. Where both exist we learn memberId→customer,
  // letting us backfill the customer for WSR invoices that aren't in BP.
  const wsrMemberToCustomer = useMemo(() => {
    const m = new Map()
    for (const [invNum, events] of wsrInvoicePayments.entries()) {
      const bpName = bpOverrides?.[invNum]
      if (!bpName) continue
      for (const ev of events) {
        if (ev.memberId && !m.has(ev.memberId)) m.set(ev.memberId, bpName)
      }
    }
    return m
  }, [wsrInvoicePayments, bpOverrides])

  // Apply BP overrides FIRST, then WSR member chain. Only swaps the
  // customer when the current value reads as a WSR-renamed token. Every
  // downstream consumer (engine, account balances, unmatched banner, etc.)
  // sees the recovered name.
  const invoices = useMemo(() => {
    const bpEmpty = !bpOverrides || Object.keys(bpOverrides).length === 0
    const chainEmpty = wsrMemberToCustomer.size === 0
    if (bpEmpty && chainEmpty) return invoicesRaw
    return invoicesRaw.map(inv => {
      if (!isWsrPostPaymentCustomer(inv.customer)) return inv
      const bpName = bpOverrides?.[inv.num]
      if (bpName) return { ...inv, customer: bpName }
      const events = wsrInvoicePayments.get(inv.num)
      if (events?.length) {
        const chained = wsrMemberToCustomer.get(events[0].memberId)
        if (chained) return { ...inv, customer: chained }
      }
      return inv
    })
  }, [invoicesRaw, bpOverrides, wsrInvoicePayments, wsrMemberToCustomer])
  const bpOverridesAppliedCount = useMemo(() => {
    if (!bpOverrides || Object.keys(bpOverrides).length === 0) return 0
    let count = 0
    for (const inv of invoicesRaw) {
      if (isWsrPostPaymentCustomer(inv.customer) && bpOverrides[inv.num]) count++
    }
    return count
  }, [invoicesRaw, bpOverrides])
  const wsrRemittanceAppliedCount = useMemo(() => {
    let count = 0
    for (const inv of invoicesRaw) {
      if (!isWsrPostPaymentCustomer(inv.customer)) continue
      if (bpOverrides?.[inv.num]) continue
      const events = wsrInvoicePayments.get(inv.num)
      if (events?.length && wsrMemberToCustomer.get(events[0].memberId)) count++
    }
    return count
  }, [invoicesRaw, bpOverrides, wsrInvoicePayments, wsrMemberToCustomer])

  // Commission payouts (Tony paid Rep $X on date Y). Persisted to Supabase
  // (portal_data); loaded async on mount.
  const [commissionPayouts, setCommissionPayoutsState] = useState([])
  useEffect(() => {
    pget('commission_payouts').then(v => { if (Array.isArray(v)) setCommissionPayoutsState(v) }).catch(() => {})
  }, [])
  const persistCommissionPayouts = (next) => {
    setCommissionPayoutsState(next)
    pset('commission_payouts', next).catch(() => {})
  }
  const addCommissionPayout = (payout) => {
    const entry = {
      id: `cpayout-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...payout,
    }
    persistCommissionPayouts([...commissionPayouts, entry])
  }
  const updateCommissionPayout = (id, updates) => {
    persistCommissionPayouts(commissionPayouts.map(p => p.id === id ? { ...p, ...updates } : p))
  }
  const deleteCommissionPayout = (id) => {
    persistCommissionPayouts(commissionPayouts.filter(p => p.id !== id))
  }
  const [recordPayoutOpen, setRecordPayoutOpen] = useState(false)
  const [prefilledPayoutRepId, setPrefilledPayoutRepId] = useState(null)
  const [editingPayout, setEditingPayout] = useState(null)
  const openRecordPayout = (repId = null) => {
    setEditingPayout(null)
    setPrefilledPayoutRepId(repId)
    setRecordPayoutOpen(true)
  }
  const openEditPayout = (payout) => {
    setEditingPayout(payout)
    setPrefilledPayoutRepId(payout.repId)
    setRecordPayoutOpen(true)
  }

  // Run the commission engine over the current invoices + line items + accounts.
  // Recomputes when any input changes. Cheap to render even with thousands of
  // entries because aggregations are memoized too.
  const commissionResult = useMemo(
    () => computeCommissions({ invoices, lineItems, accounts: ACCOUNTS, repTerritories, season: '2025-26' }),
    [invoices, lineItems, repTerritories]
  )
  const aggregatesByRep = useMemo(
    () => aggregateByRep(commissionResult.entries),
    [commissionResult]
  )

  // ───────────────────────────────────────────────────────────────────
  // Per-invoice payment EVENTS: Map<invoiceNum, Array<{date, amount, source}>>.
  // Priority:
  //   1. WSR remittance (authoritative — per-check allocation)
  //   2. Auto-matcher with 3-phase matching:
  //      Phase A — single payment matches invoice paid portion (within $5)
  //      Phase B — N identical installments sum to paid portion (Valians)
  //      Phase C — small subset of distinct payments sums to paid portion
  // Anything we can't resolve stays absent (strict no-manual-data policy).
  // ───────────────────────────────────────────────────────────────────
  const paymentEventsByInvoiceNum = useMemo(() => {
    const result = new Map()
    const add = (num, ev) => {
      if (!result.has(num)) result.set(num, [])
      result.get(num).push(ev)
    }
    // 1. WSR remittance — push each line as an event.
    for (const [num, events] of wsrInvoicePayments.entries()) {
      for (const ev of events) add(num, { date: ev.checkDate, amount: ev.amountPaid || 0, source: 'wsr' })
    }
    if (!paymentsTx?.length || !invoices?.length) {
      for (const arr of result.values()) arr.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      return result
    }
    const norm = (s) => String(s || '')
      .toUpperCase()
      .replace(/['']/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+-\s.*$/, '')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const paymentsByCust = new Map()
    for (const tx of paymentsTx) {
      if (tx.type !== 'Payment') continue
      if (!tx.customer || !tx.date) continue
      const k = norm(tx.customer)
      if (!paymentsByCust.has(k)) paymentsByCust.set(k, [])
      paymentsByCust.get(k).push(tx)
    }
    for (const arr of paymentsByCust.values()) arr.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    const invoicesByCust = new Map()
    for (const inv of invoices) {
      if (!inv.customer || !inv.num || !inv.amount) continue
      const paidPortion = (inv.amount || 0) - (inv.openBalance || 0)
      if (paidPortion <= 0.005) continue
      if (result.has(inv.num)) continue   // WSR already covers this invoice
      const k = norm(inv.customer)
      if (!invoicesByCust.has(k)) invoicesByCust.set(k, [])
      invoicesByCust.get(k).push({ ...inv, paidPortion })
    }
    for (const [custKey, invs] of invoicesByCust.entries()) {
      const payments = paymentsByCust.get(custKey) || []
      if (!payments.length) continue
      invs.sort((a, b) => b.paidPortion - a.paidPortion)
      const used = new Set()
      // Phase A: single-payment match.
      for (const inv of invs) {
        const target = inv.paidPortion
        let bestIdx = -1, bestDiff = Infinity
        for (let i = 0; i < payments.length; i++) {
          if (used.has(i)) continue
          const diff = Math.abs((payments[i].amount || 0) - target)
          if (diff <= 5 && diff < bestDiff) { bestIdx = i; bestDiff = diff }
        }
        if (bestIdx >= 0) {
          const p = payments[bestIdx]
          add(inv.num, { date: p.date, amount: p.amount || 0, source: 'auto-single' })
          used.add(bestIdx)
        }
      }
      // Phase B: N identical installments sum to paid portion.
      for (const inv of invs) {
        if (result.has(inv.num)) continue
        const target = inv.paidPortion
        const byAmt = new Map()
        for (let i = 0; i < payments.length; i++) {
          if (used.has(i)) continue
          const cents = Math.round((payments[i].amount || 0) * 100)
          if (!byAmt.has(cents)) byAmt.set(cents, [])
          byAmt.get(cents).push(i)
        }
        for (const [cents, indices] of byAmt) {
          const amt = cents / 100
          if (amt <= 0) continue
          const n = Math.round(target / amt)
          if (n < 2 || n > indices.length) continue
          if (Math.abs(n * amt - target) > 5) continue
          for (let j = 0; j < n; j++) {
            const p = payments[indices[j]]
            add(inv.num, { date: p.date, amount: p.amount || 0, source: 'auto-installments' })
            used.add(indices[j])
          }
          break
        }
      }
      // Phase C: small subset of distinct payments summing to paid portion.
      for (const inv of invs) {
        if (result.has(inv.num)) continue
        const target = inv.paidPortion
        const available = []
        for (let i = 0; i < payments.length; i++) if (!used.has(i)) available.push(i)
        if (available.length === 0 || available.length > 12) continue
        const n = available.length
        let bestMask = 0, bestDiff = Infinity, bestCount = Infinity
        for (let mask = 1; mask < (1 << n); mask++) {
          let sum = 0, count = 0
          for (let i = 0; i < n; i++) {
            if (mask & (1 << i)) { sum += payments[available[i]].amount || 0; count++ }
          }
          const diff = Math.abs(sum - target)
          if (diff <= 5 && (diff < bestDiff || (diff === bestDiff && count < bestCount))) {
            bestMask = mask
            bestDiff = diff
            bestCount = count
          }
        }
        if (bestMask) {
          for (let i = 0; i < n; i++) {
            if (bestMask & (1 << i)) {
              const idx = available[i]
              const p = payments[idx]
              add(inv.num, { date: p.date, amount: p.amount || 0, source: 'auto-subset' })
              used.add(idx)
            }
          }
        }
      }
      // Phase D: one payment settles a GROUP of invoices (a single lump-sum
      // check covering several invoices at once — the inverse of Phase C).
      // Match an unused payment to a subset of still-unmatched invoices whose
      // paid portions sum to the payment amount, then date each of those
      // invoices to that payment. Without this, a customer who clears several
      // invoices with one check leaves them all unmatched (no payment date),
      // and their commission never flows into the rep's earned/available.
      for (let pi = 0; pi < payments.length; pi++) {
        if (used.has(pi)) continue
        const payAmt = payments[pi].amount || 0
        if (payAmt <= 0) continue
        const open = invs.filter(inv => !result.has(inv.num))
        if (open.length < 2 || open.length > 14) continue   // single-invoice case is Phase A's job
        const m = open.length
        let bestMask = 0, bestDiff = Infinity, bestCount = -1
        for (let mask = 1; mask < (1 << m); mask++) {
          let sum = 0, count = 0
          for (let i = 0; i < m; i++) if (mask & (1 << i)) { sum += open[i].paidPortion; count++ }
          if (count < 2) continue   // need 2+ invoices to be a "group"
          const diff = Math.abs(sum - payAmt)
          // Prefer the closest sum; break ties toward covering MORE invoices.
          if (diff <= 5 && (diff < bestDiff || (diff === bestDiff && count > bestCount))) {
            bestMask = mask; bestDiff = diff; bestCount = count
          }
        }
        if (bestMask) {
          for (let i = 0; i < m; i++) {
            if (bestMask & (1 << i)) add(open[i].num, { date: payments[pi].date, amount: open[i].paidPortion, source: 'auto-group' })
          }
          used.add(pi)
        }
      }
    }
    for (const arr of result.values()) arr.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    return result
  }, [paymentsTx, invoices, wsrInvoicePayments])

  // Backwards-compatible single-date lookup — uses the LATEST event date.
  const paymentDatesByInvoiceNum = useMemo(() => {
    const m = new Map()
    for (const [num, events] of paymentEventsByInvoiceNum.entries()) {
      if (events.length > 0) m.set(num, events[events.length - 1].date)
    }
    return m
  }, [paymentEventsByInvoiceNum])

  // Helper for YTD math: normalize any date string to YYYY-MM-DD.
  const toIsoDateAtParent = (s) => {
    if (!s) return ''
    const str = String(s)
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
    if (!m) return ''
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${yyyy}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  const ytdStart = `${new Date().getFullYear()}-01-01`

  // YTD payouts per rep — only payouts dated in the current calendar year.
  const payoutsByRep = useMemo(() => {
    const m = {}
    for (const p of commissionPayouts) {
      const iso = toIsoDateAtParent(p.date)
      if (!iso || iso < ytdStart) continue
      m[p.repId] = (m[p.repId] || 0) + (p.amount || 0)
    }
    return m
  }, [commissionPayouts, ytdStart])

  // YTD earned per rep — pro-rated commission across payment events whose
  // payment date is in the current calendar year.
  const earnedYtdByRep = useMemo(() => {
    const out = {}
    for (const rep of reps) {
      const agg = aggregatesByRep[rep.id]
      if (!agg?.byInvoice) { out[rep.id] = 0; continue }
      let earned = 0
      for (const [invNum, inv] of Object.entries(agg.byInvoice)) {
        const events = paymentEventsByInvoiceNum.get(invNum) || []
        if (!events.length) continue
        const fullAmount = inv.amount || 0
        const fullCommission = inv.commission || 0
        for (const ev of events) {
          const pIso = toIsoDateAtParent(ev.date)
          if (!pIso || pIso < ytdStart) continue
          const fraction = fullAmount > 0 ? (ev.amount || 0) / fullAmount : 0
          earned += fullCommission * fraction
        }
      }
      out[rep.id] = earned
    }
    return out
  }, [reps, aggregatesByRep, paymentEventsByInvoiceNum, ytdStart])

  // Per-rep commission earned from matched payment events dated AFTER the
  // rep's adjustment anchor. This is the earned half of Available: the starting
  // adjustment captures everything up to the anchor, and this captures what
  // has accrued since. The anchor is per-rep (ADJUSTMENT_ANCHORS override, else
  // the global ADJUSTMENT_ANCHOR) so reps baselined on different dates calculate
  // forward from their own date. Fixed cutoff (unlike a moving last-payout
  // date) so recording a payout doesn't erase earned commission — payouts
  // subtract via paidOutSinceAnchorByRep instead.
  const earnedSinceAnchorByRep = useMemo(() => {
    const out = {}
    for (const rep of reps) {
      const anchor = ADJUSTMENT_ANCHORS[rep.id] || ADJUSTMENT_ANCHOR
      const agg = aggregatesByRep[rep.id]
      if (!agg?.byInvoice) { out[rep.id] = 0; continue }
      let earned = 0
      for (const [invNum, inv] of Object.entries(agg.byInvoice)) {
        const events = paymentEventsByInvoiceNum.get(invNum) || []
        if (!events.length) continue
        const fullAmount = inv.amount || 0
        const fullCommission = inv.commission || 0
        for (const ev of events) {
          const pIso = toIsoDateAtParent(ev.date)
          if (!pIso || pIso <= anchor) continue
          const fraction = fullAmount > 0 ? (ev.amount || 0) / fullAmount : 0
          earned += fullCommission * fraction
        }
      }
      out[rep.id] = earned
    }
    return out
  }, [reps, aggregatesByRep, paymentEventsByInvoiceNum])

  // Per-rep payouts recorded strictly AFTER the adjustment anchor. These
  // subtract from Available, so a payout Tony logs lowers what he still owes
  // the rep — including paying down a starting-adjustment carryover. The
  // boundary must match earnedSinceAnchorByRep (both exclude the anchor day):
  // the anchor is the date the baseline is "as of", so anything on or before
  // it — earned OR paid — is already reflected in STARTING_ADJUSTMENTS.
  const paidOutSinceAnchorByRep = useMemo(() => {
    const m = {}
    for (const p of commissionPayouts) {
      const anchor = ADJUSTMENT_ANCHORS[p.repId] || ADJUSTMENT_ANCHOR
      const iso = toIsoDateAtParent(p.date)
      if (!iso || iso <= anchor) continue
      m[p.repId] = (m[p.repId] || 0) + (p.amount || 0)
    }
    return m
  }, [commissionPayouts])
  // Reps have two QB account variants. Only the "- REP" account should hold
  // sample invoices (the source of "Owes Foundry"). A "- CUSTOMER" variant
  // should not normally appear in QB data — when one shows up, it's flagged
  // separately for QB cleanup (see customerSuffixAnomalies below).
  // REP suffix patterns seen: "- REP", "- REP1".
  const REP_SUFFIX_RE = /\s-\s+rep\d*\s*$/i
  const CUSTOMER_SUFFIX_RE = /\s-\s+customer\s*$/i
  const owedByRep = useMemo(() => {
    const out = {}
    for (const rep of reps) {
      const parts = (rep.name || '').split(/\s+/).filter(Boolean)
      if (parts.length < 2) { out[rep.id] = 0; continue }
      const first = parts[0].toLowerCase()
      const last = parts[parts.length - 1].toLowerCase()
      let total = 0
      for (const inv of invoices) {
        const c = (inv.customer || '').toLowerCase()
        if (!REP_SUFFIX_RE.test(c)) continue
        if (c.includes(first) && c.includes(last)) total += inv.openBalance || 0
      }
      out[rep.id] = total
    }
    return out
  }, [reps, invoices])

  // Per-rep list of REP-account invoices (samples / personal orders billed by
  // Foundry to the rep). Used by the Rep Ledger view to render the breakdown.
  const repAccountInvoicesByRep = useMemo(() => {
    const out = {}
    for (const rep of reps) {
      const parts = (rep.name || '').split(/\s+/).filter(Boolean)
      if (parts.length < 2) { out[rep.id] = []; continue }
      const first = parts[0].toLowerCase()
      const last = parts[parts.length - 1].toLowerCase()
      const list = []
      for (const inv of invoices) {
        const c = (inv.customer || '').toLowerCase()
        if (!REP_SUFFIX_RE.test(c)) continue
        if (c.includes(first) && c.includes(last)) list.push(inv)
      }
      // Sort: open first (by due date), then paid (by date desc)
      list.sort((a, b) => {
        const ao = (a.openBalance || 0) > 0 ? 0 : 1
        const bo = (b.openBalance || 0) > 0 ? 0 : 1
        if (ao !== bo) return ao - bo
        if (ao === 0) return (a.dueDate || '').localeCompare(b.dueDate || '')
        return (b.date || '').localeCompare(a.date || '')
      })
      out[rep.id] = list
    }
    return out
  }, [reps, invoices])

  // "- CUSTOMER" invoices that match a known rep — these shouldn't be there.
  // Surface in a banner so Tony can fix them in QB (move to the rep's REP
  // account or reclassify). Grouped by QB customer name.
  const customerSuffixAnomalies = useMemo(() => {
    const groups = new Map()
    for (const rep of reps) {
      const parts = (rep.name || '').split(/\s+/).filter(Boolean)
      if (parts.length < 2) continue
      const first = parts[0].toLowerCase()
      const last = parts[parts.length - 1].toLowerCase()
      for (const inv of invoices) {
        const c = (inv.customer || '').toLowerCase()
        if (!CUSTOMER_SUFFIX_RE.test(c)) continue
        if (!c.includes(first) || !c.includes(last)) continue
        const key = inv.customer
        if (!groups.has(key)) {
          groups.set(key, { customer: inv.customer, repName: rep.name, count: 0, openBalance: 0 })
        }
        const g = groups.get(key)
        g.count += 1
        g.openBalance += inv.openBalance || 0
      }
    }
    return Array.from(groups.values()).sort((a, b) => a.customer.localeCompare(b.customer))
  }, [reps, invoices])
  // Per-rep summary. Earned + Paid Out are YTD figures (current calendar
  // year only). Available is the live amount Tony owes the rep right now,
  // anchored to ADJUSTMENT_ANCHOR (the date starting adjustments were set):
  //
  //   available = startingAdjustment + earnedSinceAnchor − paidOutSinceAnchor
  //
  // startingAdjustment is Tony's hand-set ground truth as of the anchor
  // (any "prior commissions not taken"), earnedSinceAnchor is matched-event
  // commission dated after the anchor, and paidOutSinceAnchor is payouts
  // logged on/after the anchor. Recording a payout subtracts directly, so it
  // lowers Available — including paying down a starting-adjustment carryover.
  // Update starting adjustments + anchors in src/lib/paymentsDemoData.js →
  // STARTING_ADJUSTMENTS / ADJUSTMENT_ANCHOR (default) / ADJUSTMENT_ANCHORS
  // (per-rep override).
  const repSummary = useMemo(() => {
    const out = {}
    for (const rep of reps) {
      const agg = aggregatesByRep[rep.id]
      const earned = earnedYtdByRep[rep.id] || 0
      const paidOut = payoutsByRep[rep.id] || 0
      const startingAdjustment = STARTING_ADJUSTMENTS[rep.id] || 0
      const earnedSinceAnchor = earnedSinceAnchorByRep[rep.id] || 0
      const paidOutSinceAnchor = paidOutSinceAnchorByRep[rep.id] || 0
      out[rep.id] = {
        earned,
        paidOut,
        available: startingAdjustment + earnedSinceAnchor - paidOutSinceAnchor,
        openCommission: agg?.openCommission || 0,
        totalCommission: agg?.totalCommission || 0,
        owesFoundry: owedByRep[rep.id] || 0,
      }
    }
    return out
  }, [reps, aggregatesByRep, earnedYtdByRep, payoutsByRep, earnedSinceAnchorByRep, paidOutSinceAnchorByRep, owedByRep])

  // Match invoice customer names to account names, sum open balances per account.
  // Normalization strips contact suffixes (" - Bryce Firestone"), parens, punctuation.
  // Also returns the list of invoice customers that couldn't be matched, grouped
  // by customer name, so the Accounts page can surface them in a banner.
  const { accountOpenBalances, unmatchedSummary, fuzzyMatchedSummary, invoiceNumsByAccountId } = useMemo(() => {
    const norm = (s) => String(s || '')
      .toUpperCase()
      .replace(/['']/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+-\s.*$/, '')   // strip everything after first " - "
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const byNorm = new Map()
    for (const a of accounts) {
      const n = norm(a.name)
      if (n && !byNorm.has(n)) byNorm.set(n, a)
    }

    const balances = {}
    const unmatched = {}
    const fuzzy = {}   // QB customer → account guessed via substring fallback
    const invoiceNums = {}  // accountId → [invoice nums] for invoice-number search (all invoices, paid + open)
    for (const inv of invoices) {
      const n = norm(inv.customer)
      if (!n) continue
      let acct = byNorm.get(n)
      let matchedVia = 'exact'
      if (!acct) {
        // Substring fallback (both directions, min 4 chars). Prefer the most
        // specific candidate (longest account name) over the first encountered,
        // so a generic short name ("SATELLITE") doesn't beat the correct
        // specific one ("TOPSIDE SATELLITE OUTPOST") by list order. Keep in
        // sync with findAccount() in commissionEngine.js.
        let bestLen = -1
        for (const [key, a] of byNorm.entries()) {
          if (Math.min(key.length, n.length) >= 4 && (key.includes(n) || n.includes(key))) {
            if (key.length > bestLen) { acct = a; bestLen = key.length; matchedVia = 'substring' }
          }
        }
      }
      // Map every invoice (paid or open) to its account so the search bar can
      // resolve an invoice number to its owning account.
      if (acct && inv?.num) {
        if (!invoiceNums[acct.id]) invoiceNums[acct.id] = []
        invoiceNums[acct.id].push(String(inv.num))
      }
      // Open-balance accounting below only applies to invoices with a balance.
      if (!inv?.openBalance) continue
      if (acct) {
        balances[acct.id] = (balances[acct.id] || 0) + inv.openBalance
        if (matchedVia === 'substring') {
          // Group by (invoice-customer + account) so the same QB name routed
          // to the same account aggregates into one review row.
          const key = `${inv.customer}|${acct.id}`
          if (!fuzzy[key]) {
            fuzzy[key] = {
              key,
              customer: inv.customer,
              accountId: acct.id,
              accountName: acct.name,
              accountTerritory: acct.territory,
              count: 0,
              total: 0,
            }
          }
          fuzzy[key].count += 1
          fuzzy[key].total += inv.openBalance
        }
      } else {
        if (!unmatched[inv.customer]) unmatched[inv.customer] = { count: 0, total: 0 }
        unmatched[inv.customer].count += 1
        unmatched[inv.customer].total += inv.openBalance
      }
    }
    const unmatchedList = Object.entries(unmatched)
      .map(([customer, v]) => ({ customer, count: v.count, total: v.total }))
      .sort((a, b) => b.total - a.total)
    const fuzzyList = Object.values(fuzzy).sort((a, b) => b.total - a.total)
    return { accountOpenBalances: balances, unmatchedSummary: unmatchedList, fuzzyMatchedSummary: fuzzyList, invoiceNumsByAccountId: invoiceNums }
  }, [invoices, accounts])

  // Per-territory dashboard stats for the Accounts page tile grid.
  // Maps each territory → { accountCount, paidInvoiceCount, openInvoiceCount,
  // openByBrand: { brandId → $ }, openTotal, aging: { '0-30' | '31-60' |
  // '61-90' | '91+' → $ } }.
  const territoryStats = useMemo(() => {
    const norm = (s) => String(s || '')
      .toUpperCase()
      .replace(/['']/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+-\s.*$/, '')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const byNorm = new Map()
    for (const a of accounts) {
      const n = norm(a.name)
      if (n && !byNorm.has(n)) byNorm.set(n, a)
    }

    // Pre-aggregate line-item amounts per invoice per brand (for pie slices).
    const lineSums = new Map() // num → { byBrand: {}, total: 0 }
    for (const item of lineItems) {
      if (!item?.num) continue
      const info = lookupBrand(item.sku)
      const brand = info?.brandId || 'unknown'
      const amt = item.amount || 0
      if (!lineSums.has(item.num)) lineSums.set(item.num, { byBrand: {}, total: 0 })
      const rec = lineSums.get(item.num)
      rec.byBrand[brand] = (rec.byBrand[brand] || 0) + amt
      rec.total += amt
    }

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const stats = {}
    const blank = () => ({
      accountCount: 0,
      paidInvoiceCount: 0,
      openInvoiceCount: 0,
      openByBrand: {},
      openTotal: 0,
      aging: { '0-30': 0, '31-60': 0, '61-90': 0, '91+': 0 },
    })
    for (const t of TERRITORIES) stats[t] = blank()

    for (const a of accounts) {
      if (a.territory && stats[a.territory]) stats[a.territory].accountCount += 1
    }

    for (const inv of invoices) {
      const n = norm(inv.customer)
      if (!n) continue
      let acct = byNorm.get(n)
      if (!acct) {
        for (const [key, a] of byNorm.entries()) {
          if (Math.min(key.length, n.length) >= 4 && (key.includes(n) || n.includes(key))) {
            acct = a
            break
          }
        }
      }
      const t = acct?.territory
      if (!t || !stats[t]) continue
      const open = inv.openBalance || 0
      if (open <= 0.005) {
        stats[t].paidInvoiceCount += 1
        continue
      }
      stats[t].openInvoiceCount += 1
      stats[t].openTotal += open

      // Brand allocation — pro-rate the invoice's open balance across brands
      // by line-item mix. Falls back to 'unknown' if no line items present.
      const lines = lineSums.get(inv.num)
      if (lines && lines.total > 0) {
        for (const [brand, brandAmt] of Object.entries(lines.byBrand)) {
          stats[t].openByBrand[brand] = (stats[t].openByBrand[brand] || 0) + open * (brandAmt / lines.total)
        }
      } else {
        stats[t].openByBrand['unknown'] = (stats[t].openByBrand['unknown'] || 0) + open
      }

      // Aging by due date. Missing due date → 0-30 bucket.
      let bucket = '0-30'
      if (inv.dueDate) {
        const due = new Date(inv.dueDate)
        if (!isNaN(due)) {
          due.setHours(0, 0, 0, 0)
          const days = Math.floor((today - due) / 86400000)
          if (days <= 30) bucket = '0-30'
          else if (days <= 60) bucket = '31-60'
          else if (days <= 90) bucket = '61-90'
          else bucket = '91+'
        }
      }
      stats[t].aging[bucket] += open
    }
    return stats
  }, [accounts, invoices, lineItems])

  const [territoryModalOpen, setTerritoryModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [salesImportOpen, setSalesImportOpen] = useState(false)
  const [customerSuffixBannerOpen, setCustomerSuffixBannerOpen] = useState(true)
  const selectedAccount = accounts.find(a => a.id === selectedAccountId)
  const selectedAccountEntries = useMemo(
    () => remappedEntries.filter(e => e.accountId === selectedAccountId),
    [remappedEntries, selectedAccountId]
  )

  // ===== Actions =====
  const goToRep = (repId) => { setSelectedRepId(repId); setView('rep-ledger') }
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
      {(view === 'reps' || view === 'accounts' || view === 'invoices') && (
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
          <button
            onClick={() => setView('invoices')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              view === 'invoices' ? 'border-[#005b5b] text-[#005b5b]' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Data Uploads
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
      {view === 'rep-ledger' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={backToReps} className="hover:text-foreground transition-colors">Reps</button>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground font-semibold">{selectedRep?.name}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight">
          {view === 'reps' && 'Rep Payments'}
          {view === 'accounts' && 'Accounts'}
          {view === 'invoices' && 'Data Uploads'}
          {view === 'rep-ledger' && `${selectedRep?.name} — Commission Ledger`}
          {view === 'brands' && `${selectedRep?.name}`}
          {view === 'ledger' && `${selectedRep?.name} • ${selectedBrand?.name}`}
          {view === 'account-detail' && selectedAccount?.name}
        </h1>
        {view === 'reps' && <p className="mt-2 text-muted-foreground">Track commission payments for each rep</p>}
        {view === 'accounts' && <p className="mt-2 text-muted-foreground">{accounts.length} accounts across {new Set(accounts.map(a => a.territory).filter(Boolean)).size} territories</p>}
        {view === 'invoices' && <p className="mt-2 text-muted-foreground">Upload QuickBooks invoices, line items, and AR reports</p>}
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
        {view === 'invoices' && (
          <div className="flex gap-2 shrink-0">
            <PortalMigrateButton />
          </div>
        )}
        {view === 'rep-ledger' && ledgerActions && (
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={ledgerActions.pdf}>
              <FileSpreadsheet className="size-4 mr-1.5" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={ledgerActions.xlsx}>
              <FileSpreadsheet className="size-4 mr-1.5" /> XLSX
            </Button>
            <Button size="sm" onClick={ledgerActions.email} className="bg-[#005b5b] hover:bg-[#004848]">
              <Mail className="size-4 mr-1.5" /> Email
            </Button>
          </div>
        )}
      </div>

      {/* === REPS VIEW === */}
      {view === 'reps' && (
        <>
          <div className="flex items-center justify-end gap-2 -mt-2">
            <Button variant="outline" size="sm" onClick={() => setTerritoryModalOpen(true)}>
              <MapIcon className="size-4 mr-1.5" /> Manage Territories
            </Button>
            <Button variant="outline" size="sm" onClick={() => openRecordPayout()}>
              <Banknote className="size-4 mr-1.5" /> Record Payout
              {commissionPayouts.length > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({commissionPayouts.length})</span>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSalesImportOpen(true)}>
              <FileSpreadsheet className="size-4 mr-1.5" /> Import Sales (Bright Pearl)
            </Button>
            <Button size="sm" onClick={() => setImportModalOpen(true)} className="bg-[#005b5b] hover:bg-[#004848]">
              <Upload className="size-4 mr-1.5" /> Import Payments
            </Button>
          </div>
          {customerSuffixAnomalies.length > 0 && (
            <div className="mb-4 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 mt-0.5 text-amber-700 dark:text-amber-300 shrink-0" />
                <div className="text-sm flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-amber-900 dark:text-amber-200">
                      {customerSuffixAnomalies.length} rep {customerSuffixAnomalies.length === 1 ? 'account' : 'accounts'} with <code className="text-xs">- CUSTOMER</code> suffix in QB
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomerSuffixBannerOpen(o => !o)}
                      className="text-amber-800 dark:text-amber-300 hover:text-amber-900 text-xs underline shrink-0"
                      aria-label={customerSuffixBannerOpen ? 'Minimize' : 'Expand'}
                    >
                      {customerSuffixBannerOpen ? 'Minimize' : 'Expand'}
                    </button>
                  </div>
                  {customerSuffixBannerOpen && (
                    <>
                      <div className="text-amber-800 dark:text-amber-300/80 text-xs mt-0.5">
                        Sample invoices should live under the rep's <code className="text-xs">- REP</code> account. These are excluded from "Owes Foundry" — clean up in QuickBooks and re-import.
                      </div>
                      <ul className="mt-2 space-y-0.5 text-xs text-amber-900 dark:text-amber-200">
                        {customerSuffixAnomalies.map(a => (
                          <li key={a.customer} className="flex justify-between gap-4">
                            <span className="font-mono">{a.customer}</span>
                            <span className="text-amber-800 dark:text-amber-300/80 shrink-0">
                              {a.count} {a.count === 1 ? 'invoice' : 'invoices'} · open {fmt(a.openBalance)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {reps.map((rep) => {
              const t = repTotals[rep.id]
              const territories = repTerritories[rep.id] || []
              const repBrandList = brandsByRep[rep.id] || []
              const summary = repSummary[rep.id] || { earned: 0, paidOut: 0, available: 0, openCommission: 0 }
              return (
                <Card key={rep.id} onClick={() => goToRep(rep.id)} className="cursor-pointer hover:border-[#005b5b] transition-colors">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="flex items-center gap-2 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-[#005b5b] text-white flex items-center justify-center font-bold shrink-0">
                          {rep.name.charAt(0)}
                        </div>
                        <span className="truncate">{rep.name}</span>
                      </CardTitle>
                      <div className="text-right text-xs min-w-0 max-w-[55%]">
                        {rep.agency && <div className="font-medium truncate">{rep.agency}</div>}
                        {rep.email && <div className="text-muted-foreground truncate">{rep.email}</div>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">Brands</span>
                        <span className="font-medium text-right">
                          {repBrandList.length === 0 ? (
                            '—'
                          ) : (
                            <span className="inline-flex flex-wrap gap-1 justify-end">
                              {repBrandList.map(b => (
                                <span key={b.id} className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-[#005b5b]/10 text-[#005b5b]">
                                  {b.name}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">Territories</span>
                        <span className="font-medium text-right">{territories.length ? territories.join(', ') : '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Earned YTD</span>
                        <span className="font-medium">{fmt(summary.earned)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Paid out YTD</span>
                        <span className="font-medium">{fmt(summary.paidOut)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Available</span>
                        <span className={`font-bold ${summary.available > 0 ? 'text-[#005b5b]' : ''}`}>{fmt(summary.available)}</span>
                      </div>
                      {summary.openCommission > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Pending (open invoices)</span>
                          <span className="text-muted-foreground">{fmt(summary.openCommission)}</span>
                        </div>
                      )}
                      {summary.owesFoundry > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Owes Foundry (samples)</span>
                          <span className="text-amber-700 dark:text-amber-300 font-medium">{fmt(summary.owesFoundry)}</span>
                        </div>
                      )}
                    </div>
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
          accountOpenBalances={accountOpenBalances}
          invoiceNumsByAccountId={invoiceNumsByAccountId}
          unmatchedSummary={unmatchedSummary}
          fuzzyMatchedSummary={fuzzyMatchedSummary}
          territoryStats={territoryStats}
          search={accountSearch}
          onSearchChange={setAccountSearch}
          territoryFilter={accountTerritoryFilter}
          onTerritoryChange={setAccountTerritoryFilter}
          onSelect={goToAccount}
        />
      )}

      {/* === INVOICES VIEW === */}
      {view === 'invoices' && (
        <InvoicesView
          invoices={invoices}
          invoicesMeta={invoicesMeta}
          onSave={saveInvoices}
          onAppend={appendInvoices}
          onClear={clearInvoicesState}
          lastInvoicesImport={lastInvoicesImport}
          lineItems={lineItems}
          lineItemsMeta={lineItemsMeta}
          onSaveLineItems={saveLineItems}
          onAppendLineItems={appendLineItems}
          onClearLineItems={clearLineItemsState}
          lineItemsStorageError={lineItemsStorageError}
          lastLineItemsImport={lastLineItemsImport}
          paymentsTx={paymentsTx}
          paymentsTxMeta={paymentsTxMeta}
          onSavePaymentsTx={savePaymentsTxState}
          onClearPaymentsTx={clearPaymentsTxState}
          bpOverrides={bpOverrides}
          bpOverridesMeta={bpOverridesMeta}
          bpOverridesAppliedCount={bpOverridesAppliedCount}
          onMergeBpOverrides={mergeBpOverridesState}
          onClearBpOverrides={clearBpOverridesState}
          wsrRemittances={wsrRemittances}
          wsrAttributedCount={wsrRemittanceAppliedCount}
          onAddWsrRemittance={addWsrRemittanceState}
          onClearWsrRemittances={clearWsrRemittancesState}
          selectedCustomer={invoiceDrillCustomer}
          setSelectedCustomer={(c) => {
            setInvoiceDrillCustomer(c)
            if (!c) setInvoiceDrillHighlight(null)
          }}
          highlightNum={invoiceDrillHighlight}
          clearHighlight={() => setInvoiceDrillHighlight(null)}
        />
      )}

      {/* === ACCOUNT DETAIL VIEW === */}
      {view === 'account-detail' && selectedAccount && (
        <AccountDetailView
          account={selectedAccount}
          entries={selectedAccountEntries}
          reps={reps}
          brands={brands}
          invoices={invoices}
          lineItems={lineItems}
          onBack={backToAccounts}
          onJumpToInvoice={(customer, num) => {
            setInvoiceDrillCustomer(customer)
            setInvoiceDrillHighlight(num)
            setView('invoices')
          }}
        />
      )}

      {/* === REP LEDGER VIEW (new commission engine) === */}
      {view === 'rep-ledger' && selectedRep && (
        <RepLedgerView
          rep={selectedRep}
          aggregate={aggregatesByRep[selectedRep.id]}
          summary={repSummary[selectedRep.id]}
          payouts={commissionPayouts.filter(p => p.repId === selectedRep.id)}
          repAccountInvoices={repAccountInvoicesByRep[selectedRep.id] || []}
          paymentDatesByInvoiceNum={paymentDatesByInvoiceNum}
          paymentEventsByInvoiceNum={paymentEventsByInvoiceNum}
          onAddPayout={() => openRecordPayout(selectedRep.id)}
          onEditPayout={openEditPayout}
          onDeletePayout={deleteCommissionPayout}
          territories={repTerritories[selectedRep.id] || []}
          anchor={ADJUSTMENT_ANCHORS[selectedRep.id] || ADJUSTMENT_ANCHOR}
          onRegisterActions={registerLedgerActions}
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
        onReset={resetRepTerritories}
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
      <RecordCommissionPayoutModal
        open={recordPayoutOpen}
        onOpenChange={setRecordPayoutOpen}
        reps={reps}
        prefilledRepId={prefilledPayoutRepId}
        editingPayout={editingPayout}
        onSave={addCommissionPayout}
        onUpdate={updateCommissionPayout}
      />
    </div>
  )
}

// =====================================================================
// AccountsView — Tony's master list of all 439 accounts
// =====================================================================
// Brand display + color palette for the territory tile donuts.
const BRAND_DISPLAY = {
  'brand-nitro':  { label: 'NITRO',  color: '#005b5b' },
  'brand-autumn': { label: 'AUTUMN', color: '#d97706' },
  'brand-l1':     { label: 'L1',     color: '#6366f1' },
  'brand-eivy':   { label: 'EIVY',   color: '#db2777' },
  'unknown':      { label: 'Other',  color: '#9ca3af' },
}

// Inline SVG donut chart. `data` = [{ key, value, color }]. Gracefully no-ops
// when total is zero (renders a faint full ring as an empty-state).
function DonutChart({ data, size = 110, strokeWidth = 18 }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const cx = size / 2
  const cy = size / 2
  let offset = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
      {total > 0 && data.map((d) => {
        const v = d.value || 0
        if (v <= 0) return null
        const dash = (v / total) * circumference
        const gap = circumference - dash
        const seg = (
          <circle
            key={d.key}
            cx={cx} cy={cy} r={radius}
            fill="none" stroke={d.color} strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )
        offset += dash
        return seg
      })}
    </svg>
  )
}

function TerritoryTile({ territory, stats, onClick }) {
  const donutData = useMemo(() => {
    return Object.entries(stats.openByBrand)
      .filter(([, v]) => (v || 0) > 0.005)
      .sort((a, b) => b[1] - a[1])
      .map(([brand, value]) => ({
        key: brand,
        value,
        color: (BRAND_DISPLAY[brand] || BRAND_DISPLAY.unknown).color,
        label: (BRAND_DISPLAY[brand] || BRAND_DISPLAY.unknown).label,
      }))
  }, [stats.openByBrand])
  return (
    <Card onClick={onClick} className="cursor-pointer hover:border-[#005b5b] transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base text-[#005b5b] truncate">{territory}</CardTitle>
            <CardDescription className="text-xs">
              {stats.accountCount} {stats.accountCount === 1 ? 'account' : 'accounts'} · {stats.openInvoiceCount} open · {stats.paidInvoiceCount} paid
            </CardDescription>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-muted-foreground">Open total</div>
            <div className="font-bold text-[#005b5b]">{fmt(stats.openTotal)}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <DonutChart data={donutData} size={110} strokeWidth={18} />
          <div className="flex-1 min-w-0 space-y-1">
            {donutData.length === 0 ? (
              <div className="text-xs text-muted-foreground">No open invoices.</div>
            ) : donutData.map(d => (
              <div key={d.key} className="flex items-center gap-2 text-xs">
                <span className="inline-block size-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
                <span className="font-medium">{d.label}</span>
                <span className="ml-auto text-muted-foreground whitespace-nowrap">{fmt(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Open invoice aging</div>
          <div className="grid grid-cols-4 gap-1 text-center">
            {[
              { label: '0–30', key: '0-30',  bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300' },
              { label: '31–60', key: '31-60', bg: 'bg-amber-50 dark:bg-amber-950/30',     text: 'text-amber-700 dark:text-amber-300' },
              { label: '61–90', key: '61-90', bg: 'bg-orange-50 dark:bg-orange-950/30',   text: 'text-orange-700 dark:text-orange-300' },
              { label: '91+',  key: '91+',   bg: 'bg-red-50 dark:bg-red-950/30',         text: 'text-red-700 dark:text-red-300' },
            ].map(b => (
              <div key={b.key} className={`rounded ${b.bg} px-1 py-1`}>
                <div className="text-[10px] text-muted-foreground">{b.label}</div>
                <div className={`text-xs font-semibold whitespace-nowrap ${b.text}`}>{fmt(stats.aging[b.key])}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AccountsView({ accounts, accountTotals, accountOpenBalances, invoiceNumsByAccountId = {}, unmatchedSummary, fuzzyMatchedSummary = [], territoryStats = {}, search, onSearchChange, territoryFilter, onTerritoryChange, onSelect }) {
  const [unmatchedOpen, setUnmatchedOpen] = useState(false)
  const [fuzzyOpen, setFuzzyOpen] = useState(false)
  const fuzzyTotal = useMemo(
    () => (fuzzyMatchedSummary || []).reduce((s, f) => s + (f.total || 0), 0),
    [fuzzyMatchedSummary]
  )
  const unmatchedTotal = useMemo(
    () => (unmatchedSummary || []).reduce((s, u) => s + (u.total || 0), 0),
    [unmatchedSummary]
  )
  const territories = useMemo(() => {
    const set = new Set(accounts.map(a => a.territory).filter(Boolean))
    return Array.from(set).sort()
  }, [accounts])

  // When a territory tile is clicked we narrow the grouped list to only
  // accounts with open balances. The toggle at the top of the list resets
  // this to show all accounts in the territory.
  const [openBalancesOnly, setOpenBalancesOnly] = useState(false)
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return accounts.filter(a => {
      if (territoryFilter !== 'all' && a.territory !== territoryFilter) return false
      if (openBalancesOnly && !(accountOpenBalances?.[a.id] > 0.005)) return false
      if (!q) return true
      return (
        a.name.toLowerCase().includes(q) ||
        (a.email || '').toLowerCase().includes(q) ||
        (a.firstName || '').toLowerCase().includes(q) ||
        (a.lastName || '').toLowerCase().includes(q) ||
        (a.territory || '').toLowerCase().includes(q) ||
        // Invoice-number search: match an account by any invoice it owns.
        (invoiceNumsByAccountId[a.id] || []).some(num => num.toLowerCase().includes(q))
      )
    })
  }, [accounts, search, territoryFilter, openBalancesOnly, accountOpenBalances, invoiceNumsByAccountId])

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

  const [expanded, setExpanded] = useState(() => new Set())
  const toggleTerritory = (terr) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(terr)) next.delete(terr)
      else next.add(terr)
      return next
    })
  }

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by account, contact, email, territory, or invoice #…"
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

      {/* Unmatched invoices banner */}
      {unmatchedSummary?.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2.5 text-sm">
          <button
            type="button"
            onClick={() => setUnmatchedOpen(o => !o)}
            className="flex items-center justify-between gap-2 w-full text-left"
            aria-expanded={unmatchedOpen}
          >
            <span className="text-amber-900 dark:text-amber-200">
              <span className="font-semibold">Unmatched invoices:</span>{' '}
              {unmatchedSummary.length} {unmatchedSummary.length === 1 ? 'customer' : 'customers'}
              {' • '}
              <span className="font-medium">{fmt(unmatchedTotal)}</span> open
              {' — '}
              <span className="underline">{unmatchedOpen ? 'Hide' : 'View'}</span>
            </span>
          </button>
          {unmatchedOpen && (
            <div className="mt-3 max-h-60 overflow-y-auto pr-1 space-y-1 border-t border-amber-200 dark:border-amber-900 pt-2">
              {unmatchedSummary.map((u) => (
                <div key={u.customer} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate">
                    {u.customer}{' '}
                    <span className="text-muted-foreground">({u.count} {u.count === 1 ? 'invoice' : 'invoices'})</span>
                  </span>
                  <span className="font-medium whitespace-nowrap">{fmt(u.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fuzzy-matched invoices banner — substring-fallback matches that
          weren't exact name hits. These can silently misroute invoices to
          the wrong account/territory (e.g. "Topside / Satellite Outpost"
          matching to "SATELLITE" board shop). Review each one and either
          confirm or add a proper ACCOUNTS entry. */}
      {fuzzyMatchedSummary?.length > 0 && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-900 px-3 py-2.5 text-sm">
          <button
            type="button"
            onClick={() => setFuzzyOpen(o => !o)}
            className="flex items-center justify-between gap-2 w-full text-left"
            aria-expanded={fuzzyOpen}
          >
            <span className="text-orange-900 dark:text-orange-200">
              <span className="font-semibold">Fuzzy-matched invoices (review):</span>{' '}
              {fuzzyMatchedSummary.length} {fuzzyMatchedSummary.length === 1 ? 'customer' : 'customers'}
              {' • '}
              <span className="font-medium">{fmt(fuzzyTotal)}</span> open
              {' — '}
              <span className="underline">{fuzzyOpen ? 'Hide' : 'View'}</span>
            </span>
          </button>
          {fuzzyOpen && (
            <div className="mt-3 max-h-72 overflow-y-auto pr-1 space-y-2 border-t border-orange-200 dark:border-orange-900 pt-2">
              <div className="text-xs text-orange-800 dark:text-orange-300/80 pb-1">
                Matched by name-substring fallback. Confirm each, or add a proper account so the next refresh exact-matches.
              </div>
              {fuzzyMatchedSummary.map((f) => (
                <div key={f.key} className="flex items-start justify-between gap-3 text-xs border-t border-orange-100 dark:border-orange-900/60 pt-1.5">
                  <div className="min-w-0">
                    <div className="font-mono truncate">{f.customer}</div>
                    <div className="text-orange-700 dark:text-orange-300/70 mt-0.5">
                      → <span className="font-medium">{f.accountName}</span>{' '}
                      <span className="text-muted-foreground">({f.accountId}, {f.accountTerritory})</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium whitespace-nowrap">{fmt(f.total)}</div>
                    <div className="text-muted-foreground text-[10px]">{f.count} {f.count === 1 ? 'invoice' : 'invoices'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Territory dashboard tiles (2 cols × 4 rows) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {TERRITORIES.map(t => (
          <TerritoryTile
            key={t}
            territory={t}
            stats={territoryStats[t] || { accountCount: 0, paidInvoiceCount: 0, openInvoiceCount: 0, openByBrand: {}, openTotal: 0, aging: { '0-30': 0, '31-60': 0, '61-90': 0, '91+': 0 } }}
            onClick={() => {
              onTerritoryChange(t)
              setExpanded(new Set([t]))
              setOpenBalancesOnly(true)
              // Defer scroll until after the territory filter has flushed.
              setTimeout(() => {
                const el = document.querySelector(`[data-territory-anchor="${t}"]`)
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }, 50)
            }}
          />
        ))}
      </div>

      {/* Grouped list */}
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {openBalancesOnly
              ? `Showing accounts with open balances only · ${filtered.length} ${filtered.length === 1 ? 'account' : 'accounts'}`
              : `Showing all accounts · ${filtered.length} ${filtered.length === 1 ? 'account' : 'accounts'}`}
          </div>
          <Button
            variant={openBalancesOnly ? 'outline' : 'secondary'}
            size="sm"
            onClick={() => setOpenBalancesOnly(v => !v)}
          >
            {openBalancesOnly ? 'All Accounts' : 'Open Balances Only'}
          </Button>
        </div>
        {territoryOrder.map((terr) => {
          const isCollapsed = !expanded.has(terr)
          return (
          <div key={terr} data-territory-anchor={terr}>
            <button
              type="button"
              onClick={() => toggleTerritory(terr)}
              className="flex items-center gap-2 mb-3 sticky top-0 bg-background py-2 z-[1] w-full text-left"
              aria-expanded={!isCollapsed}
            >
              <span className="size-5 inline-flex items-center justify-center rounded text-[#005b5b] hover:bg-[#005b5b]/10">
                {isCollapsed ? <Plus className="size-4" /> : <Minus className="size-4" />}
              </span>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#005b5b] ml-2">{terr}</h2>
              <span className="text-xs text-muted-foreground">{grouped[terr].length} {grouped[terr].length === 1 ? 'account' : 'accounts'}</span>
            </button>
            {!isCollapsed && (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 text-xs uppercase text-muted-foreground border-b">
                      <th className="py-2 px-4 text-left font-medium">Account</th>
                      <th className="py-2 px-4 text-left font-medium">Contact</th>
                      <th className="py-2 px-4 text-left font-medium">Email</th>
                      <th className="py-2 px-4 text-left font-medium">Phone</th>
                      <th className="py-2 px-4 text-right font-medium">Open Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[terr].map((a) => {
                      const contact = [a.firstName, a.lastName].filter(Boolean).join(' ')
                      const openBal = accountOpenBalances?.[a.id]
                      return (
                        <tr key={a.id} onClick={() => onSelect(a.id)} className="border-b last:border-0 cursor-pointer hover:bg-muted/30">
                          <td className="py-2.5 px-4 font-medium">{a.name}</td>
                          <td className="py-2.5 px-4 text-xs text-muted-foreground">{contact || '—'}</td>
                          <td className="py-2.5 px-4 text-xs text-muted-foreground">{a.email || '—'}</td>
                          <td className="py-2.5 px-4 text-xs text-muted-foreground">{a.phone || '—'}</td>
                          <td className={`py-2.5 px-4 text-right ${openBal ? 'font-bold text-[#005b5b]' : 'text-muted-foreground'}`}>
                            {openBal ? fmt(openBal) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )
        })}
      </div>
    </>
  )
}

// Returns a ref that, when attached to a row, scrolls it into view once and
// clears the parent's highlight state. Used to land on a specific invoice
// from a deep link (e.g. clicking a row on the Account detail page).
function useHighlightedRow(highlightNum, scope, clearHighlight) {
  const ref = useRef(null)
  useEffect(() => {
    if (!highlightNum) return
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightNum, scope])
  return ref
}

// Sortable table header cell — shows a ↑/↓ arrow when this column is active.
function SortableTh({ col, label, align = 'left', sortBy, sortDir, onClick }) {
  const active = sortBy === col
  return (
    <th
      onClick={() => onClick(col)}
      className={`py-2 px-4 text-${align} font-medium cursor-pointer hover:text-foreground transition-colors ${active ? 'text-[#005b5b]' : ''}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  )
}

// Inline info icon with hover tooltip — shared across the uploader rows
// so each ingestion surface can carry a one-sentence "what is this file
// for" description without bloating the visible row.
function InfoTip({ children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More info"
          className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors p-0.5 cursor-help"
          onClick={(e) => e.preventDefault()}
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm leading-snug">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

// LineItemsUploader — dual mode:
//   - default (empty state): full dashed card, "Step 2 — Line Items CSV"
//   - compact (post-upload): single-line status with a Replace/Clear strip
function LineItemsUploader({ lineItems, lineItemsMeta, itemsInvoiceCount, itemsError, lastImport, onPickFile, onClear, compact }) {
  const hasItems = (lineItems?.length || 0) > 0
  const pickHandler = (mode) => (e) => {
    if (e.target.files?.[0]) { onPickFile(e.target.files[0], mode); e.target.value = '' }
  }
  if (compact) {
    return (
      <div className="rounded-md border border-dashed px-3 py-2 text-sm flex flex-wrap items-center gap-3">
        <FileSpreadsheet className="size-4 text-muted-foreground shrink-0" />
        {hasItems ? (
          <>
            <span className="text-muted-foreground inline-flex items-center gap-1">
              Line items:
              <InfoTip>
                <p className="font-medium mb-1">Line items CSV</p>
                <p>Per-invoice product detail (one row per SKU). Required for brand attribution — without it the engine can only credit commission at the invoice level, not split it across brands.</p>
                <p className="mt-1 text-muted-foreground">Source: QuickBooks "Sales by Customer Type Detail" report.</p>
              </InfoTip>
            </span>
            <span className="font-medium">{lineItems.length.toLocaleString()}</span>
            <span className="text-muted-foreground">across</span>
            <span className="font-medium">{itemsInvoiceCount.toLocaleString()}</span>
            <span className="text-muted-foreground">{itemsInvoiceCount === 1 ? 'invoice' : 'invoices'}</span>
            {lineItemsMeta && <span className="text-xs text-muted-foreground">• {lineItemsMeta.fileName}</span>}
          </>
        ) : (
          <span className="text-muted-foreground">
            <span className="font-medium">No line items loaded.</span> Upload to enable per-invoice brand attribution.
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <label className="inline-flex">
            <input type="file" accept=".csv" className="hidden" onChange={pickHandler(hasItems ? 'append' : 'replace')} />
            <span className={`inline-flex items-center px-2.5 py-1 text-xs rounded-md cursor-pointer gap-1.5 ${hasItems ? 'bg-[#005b5b] text-white hover:bg-[#004848]' : 'border border-input bg-background hover:bg-muted'}`}>
              <Upload className="size-3.5" /> {hasItems ? 'Append' : 'Upload Line Items'}
            </span>
          </label>
          {hasItems && (
            <>
              <label className="inline-flex">
                <input type="file" accept=".csv" className="hidden" onChange={pickHandler('replace')} />
                <span className="inline-flex items-center px-2.5 py-1 text-xs rounded-md border border-input bg-background hover:bg-muted cursor-pointer">
                  Replace
                </span>
              </label>
              <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground h-7 text-xs">Clear</Button>
            </>
          )}
        </div>
        {lastImport && (
          <p className="basis-full text-xs text-[#005b5b]">
            {lastImport.mode === 'append'
              ? `Merged: ${lastImport.invoicesAdded} new invoices, ${lastImport.invoicesUpdated} updated — ${lastImport.itemsTotal.toLocaleString()} line items total.`
              : `Loaded ${lastImport.itemsTotal.toLocaleString()} line items (replaced).`
            }
          </p>
        )}
        {itemsError && <p className="basis-full text-sm text-red-600">{itemsError}</p>}
      </div>
    )
  }
  return (
    <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 py-12 px-6 text-center">
      <FileSpreadsheet className="size-10 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
        Step 2 — Line Items CSV (optional)
        <InfoTip>
          <p className="font-medium mb-1">Line items CSV</p>
          <p>Per-invoice product detail (one row per SKU). Required for brand attribution — without it the engine can only credit commission at the invoice level, not split it across brands.</p>
          <p className="mt-1 text-muted-foreground">Source: QuickBooks "Sales by Customer Type Detail" report.</p>
        </InfoTip>
      </p>
      <p className="text-sm text-muted-foreground mb-4">Enables brand attribution per invoice. Drop later if you only have the invoices file now.</p>
      <label className="inline-flex">
        <input type="file" accept=".csv" className="hidden" onChange={pickHandler('replace')} />
        <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted cursor-pointer gap-1.5">
          <Upload className="size-4" /> Choose Line Items CSV
        </span>
      </label>
      <p className="text-xs text-muted-foreground mt-3">Expected columns: Num, Product/Service full name, Quantity, Amount</p>
      {hasItems && (
        <p className="text-xs text-[#005b5b] mt-2">
          {lineItems.length.toLocaleString()} line items loaded across {itemsInvoiceCount} invoices
        </p>
      )}
      {itemsError && <p className="mt-3 text-sm text-red-600">{itemsError}</p>}
    </div>
  )
}

function PaymentsTxUploader({ transactions, meta, byType, onPickFile, onClear, error, lastImport }) {
  const pickHandler = (mode) => (e) => {
    if (e.target.files?.[0]) { onPickFile(e.target.files[0], mode); e.target.value = '' }
  }
  const hasData = (transactions?.length || 0) > 0
  const TYPE_ORDER = ['Payment', 'Credit Memo', 'Invoice', 'Expense', 'Check']
  const ordered = TYPE_ORDER.filter(t => byType?.[t]).concat(Object.keys(byType || {}).filter(t => !TYPE_ORDER.includes(t)))
  if (hasData) {
    return (
      <div className="rounded-md border border-dashed px-3 py-2 text-sm flex flex-wrap items-center gap-3">
        <FileSpreadsheet className="size-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground inline-flex items-center gap-1">
          Payments:
          <InfoTip>
            <p className="font-medium mb-1">QB Payments &amp; Credit Memos</p>
            <p>Every payment event and credit memo over the export's date range. Drives the 3-phase auto-matcher that assigns payment dates to invoices, and powers credit-memo claw-back logic.</p>
            <p className="mt-1 text-muted-foreground">Source: QuickBooks "Invoices &amp; Received Payments" report.</p>
          </InfoTip>
        </span>
        <span className="font-medium">{transactions.length.toLocaleString()}</span>
        <span className="text-muted-foreground">transactions</span>
        {ordered.length > 0 && (
          <span className="flex items-center gap-1.5 flex-wrap">
            {ordered.map(t => (
              <span key={t} className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-[#005b5b]/10 text-[#005b5b]">
                {t} <span className="text-muted-foreground">{byType[t]}</span>
              </span>
            ))}
          </span>
        )}
        {meta && <span className="text-xs text-muted-foreground">• {meta.fileName}</span>}
        <span className="ml-auto flex items-center gap-2">
          <label className="inline-flex">
            <input type="file" accept=".csv" className="hidden" onChange={pickHandler('append')} />
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md bg-[#005b5b] text-white hover:bg-[#004848] cursor-pointer gap-1"><Upload className="size-3.5" /> Append</span>
          </label>
          <label className="inline-flex">
            <input type="file" accept=".csv" className="hidden" onChange={pickHandler('replace')} />
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted cursor-pointer gap-1">Replace</span>
          </label>
          <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground h-7 text-xs">Clear</Button>
        </span>
        {lastImport && (
          <p className={`basis-full text-xs mt-1 ${lastImport.mode === 'append' ? 'text-[#005b5b]' : 'text-muted-foreground'}`}>
            {lastImport.mode === 'append'
              ? `Appended ${lastImport.added.toLocaleString()} new transaction${lastImport.added === 1 ? '' : 's'}${lastImport.duplicates ? `, skipped ${lastImport.duplicates.toLocaleString()} duplicate${lastImport.duplicates === 1 ? '' : 's'}` : ''} — ${lastImport.total.toLocaleString()} total.`
              : `Loaded ${lastImport.total.toLocaleString()} transactions from ${lastImport.fileName}.`}
          </p>
        )}
        {error && <p className="basis-full text-sm text-red-600">{error}</p>}
      </div>
    )
  }
  return (
    <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 py-12 px-6 text-center">
      <FileSpreadsheet className="size-10 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
        Step 4 — QB Payments CSV (Invoices &amp; Received Payments)
        <InfoTip>
          <p className="font-medium mb-1">QB Payments &amp; Credit Memos</p>
          <p>Every payment event and credit memo over the export's date range. Drives the 3-phase auto-matcher that assigns payment dates to invoices, and powers credit-memo claw-back logic.</p>
          <p className="mt-1 text-muted-foreground">Source: QuickBooks "Invoices &amp; Received Payments" report.</p>
        </InfoTip>
      </p>
      <p className="text-sm text-muted-foreground mb-4">Captures every payment event + credit memo over a date range. Used for commission-timing audits and three-way reconciliation against invoices + AR.</p>
      <label className="inline-flex">
        <input type="file" accept=".csv" className="hidden" onChange={pickHandler('replace')} />
        <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted cursor-pointer gap-1.5">
          <Upload className="size-4" /> Choose Payments CSV
        </span>
      </label>
      <p className="text-xs text-muted-foreground mt-3">Expected columns: Date, Transaction type, Memo/Description, Transaction number, Amount</p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}

function BpOverridesUploader({ overrides, meta, appliedCount, onPickFile, onClear, error, lastImport }) {
  const pick = (e) => { if (e.target.files?.[0]) { onPickFile(e.target.files[0]); e.target.value = '' } }
  const total = overrides ? Object.keys(overrides).length : 0
  if (total > 0) {
    return (
      <div className="rounded-md border border-dashed px-3 py-2 text-sm flex flex-wrap items-center gap-3">
        <FileSpreadsheet className="size-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground inline-flex items-center gap-1">
          BP overrides:
          <InfoTip>
            <p className="font-medium mb-1">Brightpearl invoice→customer mapping</p>
            <p>Recovers the original customer name on invoices that QuickBooks renamed to bare "WSR" when a clearing-house payment hit. Without this, WSR-member invoices can't route to the right rep.</p>
            <p className="mt-1 text-muted-foreground">Upload one file per territory — mappings merge, they don't replace.</p>
          </InfoTip>
        </span>
        <span className="font-medium">{total.toLocaleString()}</span>
        <span className="text-muted-foreground">invoice mappings</span>
        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-[#005b5b]/10 text-[#005b5b]">
          {appliedCount} applied to current WSR invoices
        </span>
        {meta && <span className="text-xs text-muted-foreground">• {meta.fileName}</span>}
        <span className="ml-auto flex items-center gap-2">
          <label className="inline-flex">
            <input type="file" accept=".csv" className="hidden" onChange={pick} />
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted cursor-pointer gap-1">
              <Upload className="size-3.5" /> Merge another file
            </span>
          </label>
          <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground h-7 text-xs">Clear</Button>
        </span>
        {lastImport && <p className="basis-full text-xs text-muted-foreground mt-1">Merged {lastImport.added.toLocaleString()} mappings from {lastImport.fileName} ({total} total stored).</p>}
        {error && <p className="basis-full text-sm text-red-600">{error}</p>}
      </div>
    )
  }
  return (
    <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 py-12 px-6 text-center">
      <FileSpreadsheet className="size-10 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
        Step 5 — BP invoice overrides (one-off backfill)
        <InfoTip>
          <p className="font-medium mb-1">Brightpearl invoice→customer mapping</p>
          <p>Recovers the original customer name on invoices that QuickBooks renamed to bare "WSR" when a clearing-house payment hit. Without this, WSR-member invoices can't route to the right rep.</p>
          <p className="mt-1 text-muted-foreground">Upload one file per territory — mappings merge, they don't replace.</p>
        </InfoTip>
      </p>
      <p className="text-sm text-muted-foreground mb-4">Brightpearl export with original customer names per invoice. Recovers WSR-renamed invoices so they route to the right rep. Upload one file per territory; mappings accumulate.</p>
      <label className="inline-flex">
        <input type="file" accept=".csv" className="hidden" onChange={pick} />
        <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted cursor-pointer gap-1.5">
          <Upload className="size-4" /> Choose BP Overrides CSV
        </span>
      </label>
      <p className="text-xs text-muted-foreground mt-3">Expected columns: Invoice, Customer (other columns ignored)</p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}

function WsrRemittanceUploader({ remittances, latest, totalInvoices, totalPaid, wsrAttributedCount = 0, onPickFile, onClear, error, lastImport }) {
  const pick = (e) => { if (e.target.files?.[0]) { onPickFile(e.target.files[0]); e.target.value = '' } }
  if (remittances.length > 0) {
    return (
      <div className="rounded-md border border-dashed px-3 py-2 text-sm flex flex-wrap items-center gap-3">
        <FileSpreadsheet className="size-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground inline-flex items-center gap-1">
          WSR remittances:
          <InfoTip>
            <p className="font-medium mb-1">WSR ACH remittance forms</p>
            <p>Each xlsx breaks a single WSR ACH payment down by member: invoice number, member ID, gross, admin fee, and net paid. Gives WSR-member invoices their correct paid date and amount.</p>
            <p className="mt-1 text-muted-foreground">One file per check — re-uploading a check number replaces the prior copy.</p>
          </InfoTip>
        </span>
        <span className="font-medium">{remittances.length}</span>
        <span className="text-muted-foreground">checks ·</span>
        <span className="font-medium">{totalInvoices.toLocaleString()}</span>
        <span className="text-muted-foreground">invoices allocated · paid</span>
        <span className="font-bold text-[#005b5b]">{fmt(totalPaid)}</span>
        {wsrAttributedCount > 0 && (
          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-[#005b5b]/10 text-[#005b5b]">
            {wsrAttributedCount} WSR invoices member-attributed via remittance chain
          </span>
        )}
        {latest && <span className="text-xs text-muted-foreground">• latest {latest.checkNumber} on {latest.checkDate}</span>}
        <span className="ml-auto flex items-center gap-2">
          <label className="inline-flex">
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={pick} />
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted cursor-pointer gap-1">
              <Upload className="size-3.5" /> Add another remittance
            </span>
          </label>
          <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground h-7 text-xs">Clear</Button>
        </span>
        {lastImport && (
          <p className="basis-full text-xs text-muted-foreground mt-1">
            Loaded {lastImport.checkNumber} ({lastImport.checkDate}) — {lastImport.invoiceCount} invoices · {fmt(lastImport.sumPaid)} net paid from {lastImport.fileName}.
          </p>
        )}
        {error && <p className="basis-full text-sm text-red-600">{error}</p>}
      </div>
    )
  }
  return (
    <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 py-12 px-6 text-center">
      <FileSpreadsheet className="size-10 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
        Step 6 — WSR ACH payments (per-check remittance)
        <InfoTip>
          <p className="font-medium mb-1">WSR ACH remittance forms</p>
          <p>Each xlsx breaks a single WSR ACH payment down by member: invoice number, member ID, gross, admin fee, and net paid. Gives WSR-member invoices their correct paid date and amount.</p>
          <p className="mt-1 text-muted-foreground">One file per check — re-uploading a check number replaces the prior copy.</p>
        </InfoTip>
      </p>
      <p className="text-sm text-muted-foreground mb-4">Upload each WSR Additional Remittance Form xlsx. Gives us per-invoice attribution (member, gross, admin fee, net) within a lump WSR ACH payment so individual WSR-member invoices get correct payment dates and amounts.</p>
      <label className="inline-flex">
        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={pick} />
        <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted cursor-pointer gap-1.5">
          <Upload className="size-4" /> Choose WSR Remittance XLSX
        </span>
      </label>
      <p className="text-xs text-muted-foreground mt-3">Expected: Check Date, Check Number, Payment Amount header; Invoice Number / Member ID / Amount Paid columns in the detail table.</p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}

// =====================================================================
// InvoicesView — upload a CSV of open invoices and browse the table
// =====================================================================
function InvoicesView({
  invoices, invoicesMeta, onSave, onAppend, onClear, lastInvoicesImport,
  lineItems, lineItemsMeta, onSaveLineItems, onAppendLineItems, onClearLineItems, lineItemsStorageError, lastLineItemsImport,
  paymentsTx = [], paymentsTxMeta, onSavePaymentsTx, onClearPaymentsTx,
  bpOverrides = {}, bpOverridesMeta, bpOverridesAppliedCount = 0, onMergeBpOverrides, onClearBpOverrides,
  wsrRemittances = [], wsrAttributedCount = 0, onAddWsrRemittance, onClearWsrRemittances,
  selectedCustomer, setSelectedCustomer, highlightNum, clearHighlight,
}) {
  const rows = invoices
  const meta = invoicesMeta
  const [error, setError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [itemsError, setItemsError] = useState(null)

  // Invoice-num set, useful for showing how many invoices have items loaded.
  const itemsInvoiceNumSet = useMemo(
    () => new Set((lineItems || []).map(it => it.num).filter(Boolean)),
    [lineItems]
  )
  const itemsInvoiceCount = itemsInvoiceNumSet.size

  // Data-integrity check: invoices that have NO matching line items in the
  // current items dataset. These can't be brand-attributed for the commission
  // engine. We only flag this when BOTH datasets are loaded (otherwise the
  // gap is obvious — items haven't been uploaded yet).
  const invoicesMissingLineItems = useMemo(() => {
    if (!invoices?.length || !lineItems?.length) return []
    return invoices.filter(r => r.num && !itemsInvoiceNumSet.has(r.num))
  }, [invoices, lineItems, itemsInvoiceNumSet])
  const [missingItemsOpen, setMissingItemsOpen] = useState(false)

  // Data-integrity check #2: line items whose SKU doesn't resolve to a brand
  // via the catalog map. Aggregated by SKU with invoice count, total $ amount,
  // and a few sample invoice numbers for triage. Empty / blank SKUs are
  // grouped under "(blank)" so they're not silently dropped.
  const unresolvedSkus = useMemo(() => {
    if (!lineItems?.length) return []
    const by = new Map() // sku → { sku, lineCount, invoiceSet, amount, sampleInvoices, description }
    for (const it of lineItems) {
      const rawSku = String(it?.sku || '').trim()
      const info = rawSku ? lookupBrand(rawSku) : null
      if (info?.brandName) continue
      const key = rawSku || '(blank)'
      if (!by.has(key)) by.set(key, { sku: key, lineCount: 0, invoiceSet: new Set(), amount: 0, sampleInvoices: [], description: '' })
      const rec = by.get(key)
      rec.lineCount += 1
      rec.amount += it.amount || 0
      // Capture the first non-empty description we see for this SKU. Older
      // line-item exports persisted before the parser change won't have one.
      if (!rec.description && it.description) rec.description = it.description
      if (it.num) {
        if (!rec.invoiceSet.has(it.num)) {
          rec.invoiceSet.add(it.num)
          if (rec.sampleInvoices.length < 3) rec.sampleInvoices.push(it.num)
        }
      }
    }
    return Array.from(by.values())
      .map(r => ({ sku: r.sku, description: r.description, lineCount: r.lineCount, invoiceCount: r.invoiceSet.size, amount: r.amount, sampleInvoices: r.sampleInvoices }))
      .sort((a, b) => b.invoiceCount - a.invoiceCount || b.amount - a.amount)
  }, [lineItems])
  const [unresolvedSkusOpen, setUnresolvedSkusOpen] = useState(false)

  const parseAmount = (v) => {
    if (v == null || v === '') return null
    const n = parseFloat(String(v).replace(/[$,]/g, ''))
    return isNaN(n) ? null : n
  }

  // XLSX auto-parses date-looking cells into Excel serial numbers. With
  // cellDates:true we get JS Date objects instead; this helper formats them
  // back to mm/dd/yyyy. Already-string cells pass through unchanged.
  const cellToDateString = (v) => {
    if (v == null || v === '') return ''
    if (v instanceof Date) {
      const mm = String(v.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(v.getUTCDate()).padStart(2, '0')
      const yyyy = v.getUTCFullYear()
      return `${mm}/${dd}/${yyyy}`
    }
    return String(v).trim()
  }

  // Days from due date to today. Positive = past due, ≤0 or null = not past due.
  const daysPastDue = (dueDateStr) => {
    if (!dueDateStr) return null
    const m = String(dueDateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (!m) return null
    const [, mm, dd, yyyy] = m
    const due = new Date(Number(yyyy.length === 2 ? `20${yyyy}` : yyyy), Number(mm) - 1, Number(dd))
    if (isNaN(due.getTime())) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    due.setHours(0, 0, 0, 0)
    return Math.round((today.getTime() - due.getTime()) / 86400000)
  }

  // Status from the math: 0 owed = Paid, partial = Partial, full open = Open.
  const computeStatus = (amount, openBalance) => {
    if (amount == null || openBalance == null) return ''
    if (openBalance <= 0.005) return 'Paid'
    if (openBalance + 0.005 < amount) return 'Partial'
    return 'Open'
  }

  const handleFile = async (file, mode = 'replace') => {
    if (!file) return
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

      // Locate the header row. Two formats supported:
      //   - Flat (old "Open Invoices Report"): has a "Customer" column.
      //   - Grouped (new "Transaction List by Customer"): no Customer column;
      //     customer name appears in a header row above each invoice block.
      const headerIdx = matrix.findIndex(r => {
        if (!r) return false
        const cells = r.map(c => String(c || '').toLowerCase().trim())
        const hasDate = cells.includes('date')
        const hasNum = cells.includes('num')
        const hasAmount = cells.includes('amount')
        return (cells.includes('customer') && hasDate) || (hasDate && hasNum && hasAmount)
      })
      if (headerIdx === -1) throw new Error("Couldn't find a header row containing the expected invoice columns.")

      const headers = matrix[headerIdx].map(c => String(c || '').toLowerCase().trim())
      const col = {
        customer: headers.indexOf('customer'),
        date: headers.indexOf('date'),
        dueDate: headers.indexOf('due date'),
        transactionType: headers.indexOf('transaction type'),
        num: headers.indexOf('num'),
        amount: headers.indexOf('amount'),
        openBalance: headers.indexOf('open balance'),
      }
      const isGrouped = col.customer === -1

      const parsed = []

      if (!isGrouped) {
        // Flat format — customer column on every row.
        for (let i = headerIdx + 1; i < matrix.length; i++) {
          const r = matrix[i]
          if (!r || r.every(c => c == null || String(c).trim() === '')) continue
          const customer = String(r[col.customer] || '').trim()
          if (!customer) continue
          const numCell = col.num >= 0 ? String(r[col.num] || '').trim() : ''
          // Skip credit memos (SC* prefix). Per Tony's call 2026-06-24 they
          // shouldn't appear in the dataset until the Data Uploads redesign
          // gives them their own surface.
          if (/^SC/i.test(numCell)) continue
          const amount = col.amount >= 0 ? parseAmount(r[col.amount]) : null
          const openBalance = col.openBalance >= 0 ? parseAmount(r[col.openBalance]) : null
          parsed.push({
            customer,
            date: col.date >= 0 ? cellToDateString(r[col.date]) : '',
            dueDate: col.dueDate >= 0 ? cellToDateString(r[col.dueDate]) : '',
            num: numCell,
            amount,
            openBalance,
            status: computeStatus(amount, openBalance),
          })
        }
      } else {
        // Grouped format — customer in column 0 of header rows above each
        // invoice block. Track current customer, skip "Total for ..." rows
        // and any customer in src/lib/customerIgnoreList.js (internal QB
        // entries, rep records, promo orders, etc.). Also filter to
        // Transaction type === Invoice when that column is present.
        let currentCustomer = null
        let skipped = false
        for (let i = headerIdx + 1; i < matrix.length; i++) {
          const r = matrix[i]
          if (!r || r.every(c => c == null || String(c).trim() === '')) continue
          const firstCell = String(r[0] || '').trim()
          const numCell = col.num >= 0 ? String(r[col.num] || '').trim() : ''
          const amountCell = col.amount >= 0 ? r[col.amount] : null

          // Customer group header row (only first cell populated, no Num/Amount)
          if (firstCell && !numCell && !amountCell) {
            if (firstCell.startsWith('Total for')) {
              currentCustomer = null
              skipped = false
              continue
            }
            currentCustomer = firstCell
            skipped = shouldIgnoreCustomer(firstCell)
            continue
          }
          if (skipped) continue
          if (!numCell) continue

          // Filter to Invoice transactions only (skip Credit Memo, Payment, etc.)
          if (col.transactionType >= 0) {
            const tt = String(r[col.transactionType] || '').trim().toLowerCase()
            if (tt && tt !== 'invoice') continue
          }
          // Belt-and-suspenders: also drop anything with an SC* prefix (QB's
          // credit-memo convention) even if the Transaction type column is
          // absent. Hidden everywhere per Tony 2026-06-24 until the Data
          // Uploads redesign lands.
          if (/^SC/i.test(numCell)) continue

          const amount = parseAmount(amountCell)
          const openBalance = col.openBalance >= 0 ? parseAmount(r[col.openBalance]) : null
          parsed.push({
            customer: currentCustomer || '',
            date: col.date >= 0 ? cellToDateString(r[col.date]) : '',
            dueDate: col.dueDate >= 0 ? cellToDateString(r[col.dueDate]) : '',
            num: numCell,
            amount,
            openBalance,
            status: computeStatus(amount, openBalance),
          })
        }
      }

      const newMeta = {
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        count: parsed.length,
        format: isGrouped ? 'grouped' : 'flat',
      }
      if (mode === 'append') onAppend(parsed, newMeta)
      else onSave(parsed, newMeta)
      setPage(1)
    } catch (e) {
      setError(e.message || 'Failed to parse CSV')
    }
  }

  // Custom Yes/No confirm dialog for destructive Clear actions.
  const [confirmAction, setConfirmAction] = useState(null) // { message, onConfirm }
  const clearInvoices = () => {
    setConfirmAction({
      message: 'This action will clear all invoices, are you sure you want to proceed?',
      onConfirm: () => { onClear() },
    })
  }

  // ============ Line items CSV ("items by invoice") ============
  // Grouped format from QuickBooks "Sales by Customer Type Detail":
  //   - 3 metadata rows at the top
  //   - Header row with `Transaction type, Item customer type, Transaction date,
  //     Num, Product/Service full name, Description, Quantity, Sales price,
  //     Amount, Balance`
  //   - Customer name appears in column 0 of a "group header" row above each
  //     customer's invoices; data rows have an empty column 0.
  //   - "Total for {customer}" rows are summary rows to skip.
  //   - Customers in src/lib/customerIgnoreList.js are skipped entirely
  //     (internal QB entries, rep records, promo orders, etc.).
  const handleItemsFile = async (file, mode = 'replace') => {
    if (!file) return
    setItemsError(null)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

      // Find header row containing both "Num" and "Product/Service full name"
      const headerIdx = matrix.findIndex(r => {
        if (!r) return false
        const cells = r.map(c => String(c || '').toLowerCase().trim())
        return cells.includes('num') && cells.some(c => c.includes('product/service'))
      })
      if (headerIdx === -1) throw new Error("Couldn't find a header row containing 'Num' and 'Product/Service full name'.")

      const headers = matrix[headerIdx].map(c => String(c || '').toLowerCase().trim())
      const col = {
        transactionType: headers.indexOf('transaction type'),
        date: headers.findIndex(h => h.includes('transaction date') || h === 'date'),
        num: headers.indexOf('num'),
        sku: headers.findIndex(h => h.includes('product/service')),
        description: headers.indexOf('description'),
        qty: headers.findIndex(h => h === 'quantity' || h === 'qty'),
        salesPrice: headers.findIndex(h => h.includes('sales price') || h === 'price'),
        amount: headers.indexOf('amount'),
      }

      const parsed = []
      let currentCustomer = null
      let skippedCustomer = false  // true while inside a customer block we're skipping (per customerIgnoreList)

      for (let i = headerIdx + 1; i < matrix.length; i++) {
        const row = matrix[i]
        if (!row || row.every(c => c == null || String(c).trim() === '')) continue

        const firstCell = String(row[0] || '').trim()

        // Group header row (customer name) — first cell populated, other data cols empty
        const looksLikeGroupHeader = firstCell && !row[col.num] && !row[col.amount]
        if (looksLikeGroupHeader) {
          if (firstCell.startsWith('Total for')) {
            // End of a customer group; do nothing special, the next non-empty
            // first cell will set the new currentCustomer.
            currentCustomer = null
            skippedCustomer = false
            continue
          }
          currentCustomer = firstCell
          // Skip internal QB customer entry
          skippedCustomer = shouldIgnoreCustomer(currentCustomer)
          continue
        }
        if (skippedCustomer) continue

        // Data row — must have Num
        const num = col.num >= 0 ? String(row[col.num] || '').trim() : ''
        if (!num) continue

        const dateRaw = col.date >= 0 ? row[col.date] : null
        const date = cellToDateString(dateRaw)

        // Persisted shape kept LEAN — line items JSON for a full year easily
        // exceeds the ~5MB localStorage quota with full per-item fields.
        // Only persist what the engine + brand attribution actually use.
        // (description is light enough to include — helps triage unresolved
        // SKUs without needing the original CSV handy.)
        parsed.push({
          customer: currentCustomer || '',
          num,
          sku: col.sku >= 0 ? String(row[col.sku] || '').trim() : '',
          description: col.description >= 0 ? String(row[col.description] || '').trim() : '',
          amount: col.amount >= 0 ? parseAmount(row[col.amount]) : null,
        })
      }

      const distinctInvoices = new Set(parsed.map(p => p.num)).size
      const newMeta = {
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        count: parsed.length,
        invoiceCount: distinctInvoices,
      }
      if (mode === 'append') onAppendLineItems(parsed, newMeta)
      else onSaveLineItems(parsed, newMeta)
    } catch (e) {
      setItemsError(e.message || 'Failed to parse line items CSV')
    }
  }

  const clearLineItems = () => {
    setConfirmAction({
      message: 'This action will clear all line items, are you sure you want to proceed?',
      onConfirm: () => {
        onClearLineItems()
        setItemsError(null)
      },
    })
  }

  // ===== QB Payments transaction CSV =====
  const [paymentsError, setPaymentsError] = useState(null)
  const [lastPaymentsImport, setLastPaymentsImport] = useState(null)
  const handlePaymentsFile = async (file, mode = 'replace') => {
    setPaymentsError(null); setLastPaymentsImport(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
      const headerIdx = matrix.findIndex(r => r && r.some(c => /transaction type/i.test(String(c || ''))) && r.some(c => /amount/i.test(String(c || ''))))
      if (headerIdx < 0) throw new Error('Could not find header row (expected Date / Transaction type / Amount).')
      const headers = matrix[headerIdx].map(c => String(c || '').toLowerCase().trim())
      const col = {
        date: headers.indexOf('date'),
        type: headers.indexOf('transaction type'),
        memo: headers.findIndex(h => h.includes('memo')),
        num: headers.findIndex(h => h.includes('transaction number') || h === 'num'),
        amount: headers.indexOf('amount'),
      }
      const transactions = []
      let currentCustomer = null, skipped = false
      for (let i = headerIdx + 1; i < matrix.length; i++) {
        const r = matrix[i]
        if (!r || r.every(c => c == null || String(c).trim() === '')) continue
        const firstCell = String(r[0] || '').trim()
        const typeCell = col.type >= 0 ? String(r[col.type] || '').trim() : ''
        const amountCell = col.amount >= 0 ? r[col.amount] : null
        if (firstCell && !typeCell && (amountCell == null || amountCell === '')) {
          if (/^total /i.test(firstCell)) { currentCustomer = null; skipped = false; continue }
          currentCustomer = firstCell
          skipped = shouldIgnoreCustomer(firstCell)
          continue
        }
        if (skipped) continue
        if (!typeCell) continue
        transactions.push({
          customer: currentCustomer || '',
          date: col.date >= 0 ? cellToDateString(r[col.date]) : '',
          type: typeCell,
          memo: col.memo >= 0 ? String(r[col.memo] || '').trim() : '',
          num: col.num >= 0 ? String(r[col.num] || '').trim() : '',
          amount: parseAmount(amountCell),
        })
      }
      if (transactions.length === 0) throw new Error('No transactions found.')
      if (mode === 'append') {
        // Append/merge against the existing dataset. Payment rows have no single
        // unique key, so dedupe on the full parsed row identity: the same
        // transaction re-exported in an overlapping date range is field-for-field
        // identical, so only exact duplicates are dropped — distinct rows that
        // happen to share a customer/date/amount are kept.
        const keyOf = (t) => [t.customer, t.date, t.type, t.num, t.amount, t.memo].join('|')
        const seen = new Set(paymentsTx.map(keyOf))
        let added = 0, duplicates = 0
        const fresh = []
        for (const t of transactions) {
          const k = keyOf(t)
          if (seen.has(k)) { duplicates++; continue }
          seen.add(k); fresh.push(t)
          added++
        }
        const merged = [...paymentsTx, ...fresh]
        const meta = { fileName: file.name, uploadedAt: new Date().toISOString(), count: merged.length, lastAppendCount: added, lastAppendFile: file.name }
        onSavePaymentsTx(merged, meta)
        setLastPaymentsImport({ mode: 'append', fileName: file.name, added, duplicates, total: merged.length })
      } else {
        const meta = { fileName: file.name, uploadedAt: new Date().toISOString(), count: transactions.length }
        onSavePaymentsTx(transactions, meta)
        setLastPaymentsImport({ mode: 'replace', fileName: file.name, total: transactions.length })
      }
    } catch (e) { setPaymentsError(e.message || 'Failed to parse payments file') }
  }
  const clearPaymentsTxConfirm = () => {
    setConfirmAction({
      message: 'This action will clear all uploaded payments data, are you sure you want to proceed?',
      onConfirm: () => { onClearPaymentsTx(); setPaymentsError(null); setLastPaymentsImport(null) },
    })
  }
  const paymentsByType = useMemo(() => {
    const m = {}
    for (const t of paymentsTx) m[t.type] = (m[t.type] || 0) + 1
    return m
  }, [paymentsTx])

  // ===== BP invoice override CSV =====
  const [bpError, setBpError] = useState(null)
  const [lastBpImport, setLastBpImport] = useState(null)
  const handleBpFile = async (file) => {
    setBpError(null); setLastBpImport(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
      const headerIdx = matrix.findIndex(r => r && r.some(c => /^invoice$/i.test(String(c || '').trim())) && r.some(c => /^customer$/i.test(String(c || '').trim())))
      if (headerIdx < 0) throw new Error('Could not find header row with "Invoice" and "Customer" columns.')
      const headers = matrix[headerIdx].map(c => String(c || '').toLowerCase().trim())
      const invCol = headers.indexOf('invoice')
      const custCol = headers.indexOf('customer')
      const newOverrides = {}
      for (let i = headerIdx + 1; i < matrix.length; i++) {
        const r = matrix[i]; if (!r) continue
        const num = String(r[invCol] || '').trim()
        const cust = String(r[custCol] || '').trim()
        if (!num || !cust) continue
        newOverrides[num] = cust
      }
      const count = Object.keys(newOverrides).length
      if (count === 0) throw new Error('No invoice/customer pairs found.')
      const meta = { fileName: file.name, uploadedAt: new Date().toISOString(), count }
      await onMergeBpOverrides(newOverrides, meta)
      setLastBpImport({ fileName: file.name, added: count, totalAfter: Object.keys({ ...bpOverrides, ...newOverrides }).length })
    } catch (e) { setBpError(e.message || 'Failed to parse BP overrides file') }
  }
  const clearBpOverridesConfirm = () => {
    setConfirmAction({
      message: 'This action will clear all uploaded BP invoice overrides, are you sure you want to proceed?',
      onConfirm: () => { onClearBpOverrides(); setBpError(null); setLastBpImport(null) },
    })
  }

  // ===== WSR ACH remittance XLSX =====
  const [wsrError, setWsrError] = useState(null)
  const [lastWsrImport, setLastWsrImport] = useState(null)
  const handleWsrFile = async (file) => {
    setWsrError(null); setLastWsrImport(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false })
      const findLabel = (re) => {
        for (let i = 0; i < Math.min(10, matrix.length); i++) {
          const r = matrix[i] || []
          for (let j = 0; j < r.length; j++) {
            if (re.test(String(r[j] || ''))) {
              for (let k = j + 1; k < r.length; k++) if (r[k] != null && String(r[k]).trim() !== '') return r[k]
            }
          }
        }
        return null
      }
      const fmtDate = (v) => {
        if (v == null || v === '') return ''
        if (v instanceof Date) return v.toISOString().slice(0, 10)
        const s = String(v).trim()
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (m) return `${m[1]}-${m[2]}-${m[3]}`
        return s
      }
      const moneyToNum = (v) => {
        if (v == null || v === '') return 0
        if (typeof v === 'number') return v
        const s = String(v).trim()
        const isP = /^\(.*\)$/.test(s)
        const n = parseFloat(s.replace(/[$,()\s]/g, ''))
        return isNaN(n) ? 0 : (isP ? -n : n)
      }
      const checkDateRaw = findLabel(/check\s*date/i)
      const checkNumber = String(findLabel(/check\s*number/i) || '').trim()
      const paymentAmount = moneyToNum(findLabel(/payment\s*amount/i))
      const checkDate = fmtDate(checkDateRaw)
      if (!checkNumber) throw new Error('Could not find Check Number in the remittance header.')
      if (!checkDate) throw new Error('Could not find Check Date in the remittance header.')
      const detailHeaderIdx = matrix.findIndex(r => r && r.some(c => /^invoice\s*number$/i.test(String(c || '').trim())))
      if (detailHeaderIdx < 0) throw new Error('Could not find detail table header (expected "Invoice Number" column).')
      const dh = matrix[detailHeaderIdx].map(c => String(c || '').toLowerCase().trim())
      const col = {
        type: dh.findIndex(h => h === 'type'),
        invoiceNumber: dh.findIndex(h => h === 'invoice number'),
        invoiceDate: dh.findIndex(h => h === 'invoice date'),
        memberId: dh.findIndex(h => h === 'member id'),
        invoiceAmount: dh.findIndex(h => h === 'invoice amount'),
        vendorAdminFee: dh.findIndex(h => h === 'vendor admin fee'),
        amountPaid: dh.findIndex(h => h === 'amount paid'),
      }
      const invoices = []
      for (let i = detailHeaderIdx + 1; i < matrix.length; i++) {
        const r = matrix[i]
        if (!r) continue
        const num = col.invoiceNumber >= 0 ? String(r[col.invoiceNumber] || '').trim() : ''
        if (!num) continue
        if (/payment\s*total/i.test(String(r.join(' ') || ''))) break
        invoices.push({
          type: col.type >= 0 ? String(r[col.type] || '').trim() : '',
          invoiceNum: num,
          invoiceDate: col.invoiceDate >= 0 ? fmtDate(r[col.invoiceDate]) : '',
          memberId: col.memberId >= 0 ? String(r[col.memberId] || '').trim() : '',
          invoiceAmount: col.invoiceAmount >= 0 ? moneyToNum(r[col.invoiceAmount]) : 0,
          vendorAdminFee: col.vendorAdminFee >= 0 ? moneyToNum(r[col.vendorAdminFee]) : 0,
          amountPaid: col.amountPaid >= 0 ? moneyToNum(r[col.amountPaid]) : 0,
        })
      }
      if (invoices.length === 0) throw new Error('No invoice rows found in this remittance.')
      const rec = {
        id: `wsr-${checkNumber}`,
        uploadedAt: new Date().toISOString(),
        fileName: file.name,
        checkDate, checkNumber, paymentAmount, invoices,
      }
      await onAddWsrRemittance(rec)
      const sumPaid = invoices.reduce((s, i) => s + (i.amountPaid || 0), 0)
      setLastWsrImport({ fileName: file.name, checkNumber, checkDate, paymentAmount, invoiceCount: invoices.length, sumPaid })
    } catch (e) { setWsrError(e.message || 'Failed to parse WSR remittance file') }
  }
  const clearWsrRemittancesConfirm = () => {
    setConfirmAction({
      message: 'This action will clear all uploaded WSR remittance records, are you sure you want to proceed?',
      onConfirm: () => { onClearWsrRemittances(); setWsrError(null); setLastWsrImport(null) },
    })
  }
  const wsrInvoiceCount = useMemo(
    () => wsrRemittances.reduce((s, r) => s + (r.invoices?.length || 0), 0),
    [wsrRemittances]
  )
  const wsrTotalPaid = useMemo(
    () => wsrRemittances.reduce((s, r) => s + (r.paymentAmount || 0), 0),
    [wsrRemittances]
  )
  const latestWsrRemittance = wsrRemittances[0] || null

  // Sort controls for the customer drill-in view.
  // Convert "mm/dd/yyyy" strings to "yyyy-mm-dd" for lex-comparable date sorting.
  const dateKey = (s) => {
    if (!s) return ''
    const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (!m) return s
    const [, mm, dd, yyyy] = m
    const y = yyyy.length === 2 ? `20${yyyy}` : yyyy
    return `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  const sortKeyFor = (col) => (r) => {
    switch (col) {
      case 'num':         return r.num || ''
      case 'date':        return dateKey(r.date)
      case 'dueDate':     return dateKey(r.dueDate)
      case 'pastDue':     return daysPastDue(r.dueDate) ?? Number.NEGATIVE_INFINITY
      case 'status':      return r.status || ''
      case 'amount':      return r.amount ?? 0
      case 'openBalance': return r.openBalance ?? 0
      default:            return ''
    }
  }
  const [detailSortBy, setDetailSortBy] = useState('date')
  const [detailSortDir, setDetailSortDir] = useState('desc')
  const toggleDetailSort = (col) => {
    if (detailSortBy === col) {
      setDetailSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setDetailSortBy(col)
      // Numeric/date columns default to desc (biggest/newest first); text to asc.
      const numericCols = new Set(['date', 'dueDate', 'pastDue', 'amount', 'openBalance'])
      setDetailSortDir(numericCols.has(col) ? 'desc' : 'asc')
    }
  }

  // Invoices for the selected customer (drill-in view).
  const selectedCustomerInvoices = useMemo(() => {
    if (!selectedCustomer) return []
    const key = sortKeyFor(detailSortBy)
    const sign = detailSortDir === 'asc' ? 1 : -1
    return rows
      .filter(r => r.customer === selectedCustomer)
      .slice()
      .sort((a, b) => {
        const ka = key(a), kb = key(b)
        if (ka < kb) return -1 * sign
        if (ka > kb) return  1 * sign
        return 0
      })
  }, [rows, selectedCustomer, detailSortBy, detailSortDir])
  const selectedCustomerTotals = useMemo(() => ({
    count: selectedCustomerInvoices.length,
    amount: selectedCustomerInvoices.reduce((s, r) => s + (r.amount || 0), 0),
    openBalance: selectedCustomerInvoices.reduce((s, r) => s + (r.openBalance || 0), 0),
    paid: selectedCustomerInvoices.filter(r => r.status === 'Paid').length,
    open: selectedCustomerInvoices.filter(r => r.status === 'Open').length,
    partial: selectedCustomerInvoices.filter(r => r.status === 'Partial').length,
  }), [selectedCustomerInvoices])

  // ─── Customer drill-in view ───
  // When highlightNum is set, scroll to and visually flash that row on mount.
  const highlightedRowRef = useHighlightedRow(highlightNum, selectedCustomer, clearHighlight)
  if (selectedCustomer) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>
          <ArrowLeft className="size-4 mr-1" /> Back to all customers
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>{selectedCustomer}</CardTitle>
            <CardDescription>
              {selectedCustomerTotals.count} {selectedCustomerTotals.count === 1 ? 'invoice' : 'invoices'}
              {' • '}
              {[
                selectedCustomerTotals.paid > 0 && `${selectedCustomerTotals.paid} paid`,
                selectedCustomerTotals.open > 0 && `${selectedCustomerTotals.open} open`,
                selectedCustomerTotals.partial > 0 && `${selectedCustomerTotals.partial} partial`,
              ].filter(Boolean).join(' · ')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm items-baseline">
              <div><span className="text-muted-foreground">Total Amount:</span> <span className="font-medium">{fmt(selectedCustomerTotals.amount)}</span></div>
              <div><span className="text-muted-foreground">Total Open:</span> <span className="font-bold text-[#005b5b]">{fmt(selectedCustomerTotals.openBalance)}</span></div>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-xs uppercase text-muted-foreground border-b select-none">
                <SortableTh col="num"         label="Num"          align="left"  sortBy={detailSortBy} sortDir={detailSortDir} onClick={toggleDetailSort} />
                <SortableTh col="date"        label="Date"         align="left"  sortBy={detailSortBy} sortDir={detailSortDir} onClick={toggleDetailSort} />
                <SortableTh col="dueDate"     label="Due Date"     align="left"  sortBy={detailSortBy} sortDir={detailSortDir} onClick={toggleDetailSort} />
                <SortableTh col="pastDue"     label="Past Due"     align="right" sortBy={detailSortBy} sortDir={detailSortDir} onClick={toggleDetailSort} />
                <SortableTh col="status"      label="Status"       align="left"  sortBy={detailSortBy} sortDir={detailSortDir} onClick={toggleDetailSort} />
                <SortableTh col="amount"      label="Amount"       align="right" sortBy={detailSortBy} sortDir={detailSortDir} onClick={toggleDetailSort} />
                <SortableTh col="openBalance" label="Open Balance" align="right" sortBy={detailSortBy} sortDir={detailSortDir} onClick={toggleDetailSort} />
              </tr>
            </thead>
            <tbody>
              {selectedCustomerInvoices.map((r, idx) => {
                const days = daysPastDue(r.dueDate)
                const isHighlighted = highlightNum && r.num === highlightNum
                return (
                  <tr
                    key={`${r.num}-${idx}`}
                    ref={isHighlighted ? highlightedRowRef : null}
                    className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isHighlighted ? 'bg-amber-100 dark:bg-amber-900/40 ring-2 ring-amber-400 ring-inset' : ''}`}
                  >
                    <td className="py-2.5 px-4 text-xs whitespace-nowrap">{r.num || '—'}</td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">{r.date || '—'}</td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">{r.dueDate || '—'}</td>
                    <td className={`py-2.5 px-4 text-right text-xs whitespace-nowrap ${days != null && days > 0 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                      {days != null && days > 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : '—'}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {r.status === 'Paid' && <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Paid</span>}
                      {r.status === 'Partial' && <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Partial</span>}
                      {r.status === 'Open' && <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-[#005b5b]/10 text-[#005b5b]">Open</span>}
                      {!r.status && <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">{r.amount != null ? fmt(r.amount) : '—'}</td>
                    <td className={`py-2.5 px-4 text-right font-bold whitespace-nowrap ${r.openBalance ? 'text-[#005b5b]' : 'text-muted-foreground'}`}>
                      {r.openBalance != null ? fmt(r.openBalance) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
          className={`rounded-lg border-2 border-dashed py-16 px-6 text-center transition-colors ${
            isDragging ? 'border-[#005b5b] bg-[#005b5b]/5' : 'border-muted-foreground/30'
          }`}
        >
          <FileSpreadsheet className="size-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">Step 1 — Invoices CSV</p>
          <p className="text-sm text-muted-foreground mb-4">Drag and drop your CSV file here, or</p>
          <label className="inline-flex">
            <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            <span className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-[#005b5b] text-white hover:bg-[#004848] cursor-pointer gap-1.5">
              <Upload className="size-4" /> Choose CSV file
            </span>
          </label>
          <p className="text-xs text-muted-foreground mt-3">Expected columns: Customer, Date, Due date, Num, Amount, Open balance</p>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>

        {/* Line items upload is optional but enables brand attribution */}
        <LineItemsUploader
          lineItems={lineItems}
          lineItemsMeta={lineItemsMeta}
          itemsInvoiceCount={itemsInvoiceCount}
          itemsError={itemsError}
          lastImport={lastLineItemsImport}
          onPickFile={handleItemsFile}
          onClear={clearLineItems}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Invoices uploader */}
      <div className="rounded-lg border border-input bg-background p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h3 className="font-semibold inline-flex items-center gap-1.5">
              Invoices CSV
              <InfoTip>
                <p className="font-medium mb-1">Invoices CSV</p>
                <p>The core data source — every QuickBooks invoice (SI) and credit memo (SC) we track for commission attribution.</p>
                <p className="mt-1 text-muted-foreground">Append merges new invoices into what's already loaded; Replace wipes and reloads from scratch.</p>
              </InfoTip>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              QuickBooks invoices export. {rows.length > 0 ? `${rows.length.toLocaleString()} invoices loaded.` : 'No invoices loaded yet.'}
              {meta && <> • <span className="text-muted-foreground">Source: {meta.fileName} • {new Date(meta.uploadedAt).toLocaleString()}</span></>}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <label className="inline-flex">
              <input
                type="file" accept=".csv" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) { handleFile(e.target.files[0], 'append'); e.target.value = '' } }}
              />
              <span className="inline-flex items-center px-3 py-1.5 text-sm rounded-md bg-[#005b5b] text-white hover:bg-[#004848] cursor-pointer gap-1.5">
                <Upload className="size-4" /> Append CSV
              </span>
            </label>
            <label className="inline-flex">
              <input
                type="file" accept=".csv" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) { handleFile(e.target.files[0], 'replace'); e.target.value = '' } }}
              />
              <span className="inline-flex items-center px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-muted cursor-pointer gap-1.5">
                Replace
              </span>
            </label>
            <Button variant="ghost" size="sm" onClick={clearInvoices} className="text-muted-foreground">Clear</Button>
          </div>
        </div>
        {lastInvoicesImport && (
          <div className="text-xs text-[#005b5b] bg-[#005b5b]/5 border border-[#005b5b]/20 rounded-md px-3 py-2 mt-2">
            {lastInvoicesImport.mode === 'append'
              ? (
                  <>
                    Merged: {lastInvoicesImport.added} new invoices, {lastInvoicesImport.updated} updated, total now {lastInvoicesImport.total.toLocaleString()}.
                    {lastInvoicesImport.wsrPreserved > 0 && (
                      <> <span className="font-medium">{lastInvoicesImport.wsrPreserved} WSR rename{lastInvoicesImport.wsrPreserved === 1 ? '' : 's'} preserved</span> (original member names kept on paid invoices).</>
                    )}
                  </>
                )
              : `Loaded ${lastInvoicesImport.total.toLocaleString()} invoices (replaced).`
            }
          </div>
        )}
      </div>

      {/* Invoices-without-line-items data-integrity banner */}
      {invoicesMissingLineItems.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2.5 text-sm">
          <button
            type="button"
            onClick={() => setMissingItemsOpen(o => !o)}
            className="flex items-center justify-between gap-2 w-full text-left"
            aria-expanded={missingItemsOpen}
          >
            <span className="text-amber-900 dark:text-amber-200">
              <span className="font-semibold">Missing line items:</span>{' '}
              {invoicesMissingLineItems.length} {invoicesMissingLineItems.length === 1 ? 'invoice has' : 'invoices have'} no line items uploaded
              {' • '}
              <span className="font-medium">{fmt(invoicesMissingLineItems.reduce((s, r) => s + (r.amount || 0), 0))}</span> total
              {' — '}
              <span className="underline">{missingItemsOpen ? 'Hide' : 'View'}</span>
            </span>
          </button>
          {missingItemsOpen && (
            <div className="mt-3 max-h-72 overflow-y-auto pr-1 border-t border-amber-200 dark:border-amber-900 pt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-amber-900 dark:text-amber-200 text-left">
                    <th className="py-1 pr-3 font-medium">Num</th>
                    <th className="py-1 pr-3 font-medium">Customer</th>
                    <th className="py-1 pr-3 font-medium">Date</th>
                    <th className="py-1 pr-3 font-medium text-left">Status</th>
                    <th className="py-1 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoicesMissingLineItems.slice(0, 200).map((r, idx) => (
                    <tr key={`${r.num}-${idx}`} className="border-t border-amber-100 dark:border-amber-900/60">
                      <td className="py-1 pr-3 whitespace-nowrap font-medium">{r.num}</td>
                      <td className="py-1 pr-3 truncate max-w-xs">{r.customer}</td>
                      <td className="py-1 pr-3 whitespace-nowrap text-muted-foreground">{r.date || '—'}</td>
                      <td className="py-1 pr-3 whitespace-nowrap">{r.status || '—'}</td>
                      <td className="py-1 text-right whitespace-nowrap">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                  {invoicesMissingLineItems.length > 200 && (
                    <tr>
                      <td colSpan={5} className="py-1 text-center text-muted-foreground">
                        ... and {invoicesMissingLineItems.length - 200} more.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Unresolved-SKU banner — line items whose SKU isn't in any catalog
          xlsx, so they don't get a brand attribution. Different from the
          banner above (which is about invoices that have zero line items
          at all). */}
      {unresolvedSkus.length > 0 && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-900 px-3 py-2.5 text-sm">
          <button
            type="button"
            onClick={() => setUnresolvedSkusOpen(o => !o)}
            className="flex items-center justify-between gap-2 w-full text-left"
            aria-expanded={unresolvedSkusOpen}
          >
            <span className="text-orange-900 dark:text-orange-200">
              <span className="font-semibold">Unresolved SKUs:</span>{' '}
              {unresolvedSkus.length} distinct {unresolvedSkus.length === 1 ? 'SKU has' : 'SKUs have'} no brand match
              {' • '}
              <span className="font-medium">
                {unresolvedSkus.reduce((s, r) => s + r.invoiceCount, 0)} invoice{unresolvedSkus.reduce((s, r) => s + r.invoiceCount, 0) === 1 ? '' : 's'}
              </span>
              {' affected • '}
              <span className="font-medium">{fmt(unresolvedSkus.reduce((s, r) => s + r.amount, 0))}</span>
              {' — '}
              <span className="underline">{unresolvedSkusOpen ? 'Hide' : 'View'}</span>
            </span>
          </button>
          {unresolvedSkusOpen && (
            <div className="mt-3 max-h-80 overflow-y-auto pr-1 border-t border-orange-200 dark:border-orange-900 pt-2">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="text-xs text-orange-800 dark:text-orange-300/80">
                  These SKUs appear on line items but aren't in any catalog xlsx (so they don't drive brand attribution). Likely causes: older-season carry-over, non-product SKUs (SHIPPING / DISCOUNT / SAMPLES), typos, or a missing catalog file in <code className="text-[10px]">catalogs/{'{'}season{'}'}/</code>.
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date().toISOString().slice(0, 10)
                    const header = ['SKU', 'Item Description', 'Lines', 'Invoices', 'Amount', 'Sample invoices']
                    const rows = unresolvedSkus.map(r => [r.sku, r.description || '', r.lineCount, r.invoiceCount, r.amount || 0, r.sampleInvoices.join(', ')])
                    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
                    ws['!cols'] = [{ wch: 22 }, { wch: 38 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 40 }]
                    const wb = XLSX.utils.book_new()
                    XLSX.utils.book_append_sheet(wb, ws, 'Unresolved SKUs')
                    XLSX.writeFile(wb, `unresolved-skus ${today}.xlsx`)
                  }}
                  className="shrink-0 text-xs h-7"
                >
                  <FileSpreadsheet className="size-3.5 mr-1" /> Export
                </Button>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-orange-900 dark:text-orange-200 text-left border-b border-orange-200 dark:border-orange-900">
                    <th className="py-1 pr-3 font-medium">SKU</th>
                    <th className="py-1 pr-3 font-medium">Item Description</th>
                    <th className="py-1 pr-3 font-medium text-right">Lines</th>
                    <th className="py-1 pr-3 font-medium text-right">Invoices</th>
                    <th className="py-1 pr-3 font-medium text-right">Amount</th>
                    <th className="py-1 font-medium">Sample invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {unresolvedSkus.slice(0, 200).map((r) => (
                    <tr key={r.sku} className="border-t border-orange-100 dark:border-orange-900/60">
                      <td className="py-1 pr-3 font-mono whitespace-nowrap">{r.sku}</td>
                      <td className="py-1 pr-3 truncate max-w-[20rem]">{r.description || <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-1 pr-3 text-right whitespace-nowrap">{r.lineCount}</td>
                      <td className="py-1 pr-3 text-right whitespace-nowrap">{r.invoiceCount}</td>
                      <td className="py-1 pr-3 text-right whitespace-nowrap">{fmt(r.amount)}</td>
                      <td className="py-1 text-muted-foreground truncate max-w-[16rem]">{r.sampleInvoices.join(', ')}</td>
                    </tr>
                  ))}
                  {unresolvedSkus.length > 200 && (
                    <tr>
                      <td colSpan={6} className="py-1 text-center text-muted-foreground">
                        ... and {unresolvedSkus.length - 200} more.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Line items uploader / status */}
      <LineItemsUploader
        lineItems={lineItems}
        lineItemsMeta={lineItemsMeta}
        itemsInvoiceCount={itemsInvoiceCount}
        itemsError={itemsError || lineItemsStorageError}
        lastImport={lastLineItemsImport}
        onPickFile={handleItemsFile}
        onClear={clearLineItems}
        compact
      />

      <PaymentsTxUploader
        transactions={paymentsTx}
        meta={paymentsTxMeta}
        byType={paymentsByType}
        onPickFile={handlePaymentsFile}
        onClear={clearPaymentsTxConfirm}
        error={paymentsError}
        lastImport={lastPaymentsImport}
      />

      <BpOverridesUploader
        overrides={bpOverrides}
        meta={bpOverridesMeta}
        appliedCount={bpOverridesAppliedCount}
        onPickFile={handleBpFile}
        onClear={clearBpOverridesConfirm}
        error={bpError}
        lastImport={lastBpImport}
      />

      <WsrRemittanceUploader
        remittances={wsrRemittances}
        latest={latestWsrRemittance}
        totalInvoices={wsrInvoiceCount}
        totalPaid={wsrTotalPaid}
        wsrAttributedCount={wsrAttributedCount}
        onPickFile={handleWsrFile}
        onClear={clearWsrRemittancesConfirm}
        error={wsrError}
        lastImport={lastWsrImport}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Dialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm</DialogTitle>
            <DialogDescription>{confirmAction?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>No</Button>
            <Button
              onClick={() => {
                const action = confirmAction
                setConfirmAction(null)
                action?.onConfirm?.()
              }}
              className="bg-[#005b5b] hover:bg-[#004848]"
            >
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =====================================================================
// AccountDetailView — cross-rep, cross-brand history for one account
// =====================================================================
function AccountDetailView({ account, entries, reps, brands, invoices = [], lineItems = [], onBack, onJumpToInvoice }) {
  // Match invoices for this account using the same fuzzy normalization as the
  // unmatched-invoices banner: strip "- Contact" suffixes, parens, punctuation.
  const accountInvoices = useMemo(() => {
    const norm = (s) => String(s || '')
      .toUpperCase()
      .replace(/['']/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+-\s.*$/, '')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const want = norm(account.name)
    if (!want) return []
    const exact = invoices.filter(inv => norm(inv.customer) === want)
    if (exact.length > 0) return exact
    // Substring fallback (both directions, min 4 chars) — same as engine logic.
    return invoices.filter(inv => {
      const got = norm(inv.customer)
      return got && Math.min(got.length, want.length) >= 4 && (got.includes(want) || want.includes(got))
    })
  }, [invoices, account.name])

  // Convert mm/dd/yyyy → yyyy-mm-dd for proper min/max comparison.
  const isoDate = (s) => {
    if (!s) return ''
    const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (!m) return s
    const [, mm, dd, yyyy] = m
    const y = yyyy.length === 2 ? `20${yyyy}` : yyyy
    return `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  const fmtUSDate = (s) => s || '—'

  const accountStats = useMemo(() => {
    let totalSales = 0
    let openBalance = 0
    let paidCount = 0, openCount = 0, partialCount = 0
    let firstIso = '', lastIso = '', firstDisplay = '', lastDisplay = ''
    for (const inv of accountInvoices) {
      totalSales += inv.amount || 0
      openBalance += inv.openBalance || 0
      if (inv.status === 'Paid') paidCount++
      else if (inv.status === 'Open') openCount++
      else if (inv.status === 'Partial') partialCount++
      const iso = isoDate(inv.date)
      if (iso) {
        if (!firstIso || iso < firstIso) { firstIso = iso; firstDisplay = inv.date }
        if (!lastIso || iso > lastIso)   { lastIso = iso;   lastDisplay = inv.date }
      }
    }
    return {
      totalSales, openBalance,
      count: accountInvoices.length,
      paidCount, openCount, partialCount,
      firstInvoiceDate: firstDisplay,
      lastInvoiceDate: lastDisplay,
    }
  }, [accountInvoices])

  // Keep the old entry-derived numbers as fallback when no invoice data is loaded.
  const entryFallback = useMemo(() => {
    const paid = entries.reduce((s, e) => s + (e.actualPaid || 0), 0)
    const commission = entries.reduce((s, e) => s + (e.commission || 0), 0)
    return { paid, commission, count: entries.length }
  }, [entries])

  const sorted = useMemo(() => [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || '')), [entries])
  const repName = (id) => reps.find(r => r.id === id)?.name || id
  const brandName = (id) => brands.find(b => b.id === id)?.name || id

  // Past-due days from a mm/dd/yyyy due date. Positive = past due.
  const daysPastDue = (dueDateStr) => {
    if (!dueDateStr) return null
    const m = String(dueDateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (!m) return null
    const [, mm, dd, yyyy] = m
    const y = yyyy.length === 2 ? `20${yyyy}` : yyyy
    const due = new Date(Number(y), Number(mm) - 1, Number(dd))
    if (isNaN(due.getTime())) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    due.setHours(0, 0, 0, 0)
    return Math.round((today.getTime() - due.getTime()) / 86400000)
  }

  // Sortable invoice table for this account.
  const [invSortBy, setInvSortBy] = useState('date')
  const [invSortDir, setInvSortDir] = useState('desc')
  const invSortKey = (col) => (r) => {
    switch (col) {
      case 'num':         return r.num || ''
      case 'date':        return isoDate(r.date)
      case 'dueDate':     return isoDate(r.dueDate)
      case 'pastDue':     return daysPastDue(r.dueDate) ?? Number.NEGATIVE_INFINITY
      case 'status':      return r.status || ''
      case 'amount':      return r.amount ?? 0
      case 'openBalance': return r.openBalance ?? 0
      default:            return ''
    }
  }
  const toggleInvSort = (col) => {
    if (invSortBy === col) {
      setInvSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setInvSortBy(col)
      const numeric = new Set(['date', 'dueDate', 'pastDue', 'amount', 'openBalance'])
      setInvSortDir(numeric.has(col) ? 'desc' : 'asc')
    }
  }
  // Filters above the invoice table
  const [statusFilter, setStatusFilter] = useState('all')   // all | Paid | Open | Partial
  const [fromDate, setFromDate] = useState('')              // YYYY-MM-DD
  const [toDate, setToDate] = useState('')

  // Brand attribution per invoice — looks up each line item's SKU through the
  // catalog and collects distinct brands for the invoice.
  const brandsByInvoiceNum = useMemo(() => {
    const m = {}
    for (const item of lineItems || []) {
      if (!item?.num) continue
      const info = lookupBrand(item.sku)
      if (!info?.brandName) continue
      if (!m[item.num]) m[item.num] = new Set()
      m[item.num].add(info.brandName)
    }
    const out = {}
    for (const k of Object.keys(m)) out[k] = Array.from(m[k]).sort()
    return out
  }, [lineItems])

  const filteredInvoices = useMemo(() => {
    return accountInvoices.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      const iso = isoDate(r.date)
      if (fromDate && iso && iso < fromDate) return false
      if (toDate && iso && iso > toDate) return false
      return true
    })
  }, [accountInvoices, statusFilter, fromDate, toDate])

  const sortedInvoices = useMemo(() => {
    const key = invSortKey(invSortBy)
    const sign = invSortDir === 'asc' ? 1 : -1
    return [...filteredInvoices].sort((a, b) => {
      const ka = key(a), kb = key(b)
      if (ka < kb) return -1 * sign
      if (ka > kb) return  1 * sign
      return 0
    })
  }, [filteredInvoices, invSortBy, invSortDir])

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

      {/* Summary — invoice-derived KPIs when invoices are loaded, falls back
          to entry-derived numbers when not. */}
      {accountInvoices.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Sales</CardDescription>
              <CardTitle className="text-2xl">{fmt(accountStats.totalSales)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Open Balance</CardDescription>
              <CardTitle className={`text-2xl ${accountStats.openBalance > 0 ? 'text-[#005b5b]' : ''}`}>{fmt(accountStats.openBalance)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Invoices</CardDescription>
              <CardTitle className="text-2xl">{accountStats.count.toLocaleString()}</CardTitle>
              <div className="text-xs text-muted-foreground mt-1">
                {accountStats.paidCount > 0 && <span className="text-emerald-700 dark:text-emerald-300">{accountStats.paidCount} paid</span>}
                {accountStats.openCount > 0 && <span>{accountStats.paidCount > 0 && ' · '}<span className="text-[#005b5b]">{accountStats.openCount} open</span></span>}
                {accountStats.partialCount > 0 && <span>{(accountStats.paidCount > 0 || accountStats.openCount > 0) && ' · '}<span className="text-amber-700 dark:text-amber-300">{accountStats.partialCount} partial</span></span>}
              </div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>First Invoice</CardDescription>
              <CardTitle className="text-xl">{fmtUSDate(accountStats.firstInvoiceDate)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Last Invoice</CardDescription>
              <CardTitle className="text-xl">{fmtUSDate(accountStats.lastInvoiceDate)}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Entries</CardDescription>
              <CardTitle className="text-2xl">{entryFallback.count}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Lifetime Paid</CardDescription>
              <CardTitle className="text-2xl">{fmt(entryFallback.paid)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Commission Earned</CardDescription>
              <CardTitle className="text-2xl text-[#005b5b]">{fmt(entryFallback.commission)}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Invoice list for this account */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>
                {accountInvoices.length === 0
                  ? 'No invoices matched to this account.'
                  : `${sortedInvoices.length} of ${accountInvoices.length} ${accountInvoices.length === 1 ? 'invoice' : 'invoices'} shown`
                }
              </CardDescription>
            </div>
            {accountInvoices.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-8 px-2 rounded-md border border-input bg-transparent text-xs"
                >
                  <option value="all">All statuses</option>
                  <option value="Paid">Paid</option>
                  <option value="Open">Open</option>
                  <option value="Partial">Partial</option>
                </select>
                <Label className="text-muted-foreground">From</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36 h-8 text-xs" />
                <Label className="text-muted-foreground">To</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36 h-8 text-xs" />
                {(statusFilter !== 'all' || fromDate || toDate) && (
                  <Button variant="ghost" size="sm" onClick={() => { setStatusFilter('all'); setFromDate(''); setToDate('') }} className="text-muted-foreground h-7">
                    Clear
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {accountInvoices.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              No invoices found for this customer. Upload an invoices CSV from the Invoices tab to populate.
            </div>
          ) : sortedInvoices.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              No invoices match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground bg-muted/30 select-none">
                    <SortableTh col="num"         label="Num"          align="left"  sortBy={invSortBy} sortDir={invSortDir} onClick={toggleInvSort} />
                    <SortableTh col="date"        label="Date"         align="left"  sortBy={invSortBy} sortDir={invSortDir} onClick={toggleInvSort} />
                    <SortableTh col="dueDate"     label="Due Date"     align="left"  sortBy={invSortBy} sortDir={invSortDir} onClick={toggleInvSort} />
                    <SortableTh col="pastDue"     label="Past Due"     align="right" sortBy={invSortBy} sortDir={invSortDir} onClick={toggleInvSort} />
                    <SortableTh col="status"      label="Status"       align="left"  sortBy={invSortBy} sortDir={invSortDir} onClick={toggleInvSort} />
                    <th className="py-2 px-4 text-left font-medium">Brand</th>
                    <SortableTh col="amount"      label="Amount"       align="right" sortBy={invSortBy} sortDir={invSortDir} onClick={toggleInvSort} />
                    <SortableTh col="openBalance" label="Open Balance" align="right" sortBy={invSortBy} sortDir={invSortDir} onClick={toggleInvSort} />
                  </tr>
                </thead>
                <tbody>
                  {sortedInvoices.map((r, idx) => {
                    const days = daysPastDue(r.dueDate)
                    const invBrands = brandsByInvoiceNum[r.num] || []
                    return (
                      <tr
                        key={`${r.num}-${idx}`}
                        onClick={() => onJumpToInvoice?.(r.customer, r.num)}
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      >
                        <td className="py-2.5 px-4 text-xs whitespace-nowrap text-[#005b5b] font-medium hover:underline">{r.num || '—'}</td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">{r.date || '—'}</td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">{r.dueDate || '—'}</td>
                        <td className={`py-2.5 px-4 text-right text-xs whitespace-nowrap ${days != null && days > 0 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                          {days != null && days > 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : '—'}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          {r.status === 'Paid' && <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Paid</span>}
                          {r.status === 'Partial' && <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Partial</span>}
                          {r.status === 'Open' && <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-[#005b5b]/10 text-[#005b5b]">Open</span>}
                          {!r.status && <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2.5 px-4">
                          {invBrands.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {invBrands.map(b => (
                                <span key={b} className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-[#005b5b]/10 text-[#005b5b]">{b}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">{r.amount != null ? fmt(r.amount) : '—'}</td>
                        <td className={`py-2.5 px-4 text-right font-bold whitespace-nowrap ${r.openBalance ? 'text-[#005b5b]' : 'text-muted-foreground'}`}>
                          {r.openBalance != null ? fmt(r.openBalance) : '—'}
                        </td>
                      </tr>
                    )
                  })}
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
// PortalMigrateButton — one-time push of this browser's data to Supabase
// =====================================================================
function PortalMigrateButton() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [overwrite, setOverwrite] = useState(false)

  const run = async () => {
    setStatus('running'); setError(null)
    try {
      const r = await migrateLocalToServer({ overwrite })
      setResult(r); setStatus('done')
    } catch (e) {
      setError(e?.message || 'Sync failed'); setStatus('error')
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); setStatus('idle'); setResult(null); setError(null); setOverwrite(false) }}>
        <Upload className="size-4 mr-1.5" /> Sync to server
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (status !== 'running') setOpen(o) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sync local data to the server</DialogTitle>
            <DialogDescription>
              Pushes the datasets currently in this browser up to Supabase so accounting@foundrydist.com — and any login — sees the same data. Run this once, from the browser that holds your data.
            </DialogDescription>
          </DialogHeader>
          {status === 'done' && result ? (
            <div className="space-y-2 text-sm">
              <div className="text-[#005b5b] font-semibold">Synced ✓</div>
              <div><span className="text-muted-foreground">Pushed:</span> {result.pushed.length ? result.pushed.map(p => `${p.key} (${p.count.toLocaleString()})`).join(', ') : 'nothing new'}</div>
              {result.skipped.length > 0 && <div className="text-muted-foreground">Skipped (server already had): {result.skipped.join(', ')}</div>}
              {result.empty.length > 0 && <div className="text-muted-foreground">Empty locally: {result.empty.join(', ')}</div>}
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} className="size-3.5" />
                Overwrite datasets that already exist on the server
              </label>
              <p className="text-xs text-muted-foreground">
                By default only datasets the server doesn't already have are pushed, so this is safe to re-run. Check the box to force-replace the server copy with this browser's data.
              </p>
              {error && <p className="text-red-600">{error}</p>}
            </div>
          )}
          <DialogFooter>
            {status === 'done' ? (
              <Button onClick={() => setOpen(false)} className="bg-[#005b5b] hover:bg-[#004848]">Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={status === 'running'}>Cancel</Button>
                <Button onClick={run} disabled={status === 'running'} className="bg-[#005b5b] hover:bg-[#004848]">
                  {status === 'running' ? 'Syncing…' : 'Sync now'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// =====================================================================
// EmailReportModal — email the rep's PDF + XLSX report from accounting@
// =====================================================================
function EmailReportModal({ open, onOpenChange, rep, exportArgs }) {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    const first = (rep?.name || '').split(' ')[0] || 'there'
    setTo(rep?.email || '')
    setSubject('Your Foundry Distribution commission report')
    setMessage(`Hi ${first},\n\nAttached is your latest commission report (PDF and Excel). Please review it and let us know if you have any questions.\n\nThank you,\nFoundry Distribution Accounting`)
    setStatus('idle')
    setError(null)
  }, [open, rep])

  const send = async () => {
    setError(null)
    if (!to.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) {
      setError('Enter a valid recipient email address.')
      return
    }
    setStatus('sending')
    try {
      const pdf = exportRepReportPDF({ ...exportArgs, returnBase64: true })
      const xlsx = exportRepReportXLSX({ ...exportArgs, returnBase64: true })
      const { data, error: fnError } = await supabase.functions.invoke('email-rep-report', {
        body: {
          repName: rep?.name || '',
          repEmail: to.trim(),
          subject: subject.trim() || 'Your commission report',
          message,
          pdfBase64: pdf.base64, pdfFilename: pdf.filename,
          xlsxBase64: xlsx.base64, xlsxFilename: xlsx.filename,
        },
      })
      if (fnError) throw new Error(fnError.message || 'Send failed')
      if (data?.error) throw new Error(data.error)
      setStatus('sent')
    } catch (e) {
      setStatus('error')
      setError(e?.message || 'Failed to send. Please try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && status !== 'sending') onOpenChange(false) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Email report to {rep?.name}</DialogTitle>
          <DialogDescription>Sends the PDF + Excel commission report from accounting@foundrydist.com.</DialogDescription>
        </DialogHeader>
        {status === 'sent' ? (
          <div className="py-8 text-center">
            <div className="text-[#005b5b] font-semibold text-lg mb-1">Sent ✓</div>
            <div className="text-sm text-muted-foreground">Report emailed to {to}.</div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>To</Label>
              <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="rep@example.com" />
              {!rep?.email && <p className="text-xs text-amber-600">No email on file for this rep — enter one above.</p>}
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm resize-y"
              />
            </div>
            <p className="text-xs text-muted-foreground">Attachments: {rep?.name} commission report (PDF + Excel).</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
        <DialogFooter>
          {status === 'sent' ? (
            <Button onClick={() => onOpenChange(false)} className="bg-[#005b5b] hover:bg-[#004848]">Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={status === 'sending'}>Cancel</Button>
              <Button onClick={send} disabled={status === 'sending'} className="bg-[#005b5b] hover:bg-[#004848]">
                {status === 'sending' ? 'Sending…' : 'Send email'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =====================================================================
// RepLedgerView — per-rep commission ledger (the 3 monthly-report sections)
// =====================================================================
function RepLedgerView({ rep, aggregate, summary, payouts, repAccountInvoices = [], paymentDatesByInvoiceNum, paymentEventsByInvoiceNum, onAddPayout, onEditPayout, onDeletePayout, territories, anchor, onRegisterActions }) {
  const safeSummary = summary || { earned: 0, paidOut: 0, available: 0, openCommission: 0, totalCommission: 0, owesFoundry: 0 }
  const byInvoice = aggregate?.byInvoice || {}

  // Split rep's invoices by status. Partials qualify as "paid" for this
  // section because the received portion is real earned commission; they
  // also stay in openInvoices below so the rep sees what's still coming.
  const paidInvoices = []
  const openInvoices = []
  for (const k of Object.keys(byInvoice)) {
    const inv = byInvoice[k]
    if (inv.status === 'Paid') paidInvoices.push(inv)
    else if (inv.status === 'Partial') { paidInvoices.push(inv); openInvoices.push(inv) }
    else if (inv.status === 'Open') openInvoices.push(inv)
  }
  paidInvoices.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  openInvoices.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))

  // Helpers — display MM/DD/YYYY, comparison YYYY-MM-DD.
  const formatPaidOn = (s) => {
    if (!s) return ''
    const str = String(s)
    const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`
    const us = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
    if (us) {
      const yyyy = us[3].length === 2 ? `20${us[3]}` : us[3]
      return `${us[1].padStart(2, '0')}/${us[2].padStart(2, '0')}/${yyyy}`
    }
    return str
  }
  const toIsoDate = (s) => {
    if (!s) return ''
    const str = String(s)
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
    if (!m) return ''
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${yyyy}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  // Default the cycle filter to the rep's most recent payout, so each new
  // payout advances the window and the section shows "what's accrued since I
  // last paid you" — not a lifetime list. Before the first payout, fall back
  // to the adjustment anchor as the starting point. The exported report
  // inherits this same "Since" value, so live ledger and export stay in sync.
  const lastPayoutDate = useMemo(() => {
    let best = ''
    for (const p of payouts || []) {
      const iso = toIsoDate(p.date)
      if (iso && iso > best) best = iso
    }
    return best
  }, [payouts])
  const defaultSince = lastPayoutDate || anchor
  const [paidSince, setPaidSince] = useState(() => defaultSince)
  const [hasPaidSinceTouched, setHasPaidSinceTouched] = useState(false)
  useEffect(() => {
    if (!hasPaidSinceTouched) setPaidSince(defaultSince)
  }, [defaultSince, hasPaidSinceTouched])
  const [groupByCustomer, setGroupByCustomer] = useState(true)
  const [emailOpen, setEmailOpen] = useState(false)

  // Payment EVENTS instead of invoices — each row is one payment event
  // (a single installment, lump payment, or full settlement). Multi-
  // installment invoices like Valians produce multiple rows. Commission
  // per event is pro-rated by event.amount / invoice.amount so the cycle
  // math is correct.
  //
  // For paid invoices the matcher couldn't pair, we emit ONE synthetic
  // fallback row with no date and an 'unmatched' source — but ONLY when
  // the "Since" filter is cleared. With a filter active the user is
  // asking "what's owed since X" and we can't honestly place an undated
  // row on either side of X, so we hide them and surface a count below.
  const visiblePaymentEvents = useMemo(() => {
    const out = []
    for (const inv of paidInvoices) {
      const fullAmount = inv.amount || 0
      const fullCommission = inv.commission || 0
      const events = paymentEventsByInvoiceNum?.get(inv.invoiceNum) || []
      if (events.length === 0) {
        if (paidSince) continue
        const paidPortion = fullAmount - (inv.openBalance || 0)
        const fraction = fullAmount > 0 ? paidPortion / fullAmount : 0
        out.push({
          ...inv,
          paymentDate: '',
          paymentAmount: paidPortion,
          eventSource: 'unmatched',
          commissionForEvent: fullCommission * fraction,
        })
        continue
      }
      for (const ev of events) {
        if (paidSince) {
          const pIso = toIsoDate(ev.date)
          if (!pIso || pIso < paidSince) continue
        }
        const fraction = fullAmount > 0 ? (ev.amount || 0) / fullAmount : 0
        out.push({
          ...inv,
          paymentDate: ev.date,
          paymentAmount: ev.amount || 0,
          eventSource: ev.source,
          commissionForEvent: fullCommission * fraction,
        })
      }
    }
    // Sort newest-paid first; unmatched (no date) sink to the bottom.
    out.sort((a, b) => {
      if (!a.paymentDate && b.paymentDate) return 1
      if (a.paymentDate && !b.paymentDate) return -1
      return (b.paymentDate || '').localeCompare(a.paymentDate || '')
    })
    return out
  }, [paidInvoices, paymentEventsByInvoiceNum, paidSince])
  // Count of paid invoices with no matched events, so we can show a nudge
  // when the Since filter is hiding them.
  const unmatchedHiddenCount = useMemo(() => {
    if (!paidSince) return 0
    let n = 0
    for (const inv of paidInvoices) {
      const events = paymentEventsByInvoiceNum?.get(inv.invoiceNum) || []
      if (events.length === 0) n++
    }
    return n
  }, [paidInvoices, paymentEventsByInvoiceNum, paidSince])
  // Alias for existing downstream consumers (brand subtotals, totals).
  const visiblePaidInvoices = visiblePaymentEvents

  // Sortable customer-grouped view. Defaults to commission desc; click any
  // header to re-sort.
  const [paidSortBy, setPaidSortBy] = useState('commission')
  const [paidSortDir, setPaidSortDir] = useState('desc')
  const togglePaidSort = (key) => {
    if (paidSortBy === key) setPaidSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setPaidSortBy(key); setPaidSortDir(key === 'customer' ? 'asc' : 'desc') }
  }
  const paidByCustomer = useMemo(() => {
    const m = {}
    for (const ev of visiblePaymentEvents) {
      const key = ev.customer || '(unknown)'
      if (!m[key]) m[key] = { customer: key, count: 0, amount: 0, commission: 0 }
      m[key].count += 1
      m[key].amount += ev.paymentAmount || 0
      m[key].commission += ev.commissionForEvent || 0
    }
    const rows = Object.values(m)
    const sign = paidSortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      if (paidSortBy === 'customer') return sign * a.customer.localeCompare(b.customer)
      return sign * ((a[paidSortBy] ?? 0) - (b[paidSortBy] ?? 0))
    })
    return rows
  }, [visiblePaymentEvents, paidSortBy, paidSortDir])
  const paidTotals = useMemo(() => ({
    count: visiblePaymentEvents.length,
    amount: visiblePaymentEvents.reduce((s, ev) => s + (ev.paymentAmount || 0), 0),
    commission: visiblePaymentEvents.reduce((s, ev) => s + (ev.commissionForEvent || 0), 0),
  }), [visiblePaymentEvents])

  // Brand subtotal: pro-rated per event, summed by brand. Multi-installment
  // invoices contribute proportionally.
  const brandSubtotals = useMemo(() => {
    const m = {}
    for (const ev of visiblePaymentEvents) {
      const fullAmount = ev.amount || 0
      const fraction = fullAmount > 0 ? (ev.paymentAmount || 0) / fullAmount : 0
      for (const line of ev.lines || []) {
        const brand = line.brand || '—'
        if (!m[brand]) m[brand] = { brand, commission: 0 }
        m[brand].commission += (line.commission || 0) * fraction
      }
    }
    return Object.values(m).sort((a, b) => b.commission - a.commission)
  }, [visiblePaymentEvents])

  // Customer-grouped OPEN invoices
  const openByCustomer = useMemo(() => {
    const m = {}
    for (const inv of openInvoices) {
      const key = inv.customer || '(unknown)'
      if (!m[key]) m[key] = { customer: key, count: 0, amount: 0, openBalance: 0, pending: 0 }
      m[key].count += 1
      m[key].amount += inv.amount || 0
      m[key].openBalance += inv.openBalance || 0
      m[key].pending += (inv.commission || 0) - (inv.commissionAvailable || 0)
    }
    return Object.values(m).sort((a, b) => b.openBalance - a.openBalance)
  }, [openInvoices])
  // Lookup: customer name → list of their open invoices (used for expand-in-place).
  const openInvoicesByCustomer = useMemo(() => {
    const m = {}
    for (const inv of openInvoices) {
      const key = inv.customer || '(unknown)'
      if (!m[key]) m[key] = []
      m[key].push(inv)
    }
    // Sort each customer's invoices by most-overdue (oldest due date) first
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    return m
  }, [openInvoices])
  // Toggle for the "Owed to Foundry" section — default hides Paid rows so
  // Tony sees only what's still owed; click "Show paid" to reveal history.
  const [showPaidRepInvoices, setShowPaidRepInvoices] = useState(false)
  const paidRepInvoiceCount = useMemo(
    () => repAccountInvoices.filter(i => (i.openBalance || 0) <= 0.005).length,
    [repAccountInvoices]
  )
  const visibleRepInvoices = useMemo(
    () => showPaidRepInvoices
      ? repAccountInvoices
      : repAccountInvoices.filter(i => (i.openBalance || 0) > 0.005),
    [repAccountInvoices, showPaidRepInvoices]
  )
  const [expandedOpenCustomers, setExpandedOpenCustomers] = useState(() => new Set())
  const toggleOpenCustomer = (customer) => {
    setExpandedOpenCustomers(prev => {
      const next = new Set(prev)
      if (next.has(customer)) next.delete(customer)
      else next.add(customer)
      return next
    })
  }
  // Same expand/collapse pattern for the Paid invoices section.
  const [expandedPaidCustomers, setExpandedPaidCustomers] = useState(() => new Set())
  const togglePaidCustomer = (customer) => {
    setExpandedPaidCustomers(prev => {
      const next = new Set(prev)
      if (next.has(customer)) next.delete(customer)
      else next.add(customer)
      return next
    })
  }
  // Lookup: customer → list of their visible paid invoices.
  const visiblePaidInvoicesByCustomer = useMemo(() => {
    const m = {}
    for (const inv of visiblePaidInvoices) {
      const key = inv.customer || '(unknown)'
      if (!m[key]) m[key] = []
      m[key].push(inv)
    }
    return m
  }, [visiblePaidInvoices])
  // Days past due (positive = past due) from mm/dd/yyyy
  const daysPastDueFor = (s) => {
    if (!s) return null
    const mm = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (!mm) return null
    const [, m1, d1, y1] = mm
    const y = y1.length === 2 ? `20${y1}` : y1
    const due = new Date(Number(y), Number(m1) - 1, Number(d1))
    if (isNaN(due.getTime())) return null
    const today = new Date(); today.setHours(0,0,0,0); due.setHours(0,0,0,0)
    return Math.round((today.getTime() - due.getTime()) / 86400000)
  }
  const openTotals = useMemo(() => ({
    count: openInvoices.length,
    amount: openInvoices.reduce((s, i) => s + (i.amount || 0), 0),
    openBalance: openInvoices.reduce((s, i) => s + (i.openBalance || 0), 0),
    pending: openInvoices.reduce((s, i) => s + ((i.commission || 0) - (i.commissionAvailable || 0)), 0),
  }), [openInvoices])

  const sortedPayouts = useMemo(
    () => [...(payouts || [])].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [payouts]
  )
  // Year filter for Commission payouts — starts at 2026 (data-model start),
  // counts up to the later of current calendar year or latest payout year.
  const [payoutYear, setPayoutYear] = useState(() => new Date().getFullYear())
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const latestPayoutYear = sortedPayouts.reduce((mx, p) => {
      const y = parseInt(String(p.date || '').slice(0, 4), 10)
      return Number.isFinite(y) ? Math.max(mx, y) : mx
    }, 2026)
    const last = Math.max(currentYear, latestPayoutYear)
    const out = []
    for (let y = 2026; y <= last; y++) out.push(y)
    return out
  }, [sortedPayouts])
  const filteredPayouts = useMemo(
    () => sortedPayouts.filter(p => String(p.date || '').startsWith(`${payoutYear}-`)),
    [sortedPayouts, payoutYear]
  )
  const filteredPayoutTotal = useMemo(
    () => filteredPayouts.reduce((s, p) => s + (p.amount || 0), 0),
    [filteredPayouts]
  )

  const exportArgs = {
    rep, summary: safeSummary, byInvoice, payouts, paidSince, territories, groupByCustomer,
    brandSubtotals, repAccountInvoices, anchor, paymentDatesByInvoiceNum,
  }

  // Surface the export/email actions to the page header. Handlers read the
  // latest exportArgs via a ref, so they register once and stay stable while
  // still reflecting the current "Since"/grouping filters.
  const exportArgsRef = useRef(exportArgs)
  exportArgsRef.current = exportArgs
  useEffect(() => {
    onRegisterActions?.({
      pdf: () => exportRepReportPDF(exportArgsRef.current),
      xlsx: () => exportRepReportXLSX(exportArgsRef.current),
      email: () => setEmailOpen(true),
    })
    return () => onRegisterActions?.(null)
  }, [onRegisterActions])

  return (
    <>
      {/* Rep header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#005b5b] text-white flex items-center justify-center font-bold text-xl">
                  {rep.name.charAt(0)}
                </div>
                <div>
                  <div>{rep.name}</div>
                  {rep.agency && <div className="text-sm font-normal text-muted-foreground">{rep.agency}</div>}
                </div>
              </CardTitle>
              <CardDescription className="mt-2">
                {rep.email || '—'}
                {territories?.length > 0 && <> • {territories.join(', ')}</>}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <EmailReportModal open={emailOpen} onOpenChange={setEmailOpen} rep={rep} exportArgs={exportArgs} />

      {/* Summary cards: the three pieces of info Tony's monthly report needs */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${safeSummary.owesFoundry > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paid out YTD</CardDescription>
            <CardTitle className="text-2xl">{fmt(safeSummary.paidOut)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-[#005b5b]">
          <CardHeader className="pb-2">
            <CardDescription>Available to collect</CardDescription>
            <CardTitle className={`text-2xl ${safeSummary.available > 0 ? 'text-[#005b5b]' : ''}`}>{fmt(safeSummary.available)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending (open invoices)</CardDescription>
            <CardTitle className="text-2xl text-muted-foreground">{fmt(safeSummary.openCommission)}</CardTitle>
          </CardHeader>
        </Card>
        {safeSummary.owesFoundry > 0 && (
          <Card className="border-amber-300 dark:border-amber-800">
            <CardHeader className="pb-2">
              <CardDescription>Owes Foundry (samples)</CardDescription>
              <CardTitle className="text-2xl text-amber-700 dark:text-amber-300">{fmt(safeSummary.owesFoundry)}</CardTitle>
            </CardHeader>
          </Card>
        )}
      </div>

      {/* Brand subtotal */}
      {brandSubtotals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Earned by brand{paidSince ? ` (since ${formatPaidOn(paidSince)})` : ''}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 text-sm">
              {brandSubtotals.map((b) => (
                <div key={b.brand} className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-md bg-[#005b5b]/10">
                  <span className="text-xs font-semibold uppercase text-[#005b5b]">{b.brand}</span>
                  <span className="font-bold text-[#005b5b]">{fmt(b.commission)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payments received on invoices */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>Payments received on invoices</CardTitle>
              <CardDescription>
                {groupByCustomer
                  ? `${paidByCustomer.length} ${paidByCustomer.length === 1 ? 'customer' : 'customers'}`
                  : `${visiblePaymentEvents.length} ${visiblePaymentEvents.length === 1 ? 'payment' : 'payments'}`
                }
                {paidSince
                  ? ` received on or after ${formatPaidOn(paidSince)}`
                  : ' — all payments received for this rep'}
                {paidSince && paidSince === lastPayoutDate ? ' (since last payout)' : (paidSince && paidSince === anchor ? ' (since anchor)' : '')}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={groupByCustomer}
                  onChange={(e) => setGroupByCustomer(e.target.checked)}
                  className="size-3.5"
                />
                Group by customer
              </label>
              <Label className="text-muted-foreground">Since</Label>
              <Input
                type="date"
                value={paidSince}
                onChange={(e) => { setHasPaidSinceTouched(true); setPaidSince(e.target.value) }}
                className="w-40"
              />
              {lastPayoutDate && paidSince !== lastPayoutDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setHasPaidSinceTouched(false); setPaidSince(lastPayoutDate) }}
                  className="text-muted-foreground"
                >Since last payout</Button>
              )}
              {paidSince && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setHasPaidSinceTouched(true); setPaidSince('') }}
                  className="text-muted-foreground"
                >Clear</Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {unmatchedHiddenCount > 0 && (
            <div className="mb-3 text-xs text-muted-foreground bg-muted/30 border rounded-md px-3 py-2 flex items-center justify-between gap-3">
              <span>
                <span className="font-medium text-foreground">{unmatchedHiddenCount}</span> paid {unmatchedHiddenCount === 1 ? 'invoice has' : 'invoices have'} no matched payment date and {unmatchedHiddenCount === 1 ? 'is' : 'are'} hidden by the Since filter.
              </span>
              <button
                type="button"
                onClick={() => { setHasPaidSinceTouched(true); setPaidSince('') }}
                className="text-[#005b5b] hover:underline shrink-0"
              >Show all</button>
            </div>
          )}
          {visiblePaymentEvents.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              {paidInvoices.length === 0 ? 'No payments received yet.' : 'No payments received in this date range.'}
            </div>
          ) : groupByCustomer ? (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground bg-muted/30">
                    <th className="py-2 px-2 w-8"></th>
                    <th
                      className="py-2 px-4 text-left font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => togglePaidSort('customer')}
                    >
                      Customer{paidSortBy === 'customer' ? (paidSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th
                      className="py-2 px-4 text-right font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => togglePaidSort('count')}
                    >
                      Payments{paidSortBy === 'count' ? (paidSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th
                      className="py-2 px-4 text-right font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => togglePaidSort('amount')}
                    >
                      Amount{paidSortBy === 'amount' ? (paidSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th
                      className="py-2 px-4 text-right font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => togglePaidSort('commission')}
                    >
                      Commission{paidSortBy === 'commission' ? (paidSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paidByCustomer.map((row) => {
                    const isOpen = expandedPaidCustomers.has(row.customer)
                    const events = visiblePaidInvoicesByCustomer[row.customer] || []
                    return (
                      <Fragment key={row.customer}>
                        <tr
                          onClick={() => togglePaidCustomer(row.customer)}
                          className="border-b last:border-0 cursor-pointer hover:bg-muted/30"
                        >
                          <td className="py-2 px-2 text-center text-muted-foreground">
                            {isOpen ? <Minus className="size-3.5 inline" /> : <Plus className="size-3.5 inline" />}
                          </td>
                          <td className="py-2 px-4 font-medium">{row.customer}</td>
                          <td className="py-2 px-4 text-right text-xs">{row.count}</td>
                          <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(row.amount)}</td>
                          <td className="py-2 px-4 text-right font-bold text-[#005b5b] whitespace-nowrap">{fmt(row.commission)}</td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td></td>
                            <td colSpan={4} className="p-0">
                              <div className="bg-muted/20 border-b">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground border-b border-border/50">
                                      <th className="py-1.5 px-3 text-left font-medium">Invoice</th>
                                      <th className="py-1.5 px-3 text-left font-medium">Paid On</th>
                                      <th className="py-1.5 px-3 text-left font-medium">Brand</th>
                                      <th className="py-1.5 px-3 text-right font-medium">Amount</th>
                                      <th className="py-1.5 px-3 text-right font-medium">Commission</th>
                                      <th className="py-1.5 px-3 text-left font-medium">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {events.map((ev, i) => {
                                      const evBrands = Array.from(new Set((ev.lines || []).map(l => l.brand).filter(Boolean)))
                                      const isUnmatched = ev.eventSource === 'unmatched'
                                      const isPartial = ev.status === 'Partial' || (ev.paymentAmount || 0) < (ev.amount || 0) - 0.01
                                      const pillClass = isUnmatched
                                        ? 'text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700'
                                        : isPartial
                                          ? 'text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800'
                                          : 'text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800'
                                      const pillLabel = isUnmatched ? 'Unmatched' : (isPartial ? 'Partial' : 'Paid')
                                      return (
                                        <tr key={`${ev.invoiceNum}-${i}`} className="border-b border-border/40 last:border-0">
                                          <td className="py-1.5 px-3 whitespace-nowrap">{ev.invoiceNum}</td>
                                          <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">{formatPaidOn(ev.paymentDate) || '—'}</td>
                                          <td className="py-1.5 px-3">
                                            {evBrands.length === 0 && !(ev.lines || []).some(l => l.isRental) ? (
                                              <span className="text-muted-foreground">—</span>
                                            ) : (
                                              <div className="flex flex-wrap gap-1">
                                                {evBrands.map(b => (
                                                  <span key={b} className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-[#005b5b]/10 text-[#005b5b]">{b}</span>
                                                ))}
                                                {(ev.lines || []).some(l => l.isRental) && (
                                                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">Rental</span>
                                                )}
                                              </div>
                                            )}
                                          </td>
                                          <td className="py-1.5 px-3 text-right whitespace-nowrap">{fmt(ev.paymentAmount)}</td>
                                          <td className="py-1.5 px-3 text-right font-bold text-[#005b5b] whitespace-nowrap">{fmt(ev.commissionForEvent)}</td>
                                          <td className="py-1.5 px-3">
                                            <span className={pillClass}>{pillLabel}</span>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                  <tr className="bg-muted/40 font-semibold">
                    <td></td>
                    <td className="py-2 px-4">Total</td>
                    <td className="py-2 px-4 text-right text-xs">{paidTotals.count}</td>
                    <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(paidTotals.amount)}</td>
                    <td className="py-2 px-4 text-right text-[#005b5b] whitespace-nowrap">{fmt(paidTotals.commission)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground bg-muted/30">
                    <th className="py-2 px-4 text-left font-medium">Invoice</th>
                    <th className="py-2 px-4 text-left font-medium">Customer</th>
                    <th className="py-2 px-4 text-left font-medium">Paid On</th>
                    <th className="py-2 px-4 text-left font-medium">Brand</th>
                    <th className="py-2 px-4 text-right font-medium">Amount</th>
                    <th className="py-2 px-4 text-right font-medium">Commission</th>
                    <th className="py-2 px-4 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePaymentEvents.slice(0, 200).map((ev, i) => {
                    const evBrands = Array.from(new Set((ev.lines || []).map(l => l.brand).filter(Boolean)))
                    const isUnmatched = ev.eventSource === 'unmatched'
                    const isPartial = ev.status === 'Partial' || (ev.paymentAmount || 0) < (ev.amount || 0) - 0.01
                    const pillClass = isUnmatched
                      ? 'text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700'
                      : isPartial
                        ? 'text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800'
                        : 'text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800'
                    const pillLabel = isUnmatched ? 'Unmatched' : (isPartial ? 'Partial' : 'Paid')
                    return (
                      <tr key={`${ev.invoiceNum}-${i}`} className="border-b last:border-0">
                        <td className="py-2 px-4 text-xs whitespace-nowrap">{ev.invoiceNum}</td>
                        <td className="py-2 px-4">{ev.customer}</td>
                        <td className="py-2 px-4 text-xs text-muted-foreground whitespace-nowrap">{formatPaidOn(ev.paymentDate) || '—'}</td>
                        <td className="py-2 px-4">
                          {evBrands.length === 0 && !(ev.lines || []).some(l => l.isRental) ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {evBrands.map(b => (
                                <span key={b} className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-[#005b5b]/10 text-[#005b5b]">{b}</span>
                              ))}
                              {(ev.lines || []).some(l => l.isRental) && (
                                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">Rental</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(ev.paymentAmount)}</td>
                        <td className="py-2 px-4 text-right font-bold text-[#005b5b] whitespace-nowrap">{fmt(ev.commissionForEvent)}</td>
                        <td className="py-2 px-4">
                          <span className={pillClass}>{pillLabel}</span>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bg-muted/40 font-semibold">
                    <td className="py-2 px-4" colSpan={4}>Total</td>
                    <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(paidTotals.amount)}</td>
                    <td className="py-2 px-4 text-right text-[#005b5b] whitespace-nowrap">{fmt(paidTotals.commission)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
              {visiblePaymentEvents.length > 200 && (
                <div className="text-xs text-muted-foreground text-center py-2">
                  Showing first 200 of {visiblePaymentEvents.length} — narrow the date range to see more.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open invoices */}
      <Card>
        <CardHeader>
          <CardTitle>Open / unpaid invoices</CardTitle>
          <CardDescription>
            {groupByCustomer
              ? `${openByCustomer.length} ${openByCustomer.length === 1 ? 'customer' : 'customers'} with open invoices`
              : `${openInvoices.length} ${openInvoices.length === 1 ? 'invoice' : 'invoices'} where this rep would be credited once paid`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {openInvoices.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">No open invoices for this rep.</div>
          ) : groupByCustomer ? (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground bg-muted/30">
                    <th className="py-2 px-2 w-8"></th>
                    <th className="py-2 px-4 text-left font-medium">Customer</th>
                    <th className="py-2 px-4 text-right font-medium">Invoices</th>
                    <th className="py-2 px-4 text-right font-medium">Amount</th>
                    <th className="py-2 px-4 text-right font-medium">Open Balance</th>
                    <th className="py-2 px-4 text-right font-medium">Pending Comm.</th>
                  </tr>
                </thead>
                <tbody>
                  {openByCustomer.map((row) => {
                    const isOpen = expandedOpenCustomers.has(row.customer)
                    const invs = openInvoicesByCustomer[row.customer] || []
                    return (
                      <Fragment key={row.customer}>
                        <tr
                          onClick={() => toggleOpenCustomer(row.customer)}
                          className="border-b last:border-0 cursor-pointer hover:bg-muted/30"
                        >
                          <td className="py-2 px-2 text-center text-muted-foreground">
                            {isOpen ? <Minus className="size-3.5 inline" /> : <Plus className="size-3.5 inline" />}
                          </td>
                          <td className="py-2 px-4 font-medium">{row.customer}</td>
                          <td className="py-2 px-4 text-right text-xs">{row.count}</td>
                          <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(row.amount)}</td>
                          <td className="py-2 px-4 text-right font-medium whitespace-nowrap">{fmt(row.openBalance)}</td>
                          <td className="py-2 px-4 text-right text-muted-foreground whitespace-nowrap">{fmt(row.pending)}</td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td></td>
                            <td colSpan={5} className="p-0">
                              <div className="bg-muted/20 border-b">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground border-b border-border/50">
                                      <th className="py-1.5 px-3 text-left font-medium">Invoice</th>
                                      <th className="py-1.5 px-3 text-left font-medium">Date</th>
                                      <th className="py-1.5 px-3 text-left font-medium">Due</th>
                                      <th className="py-1.5 px-3 text-right font-medium">Past Due</th>
                                      <th className="py-1.5 px-3 text-left font-medium">Brand</th>
                                      <th className="py-1.5 px-3 text-right font-medium">Amount</th>
                                      <th className="py-1.5 px-3 text-right font-medium">Open Balance</th>
                                      <th className="py-1.5 px-3 text-right font-medium">Pending Comm.</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {invs.map((inv) => {
                                      const days = daysPastDueFor(inv.dueDate)
                                      const pending = (inv.commission || 0) - (inv.commissionAvailable || 0)
                                      const invBrands = Array.from(new Set((inv.lines || []).map(l => l.brand).filter(Boolean)))
                                      return (
                                        <tr key={inv.invoiceNum} className="border-b border-border/40 last:border-0">
                                          <td className="py-1.5 px-3 whitespace-nowrap">{inv.invoiceNum}</td>
                                          <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">{inv.date || '—'}</td>
                                          <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">{inv.dueDate || '—'}</td>
                                          <td className={`py-1.5 px-3 text-right whitespace-nowrap ${days != null && days > 0 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                                            {days != null && days > 0 ? `${days}d` : '—'}
                                          </td>
                                          <td className="py-1.5 px-3">
                                            {invBrands.length === 0 && !(inv.lines || []).some(l => l.isRental) ? (
                                              <span className="text-muted-foreground">—</span>
                                            ) : (
                                              <div className="flex flex-wrap gap-1">
                                                {invBrands.map(b => (
                                                  <span key={b} className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-[#005b5b]/10 text-[#005b5b]">{b}</span>
                                                ))}
                                                {(inv.lines || []).some(l => l.isRental) && (
                                                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">Rental</span>
                                                )}
                                              </div>
                                            )}
                                          </td>
                                          <td className="py-1.5 px-3 text-right whitespace-nowrap">{fmt(inv.amount)}</td>
                                          <td className="py-1.5 px-3 text-right font-medium whitespace-nowrap">{fmt(inv.openBalance)}</td>
                                          <td className="py-1.5 px-3 text-right text-muted-foreground whitespace-nowrap">{fmt(pending)}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                  <tr className="bg-muted/40 font-semibold">
                    <td></td>
                    <td className="py-2 px-4">Total</td>
                    <td className="py-2 px-4 text-right text-xs">{openTotals.count}</td>
                    <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(openTotals.amount)}</td>
                    <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(openTotals.openBalance)}</td>
                    <td className="py-2 px-4 text-right text-muted-foreground whitespace-nowrap">{fmt(openTotals.pending)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground bg-muted/30">
                    <th className="py-2 px-4 text-left font-medium">Invoice</th>
                    <th className="py-2 px-4 text-left font-medium">Customer</th>
                    <th className="py-2 px-4 text-left font-medium">Date</th>
                    <th className="py-2 px-4 text-left font-medium">Due</th>
                    <th className="py-2 px-4 text-right font-medium">Amount</th>
                    <th className="py-2 px-4 text-right font-medium">Open Balance</th>
                    <th className="py-2 px-4 text-right font-medium">Pending Comm.</th>
                  </tr>
                </thead>
                <tbody>
                  {openInvoices.slice(0, 200).map((inv) => {
                    const pending = (inv.commission || 0) - (inv.commissionAvailable || 0)
                    return (
                      <tr key={inv.invoiceNum} className="border-b last:border-0">
                        <td className="py-2 px-4 text-xs whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            {inv.invoiceNum}
                            {(inv.lines || []).some(l => l.isRental) && (
                              <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">Rental</span>
                            )}
                          </span>
                        </td>
                        <td className="py-2 px-4">{inv.customer}</td>
                        <td className="py-2 px-4 text-xs text-muted-foreground whitespace-nowrap">{inv.date || '—'}</td>
                        <td className="py-2 px-4 text-xs text-muted-foreground whitespace-nowrap">{inv.dueDate || '—'}</td>
                        <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(inv.amount)}</td>
                        <td className="py-2 px-4 text-right font-medium whitespace-nowrap">{fmt(inv.openBalance)}</td>
                        <td className="py-2 px-4 text-right text-muted-foreground whitespace-nowrap">{fmt(pending)}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-muted/40 font-semibold">
                    <td className="py-2 px-4" colSpan={4}>Total</td>
                    <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(openTotals.amount)}</td>
                    <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(openTotals.openBalance)}</td>
                    <td className="py-2 px-4 text-right text-muted-foreground whitespace-nowrap">{fmt(openTotals.pending)}</td>
                  </tr>
                </tbody>
              </table>
              {openInvoices.length > 200 && (
                <div className="text-xs text-muted-foreground text-center py-2">
                  Showing first 200 of {openInvoices.length}.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* REP-account invoices (samples owed to Foundry) */}
      {repAccountInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle>Owed to Foundry (samples / personal orders)</CardTitle>
                <CardDescription>
                  {visibleRepInvoices.length} {visibleRepInvoices.length === 1 ? 'invoice' : 'invoices'} on this rep's <code className="text-xs">- REP</code> account
                  {paidRepInvoiceCount > 0 && (
                    <> {showPaidRepInvoices ? '' : `· ${paidRepInvoiceCount} paid hidden`}</>
                  )}
                </CardDescription>
              </div>
              {paidRepInvoiceCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPaidRepInvoices(v => !v)}
                >
                  {showPaidRepInvoices ? 'Hide paid' : `Show paid (${paidRepInvoiceCount})`}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {visibleRepInvoices.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                No open invoices — all paid. Click "Show paid" above to see history.
              </div>
            ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground bg-muted/30">
                    <th className="py-2 px-4 text-left font-medium">Invoice</th>
                    <th className="py-2 px-4 text-left font-medium">Customer (QB)</th>
                    <th className="py-2 px-4 text-left font-medium">Date</th>
                    <th className="py-2 px-4 text-left font-medium">Due</th>
                    <th className="py-2 px-4 text-right font-medium">Amount</th>
                    <th className="py-2 px-4 text-right font-medium">Open Balance</th>
                    <th className="py-2 px-4 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRepInvoices.map(inv => {
                    const open = inv.openBalance || 0
                    const amt = inv.amount || 0
                    const status = open <= 0.005 ? 'Paid' : (open + 0.005 < amt ? 'Partial' : 'Open')
                    const statusClass = status === 'Paid'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : status === 'Partial'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                    return (
                      <tr key={inv.num + '|' + inv.customer} className="border-b last:border-0">
                        <td className="py-2 px-4 text-xs whitespace-nowrap">{inv.num}</td>
                        <td className="py-2 px-4 text-xs">{inv.customer}</td>
                        <td className="py-2 px-4 text-xs text-muted-foreground whitespace-nowrap">{inv.date || '—'}</td>
                        <td className="py-2 px-4 text-xs text-muted-foreground whitespace-nowrap">{inv.dueDate || '—'}</td>
                        <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(amt)}</td>
                        <td className="py-2 px-4 text-right font-medium whitespace-nowrap">{fmt(open)}</td>
                        <td className="py-2 px-4">
                          <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full ${statusClass}`}>{status}</span>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bg-muted/40 font-semibold">
                    <td className="py-2 px-4" colSpan={4}>Total</td>
                    <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(visibleRepInvoices.reduce((s, i) => s + (i.amount || 0), 0))}</td>
                    <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(visibleRepInvoices.reduce((s, i) => s + (i.openBalance || 0), 0))}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payout history */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Commission payouts</CardTitle>
              <CardDescription>
                {filteredPayouts.length} {filteredPayouts.length === 1 ? 'payment' : 'payments'} in {payoutYear}
                {filteredPayouts.length > 0 && <> · {fmt(filteredPayoutTotal)} total</>}
                {sortedPayouts.length !== filteredPayouts.length && (
                  <> · {sortedPayouts.length} all-time</>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-xs">Year</Label>
              <select
                value={payoutYear}
                onChange={(e) => setPayoutYear(parseInt(e.target.value, 10))}
                className="border rounded px-2 py-1 text-sm bg-background"
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <Button size="sm" onClick={onAddPayout} className="bg-[#005b5b] hover:bg-[#004848]">
                <Banknote className="size-4 mr-1.5" /> Record Payout
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredPayouts.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              {sortedPayouts.length === 0
                ? 'No payouts recorded yet. Click "Record Payout" to log one.'
                : `No payouts recorded in ${payoutYear}.`}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground bg-muted/30">
                    <th className="py-2 px-4 text-left font-medium">Date</th>
                    <th className="py-2 px-4 text-left font-medium">Method</th>
                    <th className="py-2 px-4 text-left font-medium">Note</th>
                    <th className="py-2 px-4 text-right font-medium">Amount</th>
                    <th className="py-2 px-4 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayouts.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 px-4 whitespace-nowrap">{p.date}</td>
                      <td className="py-2 px-4 text-xs">{p.method || '—'}</td>
                      <td className="py-2 px-4 text-xs text-muted-foreground">{p.note || '—'}</td>
                      <td className="py-2 px-4 text-right font-bold">{fmt(p.amount)}</td>
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onEditPayout && onEditPayout(p)}
                            className="text-muted-foreground hover:text-[#005b5b] transition-colors"
                            aria-label="Edit payout"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => { if (confirm('Delete this payout entry?')) onDeletePayout(p.id) }}
                            className="text-muted-foreground hover:text-red-600 transition-colors"
                            aria-label="Delete payout"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-semibold">
                    <td className="py-2 px-4" colSpan={3}>Total in {payoutYear}</td>
                    <td className="py-2 px-4 text-right whitespace-nowrap">{fmt(filteredPayoutTotal)}</td>
                    <td></td>
                  </tr>
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
// RecordCommissionPayoutModal — record "Paid Rep $X on Date" entry
// =====================================================================
function RecordCommissionPayoutModal({ open, onOpenChange, reps, prefilledRepId, editingPayout, onSave, onUpdate }) {
  const today = new Date().toISOString().slice(0, 10)
  const isEditing = Boolean(editingPayout)
  const [repId, setRepId] = useState(prefilledRepId || (reps[0]?.id || ''))
  const [date, setDate] = useState(today)
  const [amountStr, setAmountStr] = useState('')
  const [method, setMethod] = useState('ACH')
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)

  // Reset / pre-fill form fields whenever the modal opens.
  useEffect(() => {
    if (open) {
      if (editingPayout) {
        setRepId(editingPayout.repId || prefilledRepId || (reps[0]?.id || ''))
        setDate(editingPayout.date || today)
        setAmountStr(String(editingPayout.amount ?? ''))
        setMethod(editingPayout.method || 'ACH')
        setNote(editingPayout.note || '')
      } else {
        setRepId(prefilledRepId || (reps[0]?.id || ''))
        setDate(today)
        setAmountStr('')
        setMethod('ACH')
        setNote('')
      }
      setError(null)
    }
  }, [open, prefilledRepId, reps, today, editingPayout])

  const submit = () => {
    setError(null)
    if (!repId) { setError('Choose a rep.'); return }
    const amount = parseFloat(String(amountStr).replace(/[$,]/g, ''))
    if (!isFinite(amount) || amount <= 0) { setError('Enter a positive dollar amount.'); return }
    if (!date) { setError('Pick a date.'); return }
    if (isEditing) {
      onUpdate(editingPayout.id, { repId, date, amount, method, note: note.trim() })
    } else {
      onSave({ repId, date, amount, method, note: note.trim() })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Commission Payout' : 'Record Commission Payout'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the recorded payment details.'
              : 'Log a payment you made to a rep. This subtracts from their "available to collect" total.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Rep</Label>
            <select
              value={repId}
              onChange={(e) => setRepId(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm"
            >
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date Paid</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Amount ($)</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />
            </div>
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
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Input
              type="text"
              placeholder="e.g. Q1 commission, ref #"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} className="bg-[#005b5b] hover:bg-[#004848]">
            {isEditing ? 'Update Payout' : 'Save Payout'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =====================================================================
// TerritoryManagerModal — assign territories to reps
// =====================================================================
function TerritoryManagerModal({ open, onOpenChange, reps, accounts, repTerritories, onSave, onReset }) {
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
      return { ...prev, [repId]: next }
    })
  }

  const hasAnyRep = (terr) => {
    for (const id of Object.keys(draft)) {
      if (draft[id]?.includes(terr)) return true
    }
    return false
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Territory Coverage</DialogTitle>
          <DialogDescription>
            Assign each territory to one or more reps. A territory can be covered by multiple reps.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {allTerritories.map((terr) => {
            const hasRep = hasAnyRep(terr)
            const accountCount = accounts.filter(a => a.territory === terr).length
            return (
              <div key={terr} className="py-3 border-b last:border-0">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <div className="text-sm font-medium">{terr}</div>
                    <div className="text-xs text-muted-foreground">{accountCount} accounts</div>
                  </div>
                  {!hasRep && (
                    <span className="text-[10px] uppercase text-amber-600 font-semibold">Unassigned</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {reps.map(rep => {
                    const active = draft[rep.id]?.includes(terr)
                    return (
                      <button
                        key={rep.id}
                        type="button"
                        onClick={() => toggle(rep.id, terr)}
                        className={`px-3 py-1 text-xs rounded-full font-medium transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-[#005b5b] text-white'
                            : 'bg-muted text-muted-foreground hover:bg-muted/70'
                        }`}
                      >
                        {rep.name.split(' ')[0]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm('Reset all territory assignments to defaults? Your local edits will be lost.')) {
                onReset()
                onOpenChange(false)
              }
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => { onSave(draft); onOpenChange(false) }} className="bg-[#005b5b] hover:bg-[#004848]">
              Save
            </Button>
          </div>
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
