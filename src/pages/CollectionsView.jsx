// A/R Collections — the "work the past-due list" view. Reads the live A/R Aging
// upload (per-customer netted aging buckets), matches each customer to an account
// (same fuzzy matcher the commission engine uses) for territory + brand context,
// and layers on persisted collection notes / payment-plan / terms flags.
//
// Ported from ar-collections-mockup.html. SICA credit scores + the "Trending
// worse" credit signal are Stage C (deferred) — this is the aging + notes core.

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, Plus, Trash2, Mail, Phone, FileText, Check, MapPin, Truck, AlertTriangle, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { normCustomer, findAccount } from '@/lib/commissionEngine'
import { lookupBrand } from '@/lib/catalogs'
import { loadCollectionsNotes, saveCollectionsNotes, emptyRecord } from '@/lib/collectionsStore'
import { loadSica, refreshSica, saveSicaMatch, removeSicaMatch, sicaRisk, scoreRose } from '@/lib/sica'

const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US')
const REP_RE = /\s-\s*REP\s*$/i

// Five QBO aging buckets, oldest = most urgent, graduated warm colors.
const BUCKET_META = [
  { key: 'current', label: 'Current', short: 'Current', color: '#64748b' },
  { key: 'd1_30', label: '1–30 days', short: '1–30', color: '#f59e0b' },
  { key: 'd31_60', label: '31–60 days', short: '31–60', color: '#ea580c' },
  { key: 'd61_90', label: '61–90 days', short: '61–90', color: '#dc2626' },
  { key: 'd91', label: '91+ days', short: '91+', color: '#b91c1c' },
]
const BUCKET_ORDER = { current: 0, d1_30: 1, d31_60: 2, d61_90: 3, d91: 4 }
const bucketLabel = (k) => BUCKET_META.find((b) => b.key === k)?.label || '—'
const bucketColor = (k) => BUCKET_META.find((b) => b.key === k)?.color || '#94a3b8'

// Canonical west→east territory order for the filter bar (matches the app's
// TERRITORIES). Anything unrecognized (and "Unmatched") sorts to the end.
const TERRITORY_ORDER = [
  'PNW',
  'NORCAL',
  'SOCAL / AZ',
  'SOUTHWEST (UT, CO, NM, TX)',
  'MIDWEST PLAINS',
  'SOUTHEAST',
  'EAST COAST (PA, NY, NJ, DE)',
  'NEW ENGLAND',
]
const territoryRank = (t) => {
  const i = TERRITORY_ORDER.indexOf(t)
  return i === -1 ? TERRITORY_ORDER.length : i
}
// Drop the "(states…)" suffix for the pill label; full name stays as the title.
const shortTerr = (t) => String(t || '').replace(/\s*\(.*\)$/, '')

const TERMS = [
  { key: 'on_terms', label: 'Pays on terms' },
  { key: 'late_30', label: '~30 days late' },
  { key: 'no_respect', label: "Doesn't respect terms" },
]

const DAY = 86400000
const relDays = (iso) => {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / DAY)
}
const shortDate = (iso) => {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
// Normalize a US 10-digit number to (xxx) xxx-xxxx; leave anything else as-is.
const formatPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '')
  const ten = d.length === 11 && d[0] === '1' ? d.slice(1) : d
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : String(p || '')
}
const telHref = (p) => `tel:${String(p || '').replace(/[^\d+]/g, '')}`

export default function CollectionsView({ agingRows, agingOpen, accounts = [], lineItems = [] }) {
  // Brand(s) per invoice number, from the line-items upload (aging has no SKUs).
  const brandsByInvoiceNum = useMemo(() => {
    const m = {}
    for (const item of lineItems || []) {
      if (!item?.num) continue
      const info = lookupBrand(item.sku)
      if (!info?.brandName) continue
      ;(m[item.num] ||= new Set()).add(info.brandName)
    }
    const out = {}
    for (const k of Object.keys(m)) out[k] = [...m[k]].sort()
    return out
  }, [lineItems])

  const accountsByName = useMemo(() => {
    const m = new Map()
    for (const a of accounts || []) {
      const n = normCustomer(a.name)
      if (n && !m.has(n)) m.set(n, a)
    }
    return m
  }, [accounts])

  // Roll the aging up per matched account (or per normalized name when no account
  // matched). Nets credits, drops "- REP" accounts and net-zero/credit customers.
  const customers = useMemo(() => {
    const rows = (agingRows && agingRows.length)
      ? agingRows
      : (agingOpen || []).map((o) => ({ customer: o.customer, num: o.num, openBalance: o.openBalance, type: 'Invoice', bucket: null }))
    const byKey = new Map()
    for (const r of rows) {
      if (!r.customer || REP_RE.test(r.customer)) continue
      const acct = findAccount(r.customer, accountsByName)
      const key = acct ? `acct:${acct.id}` : `name:${normCustomer(r.customer)}`
      if (!byKey.has(key)) {
        byKey.set(key, {
          key, name: acct ? acct.name : r.customer, account: acct || null,
          territory: acct?.territory || null, matched: !!acct,
          buckets: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91: 0 },
          total: 0, invoices: new Map(),
        })
      }
      const g = byKey.get(key)
      const bal = r.openBalance || 0
      if (r.bucket && g.buckets[r.bucket] !== undefined) g.buckets[r.bucket] += bal
      g.total += bal
      if ((!r.type || /invoice/i.test(r.type)) && bal > 0.005 && r.num) {
        const prev = g.invoices.get(r.num)
        g.invoices.set(r.num, {
          num: r.num,
          date: r.date || prev?.date || null,
          openBalance: (prev?.openBalance || 0) + bal,
          bucket: r.bucket || prev?.bucket || null,
          brands: brandsByInvoiceNum[r.num] || [],
        })
      }
    }
    const out = []
    for (const g of byKey.values()) {
      if (g.total <= 0.005) continue
      for (const k of Object.keys(g.buckets)) g.buckets[k] = Math.round(g.buckets[k] * 100) / 100
      g.total = Math.round(g.total * 100) / 100
      g.invoices = [...g.invoices.values()].sort(
        (a, b) => (BUCKET_ORDER[b.bucket] || 0) - (BUCKET_ORDER[a.bucket] || 0) || b.openBalance - a.openBalance,
      )
      out.push(g)
    }
    out.sort((a, b) => b.buckets.d91 - a.buckets.d91 || b.total - a.total)
    return out
  }, [agingRows, agingOpen, accountsByName, brandsByInvoiceNum])

  // ── Notes / flags (persisted) ──────────────────────────────────────────
  const [notesMap, setNotesMap] = useState(null)
  useEffect(() => { loadCollectionsNotes().then(setNotesMap).catch(() => setNotesMap({})) }, [])
  const recordFor = (key) => ({ ...emptyRecord(), ...((notesMap || {})[key] || {}) })
  const mutate = (key, fn) => {
    setNotesMap((prev) => {
      const base = prev || {}
      const next = { ...base, [key]: fn({ ...emptyRecord(), ...(base[key] || {}) }) }
      saveCollectionsNotes(next).catch(() => {})
      return next
    })
  }
  const addNote = (key, text) => {
    const t = (text || '').trim()
    if (!t) return
    mutate(key, (r) => ({ ...r, notes: [{ ts: new Date().toISOString(), text: t }, ...r.notes] }))
  }
  const editNote = (key, idx, text) => mutate(key, (r) => ({ ...r, notes: r.notes.map((n, i) => (i === idx ? { ...n, text } : n)) }))
  const delNote = (key, idx) => mutate(key, (r) => ({ ...r, notes: r.notes.filter((_, i) => i !== idx) }))
  const setPlan = (key, plan) => mutate(key, (r) => ({ ...r, plan }))
  const setTerms = (key, terms) => mutate(key, (r) => ({ ...r, terms: r.terms === terms ? null : terms }))
  const setEarlyShip = (key, earlyShip) => mutate(key, (r) => ({ ...r, earlyShip }))

  // ── SICA credit scores (Stage C) ───────────────────────────────────────
  const [sica, setSica] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [sicaError, setSicaError] = useState(null)
  useEffect(() => { loadSica().then(setSica).catch(() => setSica({ retailers: [], overrides: {}, lastSync: null, available: false })) }, [])
  const refreshScores = async () => {
    setRefreshing(true); setSicaError(null)
    try { await refreshSica(); setSica(await loadSica()) }
    catch (e) { setSicaError(e.message || 'Refresh failed') }
    finally { setRefreshing(false) }
  }

  // Stable per-account override key (account id when matched, else the row key).
  // Coerced to string to match the text account_key column in sica_account_matches.
  const accountKeyFor = (c) => String(c.account ? c.account.id : c.key)

  // Join each worklist row to a SICA retailer: an explicit override wins (a null
  // retailer_id = "no match / ignore"); otherwise the same fuzzy name matcher the
  // commission engine uses, against SICA legal names + DBAs. → Map(row key → retailer).
  const sicaByKey = useMemo(() => {
    const out = new Map()
    if (!sica?.retailers?.length) return out
    const byId = new Map(), byName = new Map()
    for (const r of sica.retailers) {
      byId.set(r.retailer_id, r)
      for (const nm of [r.legal_name, r.dba]) { const n = normCustomer(nm); if (n && !byName.has(n)) byName.set(n, r) }
    }
    for (const c of customers) {
      const ov = sica.overrides?.[accountKeyFor(c)]
      let r = null
      if (ov) r = ov.retailer_id ? (byId.get(ov.retailer_id) || null) : null
      else r = findAccount(c.account?.name || c.name, byName)
      if (r) out.set(c.key, r)
    }
    return out
  }, [sica, customers])

  // Apply / clear / undo a match override (writes sica_account_matches, then
  // updates local overrides so the worklist + card re-resolve immediately).
  const applyMatch = async (c, retailerId, opts) => {
    const key = accountKeyFor(c)
    setSicaError(null)
    try {
      await saveSicaMatch(key, retailerId, opts)
      setSica((prev) => ({ ...prev, overrides: { ...prev.overrides, [key]: { account_key: key, retailer_id: retailerId ?? null, confirmed: opts?.confirmed ?? true } } }))
    } catch (e) { setSicaError(e.message || 'Could not save the match') }
  }
  const undoMatch = async (c) => {
    const key = accountKeyFor(c)
    setSicaError(null)
    try {
      await removeSicaMatch(key)
      setSica((prev) => { const o = { ...prev.overrides }; delete o[key]; return { ...prev, overrides: o } })
    } catch (e) { setSicaError(e.message || 'Could not clear the override') }
  }

  // Most-recent contact per account (notes are stored newest-first).
  const lastContactByKey = useMemo(() => {
    const m = {}
    for (const [k, rec] of Object.entries(notesMap || {})) {
      const ts = rec?.notes?.[0]?.ts
      if (ts) m[k] = ts
    }
    return m
  }, [notesMap])

  // ── Filters + selection ────────────────────────────────────────────────
  const [bucketFilter, setBucketFilter] = useState('all') // all | d91 | d61_90 | d31_60 | current
  const [terrFilter, setTerrFilter] = useState('all')
  const [expanded, setExpanded] = useState(() => new Set())
  const [selKey, setSelKey] = useState(null)

  const territories = useMemo(() => {
    const counts = new Map()
    let unmatched = 0
    for (const c of customers) {
      if (c.territory) counts.set(c.territory, (counts.get(c.territory) || 0) + 1)
      else unmatched += 1
    }
    const list = [...counts.entries()]
      .sort((a, b) => territoryRank(a[0]) - territoryRank(b[0]) || a[0].localeCompare(b[0]))
      .map(([t, n]) => ({ key: t, label: shortTerr(t), count: n }))
    if (unmatched) list.push({ key: '__unmatched__', label: 'Unmatched', count: unmatched })
    return list
  }, [customers])

  const visible = useMemo(() => {
    return customers.filter((c) => {
      const tOk = terrFilter === 'all'
        || (terrFilter === '__unmatched__' ? !c.territory : c.territory === terrFilter)
      const bOk = bucketFilter === 'all' || (c.buckets[bucketFilter] || 0) > 0.005
      return tOk && bOk
    })
  }, [customers, terrFilter, bucketFilter])

  // Keep a valid selection as filters/data change.
  useEffect(() => {
    if (!visible.length) { setSelKey(null); return }
    if (!visible.some((c) => c.key === selKey)) setSelKey(visible[0].key)
  }, [visible, selKey])

  const selected = useMemo(() => customers.find((c) => c.key === selKey) || null, [customers, selKey])

  // The bucket the amount column shows: the selected filter, or 91+ when "all".
  const activeBucket = bucketFilter === 'all' ? 'd91' : bucketFilter
  const activeBucketLabel = BUCKET_META.find((b) => b.key === activeBucket)?.short || '91+'

  // Per-bucket totals across the currently-visible rows (for the worklist footer).
  const bucketTotals = useMemo(() => {
    const t = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91: 0, total: 0 }
    for (const c of visible) {
      for (const b of BUCKET_META) t[b.key] += c.buckets[b.key] || 0
      t.total += c.total
    }
    return t
  }, [visible])

  // Customers needing follow-up (no contact, or 14+ days) — never-contacted first,
  // then most overdue. Powers the clickable "Needs follow-up" KPI.
  const followupList = useMemo(() => {
    const out = []
    for (const c of customers) {
      const last = lastContactByKey[c.key]
      const d = last ? relDays(last) : null
      if (d == null || d >= 14) out.push({ c, days: d })
    }
    out.sort((a, b) => {
      if (a.days == null && b.days == null) return b.c.total - a.c.total
      if (a.days == null) return -1
      if (b.days == null) return 1
      return b.days - a.days
    })
    return out
  }, [customers, lastContactByKey])

  const [followupOpen, setFollowupOpen] = useState(false)
  const jumpToCustomer = (key) => {
    setTerrFilter('all'); setBucketFilter('all'); setSelKey(key); setFollowupOpen(false)
  }

  // ── KPIs ───────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const listTotal = customers.reduce((s, c) => s + c.total, 0)
    const past91 = customers.reduce((s, c) => s + c.buckets.d91, 0)
    let followup = 0
    let atRisk = 0, atRiskExposure = 0, worse = 0
    for (const c of customers) {
      const last = lastContactByKey[c.key]
      const d = last ? relDays(last) : null
      if (d == null || d >= 14) followup += 1
      // SICA-driven: exposure to high-risk accounts (our own balance), and how
      // many accounts' scores rose vs last year.
      const r = sicaByKey.get(c.key)
      if (r) {
        if (r.sicadex_cm != null && r.sicadex_cm >= 60) { atRisk += 1; atRiskExposure += c.total }
        if (scoreRose(r.sicadex_variance_smly)) worse += 1
      }
    }
    return {
      listTotal, count: customers.length,
      past91, past91Pct: listTotal ? Math.round((past91 / listTotal) * 100) : 0,
      followup, atRisk, atRiskExposure: Math.round(atRiskExposure), worse,
      hasSica: sicaByKey.size > 0,
    }
  }, [customers, lastContactByKey, sicaByKey])

  // The per-invoice aging buckets come from the FULL parsed aging rows. If only the
  // older "open invoices" payload is stored (an upload from before this page existed),
  // we can show balances but not buckets — prompt a fresh upload.
  const bucketsPending = (!agingRows || !agingRows.length) && customers.length > 0

  const toggleExpand = (key) => setExpanded((prev) => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  if (!customers.length) {
    return (
      <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 py-16 px-6 text-center">
        <MapPin className="size-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium mb-1">No open receivables loaded</p>
        <p className="text-sm text-muted-foreground">
          Upload an <b>A/R Aging Detail</b> report on <b>Data Uploads</b> to build the collections worklist.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {bucketsPending && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3.5 py-2.5 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <span>
            <b>Aging buckets aren’t loaded yet.</b> Balances are showing, but the per-bucket aging (Current / 30 / 60 / 90 / 91+) needs a fresh upload.
            Re-upload your <b>A/R Aging Detail</b> on <b>Data Uploads</b> — same weekly file — and the buckets and invoice ages will fill in.
          </span>
        </div>
      )}

      {/* SICA sync bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {sica?.available && kpis.hasSica
            ? <>SICA credit scores {sica.lastSync ? <>synced <b className="text-foreground">{new Date(sica.lastSync).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</b></> : 'connected'}</>
            : <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber-500" /> SICA credit scores not connected yet — deploy <code className="text-[11px]">sync-sica</code> and refresh</span>}
        </div>
        <div className="flex items-center gap-2">
          {sicaError && <span className="text-xs text-red-600 max-w-md truncate" title={sicaError}>{sicaError}</span>}
          <Button variant="outline" size="sm" onClick={refreshScores} disabled={refreshing} className="gap-1.5 h-8 text-xs">
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Refreshing…' : 'Refresh scores'}
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Kpi label="Outstanding (list)" value={fmt(kpis.listTotal)} sub={`${kpis.count} ${kpis.count === 1 ? 'customer' : 'customers'} owing`} />
        <Kpi label="91+ days" value={fmt(kpis.past91)} sub={`${kpis.past91Pct}% of the list`} alert />
        <Kpi label="At-risk exposure" value={kpis.hasSica ? fmt(kpis.atRiskExposure) : '—'} sub={kpis.hasSica ? `${kpis.atRisk} high-risk (SICA 60+)` : 'needs SICA scores'} alert={kpis.hasSica && kpis.atRisk > 0} />
        <Kpi label="Trending worse" value={kpis.hasSica ? String(kpis.worse) : '—'} sub={kpis.hasSica ? 'SICA rising vs last yr' : 'needs SICA scores'} alert={kpis.hasSica && kpis.worse > 0} />
        <Kpi
          label="Needs follow-up" value={String(kpis.followup)} sub="no contact in 14+ days"
          onClick={followupList.length ? () => setFollowupOpen((v) => !v) : undefined}
          open={followupOpen}
        />
      </div>

      {/* Needs-follow-up drilldown */}
      {followupOpen && followupList.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden -mt-1">
          <div className="flex items-center justify-between px-4 py-2.5 border-b">
            <h3 className="text-sm font-semibold">Needs follow-up <span className="text-muted-foreground font-normal">· {followupList.length}</span></h3>
            <button onClick={() => setFollowupOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y">
            {followupList.map(({ c, days }) => (
              <button key={c.key} onClick={() => jumpToCustomer(c.key)} className="w-full text-left px-4 py-2.5 hover:bg-muted/50 flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-medium truncate block">{c.name}</span>
                  <span className="text-[11px] text-muted-foreground">{c.territory || 'Unmatched'} · {fmt(c.total)} owed</span>
                </span>
                <span className="text-xs text-right shrink-0">
                  {days == null ? <span className="text-[#b91c1c] font-medium">never contacted</span> : <><span className="font-semibold">{days}d</span><span className="text-muted-foreground"> since contact</span></>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Territory pills */}
      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Territory</span>
        <div className="flex gap-2 flex-wrap">
          <TerrPill on={terrFilter === 'all'} label="All" title="All territories" count={customers.length} onClick={() => setTerrFilter('all')} />
          {territories.map((t) => (
            <TerrPill key={t.key} on={terrFilter === t.key} label={t.label} title={t.key === '__unmatched__' ? 'Unmatched to an account' : t.key} count={t.count} onClick={() => setTerrFilter(t.key)} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4 items-start">
        {/* Worklist */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
            <h2 className="text-sm font-semibold">Past-due worklist</h2>
            <span className="text-xs text-muted-foreground">Sorted by 91+ balance</span>
          </div>
          <div className="flex gap-2 px-4 py-2.5 border-b flex-wrap">
            {[['all', 'All'], ['d91', '91+'], ['d61_90', '61–90'], ['d31_60', '31–60'], ['current', 'Current']].map(([k, lab]) => (
              <button
                key={k}
                onClick={() => setBucketFilter(k)}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                  bucketFilter === k ? 'bg-[#005b5b] border-[#005b5b] text-white' : 'bg-background border-input text-muted-foreground hover:text-foreground'
                }`}
              >{lab}</button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-semibold px-4 py-2.5">Customer</th>
                  <th className="text-left font-semibold px-4 py-2.5">Aging</th>
                  <th className="text-right font-semibold px-4 py-2.5">{activeBucketLabel} / Total</th>
                  <th className="text-left font-semibold px-4 py-2.5">SICA</th>
                  <th className="text-right font-semibold px-4 py-2.5">Last contact</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No customers match this filter.</td></tr>
                )}
                {visible.map((c) => {
                  const isSel = c.key === selKey
                  const isOpen = expanded.has(c.key)
                  const last = lastContactByKey[c.key]
                  const d = last ? relDays(last) : null
                  return (
                    <FragmentRow
                      key={c.key}
                      c={c} isSel={isSel} isOpen={isOpen} lastIso={last} lastDays={d} sica={sicaByKey.get(c.key)}
                      activeBucket={activeBucket} activeBucketLabel={activeBucketLabel}
                      onSelect={() => setSelKey(c.key)}
                      onToggle={() => toggleExpand(c.key)}
                    />
                  )
                })}
              </tbody>
              {visible.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/40 font-semibold text-xs">
                    <td className="px-4 py-2.5" colSpan={2}>
                      Totals · {visible.length} {visible.length === 1 ? 'customer' : 'customers'}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <span className="tabular-nums text-[#b91c1c]">{fmt(bucketTotals[activeBucket])}</span>
                      <br /><span className="text-[11px] text-muted-foreground tabular-nums">{fmt(bucketTotals.total)} total</span>
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="flex gap-x-4 gap-y-1.5 px-4 py-2.5 border-t text-[11px] flex-wrap items-center">
            {BUCKET_META.map((b) => (
              <button
                key={b.key}
                onClick={() => setBucketFilter(b.key)}
                className={`inline-flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-muted ${activeBucket === b.key ? 'font-semibold' : ''}`}
                title={`Show ${b.label} in the amount column`}
              >
                <i className="inline-block size-2 rounded-sm" style={{ background: b.color }} />
                <span className="text-muted-foreground">{b.label}</span>
                <span className="tabular-nums" style={{ color: bucketTotals[b.key] > 0 ? b.color : undefined }}>{fmt(bucketTotals[b.key])}</span>
              </button>
            ))}
            <span className="inline-flex items-center gap-1.5 ml-auto">
              <span className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">Total</span>
              <span className="font-semibold tabular-nums">{fmt(bucketTotals.total)}</span>
            </span>
          </div>
        </div>

        {/* Detail — pinned in view on wide screens so scrolling the worklist and
            clicking a customer updates it without scrolling back up. Caps its own
            height and scrolls internally when a customer has a long notes log. */}
        <div className="rounded-lg border bg-card overflow-hidden xl:sticky xl:top-4 xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-card sticky top-0 z-10">
            <h2 className="text-sm font-semibold">Customer detail</h2>
            <span className="text-xs text-muted-foreground">{selected?.territory || (selected ? 'Unmatched' : '')}</span>
          </div>
          {!selected ? (
            <div className="p-6 text-sm text-muted-foreground">Select a customer to see aging and notes.</div>
          ) : (
            <DetailPanel
              c={selected}
              record={recordFor(selected.key)}
              sica={sicaByKey.get(selected.key)}
              sicaAvailable={!!sica?.available}
              sicaOverride={sica?.overrides?.[accountKeyFor(selected)]}
              sicaRetailers={sica?.retailers || []}
              onAssignMatch={(rid, opts) => applyMatch(selected, rid, opts)}
              onUndoMatch={() => undoMatch(selected)}
              onAdd={(t) => addNote(selected.key, t)}
              onEdit={(i, t) => editNote(selected.key, i, t)}
              onDelete={(i) => delNote(selected.key, i)}
              onPlan={(v) => setPlan(selected.key, v)}
              onTerms={(v) => setTerms(selected.key, v)}
              onEarlyShip={(v) => setEarlyShip(selected.key, v)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, alert, muted, onClick, open }) {
  const inner = (
    <>
      <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground inline-flex items-center gap-1">
        {label}
        {onClick && <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180 text-[#005b5b]' : ''}`} />}
      </div>
      <div className={`text-xl font-bold mt-1.5 tabular-nums ${alert ? 'text-[#b91c1c]' : muted ? 'text-foreground' : ''}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </>
  )
  if (onClick) {
    return (
      <button onClick={onClick} className={`rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-[#005b5b] ${open ? 'border-[#005b5b] ring-1 ring-[#005b5b]/20' : ''}`}>
        {inner}
      </button>
    )
  }
  return <div className="rounded-lg border bg-card px-4 py-3">{inner}</div>
}

function TerrPill({ on, label, title, count, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title || label}
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
        on ? 'bg-[#005b5b] border-[#005b5b] text-white' : 'bg-background border-input text-muted-foreground hover:border-[#005b5b] hover:text-[#005b5b]'
      } ${count === 0 ? 'opacity-50' : ''}`}
    >
      {label}
      <span className={`text-[10px] font-bold rounded-full px-1.5 min-w-[19px] text-center ${on ? 'bg-white/20 text-white' : 'bg-[#005b5b]/10 text-[#005b5b]'}`}>{count}</span>
    </button>
  )
}

function AgingBar({ buckets, total }) {
  return (
    <div className="flex h-2 w-32 rounded overflow-hidden bg-muted" title="Aging mix">
      {BUCKET_META.map((b) => {
        const v = buckets[b.key] || 0
        if (v <= 0 || total <= 0) return null
        return <i key={b.key} className="block h-full" style={{ width: `${(v / total) * 100}%`, background: b.color }} />
      })}
    </div>
  )
}

// SICAdex score chip: colored by risk band + a rise/fall arrow vs last year.
function ScoreChip({ retailer, size = 'sm' }) {
  if (!retailer || retailer.sicadex_cm == null) return <span className="text-muted-foreground">—</span>
  const rk = sicaRisk(retailer.sicadex_cm)
  const rose = scoreRose(retailer.sicadex_variance_smly)
  const v = retailer.sicadex_variance_smly
  const pad = size === 'lg' ? 'text-sm px-2.5 py-1' : 'text-xs px-2 py-0.5'
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-full tabular-nums ${pad}`}
      style={{ background: rk.bg, color: rk.fg, border: `1px solid ${rk.border}` }}
      title={`${rk.tier} — SICAdex ${retailer.sicadex_cm} (higher = worse)`}
    >
      {retailer.sicadex_cm}
      {v != null && v !== 0 && (
        rose
          ? <TrendingUp className="size-3 text-[#b91c1c]" />
          : <TrendingDown className="size-3 text-[#16a34a]" />
      )}
    </span>
  )
}

// A customer row + its expandable invoice sub-row.
function FragmentRow({ c, isSel, isOpen, lastIso, lastDays, sica, activeBucket = 'd91', onSelect, onToggle }) {
  const bucketAmt = c.buckets[activeBucket] || 0
  return (
    <>
      <tr
        onClick={onSelect}
        className={`border-b cursor-pointer transition-colors ${isSel ? 'bg-[#005b5b]/5' : 'hover:bg-muted/40'}`}
        style={isSel ? { boxShadow: 'inset 3px 0 0 #005b5b' } : undefined}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onToggle() }}
              aria-expanded={isOpen}
              title={`${c.invoices.length} open invoice${c.invoices.length === 1 ? '' : 's'}`}
              className="shrink-0 size-6 -my-1 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-[#005b5b]"
            >
              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
            <div className="min-w-0">
              <div className="font-semibold truncate">{c.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {c.matched ? (c.territory || 'No territory') : <span className="text-amber-700">territory: unmatched</span>}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3"><AgingBar buckets={c.buckets} total={c.total} /></td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <span className={`font-semibold tabular-nums ${bucketAmt > 0 ? 'text-[#b91c1c]' : 'text-muted-foreground'}`}>{fmt(bucketAmt)}</span>
          <br /><span className="text-[11px] text-muted-foreground tabular-nums">{fmt(c.total)} total</span>
        </td>
        <td className="px-4 py-3"><ScoreChip retailer={sica} /></td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {lastIso ? (
            <>
              <span className={`font-semibold tabular-nums ${lastDays >= 30 ? 'text-[#ea580c]' : ''}`}>{lastDays}d</span>
              <br /><span className="text-[11px] text-muted-foreground">{shortDate(lastIso)}</span>
            </>
          ) : <span className="text-[11px] text-muted-foreground">never</span>}
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-muted/30">
          <td colSpan={5} className="px-0 py-0">
            <div className="px-6 py-3 pl-12">
              {c.invoices.length === 0 ? (
                <div className="text-xs text-muted-foreground py-1">No open invoices in the aging report.</div>
              ) : (
                <>
                  <div className="grid grid-cols-[110px_92px_1fr_120px_100px] gap-3 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold pb-1.5">
                    <span>Invoice</span><span>Date</span><span>Brand</span><span>Aging</span><span className="text-right">Open</span>
                  </div>
                  {c.invoices.map((iv) => (
                    <div key={iv.num} className="grid grid-cols-[110px_92px_1fr_120px_100px] gap-3 items-center py-1.5 border-t text-xs">
                      <span className="font-semibold tabular-nums">{iv.num}</span>
                      <span className="tabular-nums text-muted-foreground whitespace-nowrap">{iv.date || '—'}</span>
                      <span className="flex flex-wrap gap-1">
                        {iv.brands.length ? iv.brands.map((b) => (
                          <span key={b} className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#005b5b]/10 text-[#005b5b]">{b}</span>
                        )) : <span className="text-muted-foreground">—</span>}
                      </span>
                      <span className="font-medium" style={{ color: bucketColor(iv.bucket) }}>{bucketLabel(iv.bucket)}</span>
                      <span className="text-right font-semibold tabular-nums">{fmt(iv.openBalance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 mt-1 border-t font-bold text-xs">
                    <span>{c.invoices.length} invoice{c.invoices.length === 1 ? '' : 's'} due</span>
                    <span className="tabular-nums">{fmt(c.invoices.reduce((s, x) => s + x.openBalance, 0))}</span>
                  </div>
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const QUICK_ACTIONS = [
  { icon: Mail, label: 'Sent email', text: 'Sent follow-up email' },
  { icon: Phone, label: 'Logged call', text: 'Called — left voicemail' },
  { icon: FileText, label: 'Sent statement', text: 'Sent statement' },
  { icon: Check, label: 'Payment received', text: 'Payment received' },
]

function MiniBtn({ onClick, children, tone }) {
  const base = 'text-[11px] px-2 py-0.5 rounded-md border font-medium transition-colors'
  const cls = tone === 'danger'
    ? 'border-input bg-background text-muted-foreground hover:border-red-300 hover:text-[#b91c1c]'
    : 'border-input bg-background text-muted-foreground hover:border-[#005b5b] hover:text-[#005b5b]'
  return <button type="button" onClick={onClick} className={`${base} ${cls}`}>{children}</button>
}

// The confirm / correct / clear controls for a SICA match, plus a retailer search
// picker. Writes flow up through onAssign(retailerId | null, opts) / onUndo.
function MatchEditor({ matched, confirmed, overrideNoMatch, currentRetailerId, retailers, onAssign, onUndo }) {
  const [picking, setPicking] = useState(false)
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    // Token search: every word (2+ chars) must appear somewhere in the retailer's
    // legal name, DBA, or city — so word order and extra words don't matter
    // ("skyline bear valley" finds "Bear Valley Skyline" or a store in Bear Valley).
    const words = q.trim().toUpperCase().split(/\s+/).filter((w) => w.length >= 2)
    if (!words.length) return []
    return retailers
      .filter((r) => {
        const hay = `${r.legal_name || ''} ${r.dba || ''} ${r.city || ''}`.toUpperCase()
        return words.every((w) => hay.includes(w))
      })
      .slice(0, 20)
  }, [q, retailers])
  const assign = (rid) => { onAssign(rid, { source: 'manual', confirmed: true }); setPicking(false); setQ('') }

  if (picking) {
    return (
      <div className="mt-2 pt-2 border-t border-[#005b5b1a]">
        <div className="flex items-center gap-2">
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search SICA retailers by name…"
            className="flex-1 text-xs rounded-md border border-input bg-background px-2.5 py-1.5 focus:outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/15"
          />
          <button type="button" onClick={() => { setPicking(false); setQ('') }} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
        <div className="mt-1.5 max-h-44 overflow-y-auto rounded-md border divide-y">
          {q.trim().length < 2 && <div className="px-2.5 py-2 text-[11px] text-muted-foreground">Type at least 2 letters to search.</div>}
          {q.trim().length >= 2 && results.length === 0 && <div className="px-2.5 py-2 text-[11px] text-muted-foreground">No retailers match “{q.trim()}”.</div>}
          {results.map((r) => (
            <button key={r.retailer_id} type="button" onClick={() => assign(r.retailer_id)} className="w-full text-left px-2.5 py-1.5 hover:bg-muted">
              <div className="text-xs font-medium">{r.dba || r.legal_name}</div>
              <div className="text-[10px] text-muted-foreground flex gap-2 flex-wrap">
                {r.legal_name && r.dba && r.legal_name !== r.dba && <span>{r.legal_name}</span>}
                {r.city && <span>{r.city}{r.province_code ? `, ${r.province_code}` : ''}</span>}
                {r.sicadex_cm != null && <span>SICA {r.sicadex_cm}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 pt-2 border-t border-[#005b5b1a] flex items-center gap-1.5 flex-wrap">
      {matched && !confirmed && <MiniBtn onClick={() => onAssign(currentRetailerId, { source: 'manual', confirmed: true })}>Confirm</MiniBtn>}
      {matched && <MiniBtn onClick={() => setPicking(true)}>Change</MiniBtn>}
      {matched && <MiniBtn tone="danger" onClick={() => onAssign(null, { source: 'ignored', confirmed: true })}>Not a match</MiniBtn>}
      {overrideNoMatch && <MiniBtn onClick={onUndo}>Undo — restore auto-match</MiniBtn>}
      {!matched && !overrideNoMatch && <MiniBtn onClick={() => setPicking(true)}>Find a match…</MiniBtn>}
    </div>
  )
}

function DetailPanel({ c, record, sica, sicaAvailable, sicaOverride, sicaRetailers = [], onAssignMatch, onUndoMatch, onAdd, onEdit, onDelete, onPlan, onTerms, onEarlyShip }) {
  const [draft, setDraft] = useState('')
  const submit = () => { onAdd(draft); setDraft('') }
  const oldest = BUCKET_META.slice().reverse().find((b) => (c.buckets[b.key] || 0) > 0.005)
  // Match state: a saved override with a retailer = a confirmed/corrected match;
  // an override with null retailer = an explicit "not a match".
  const sicaMatchConfirmed = !!sicaOverride && sicaOverride.retailer_id != null
  const sicaOverrideNoMatch = !!sicaOverride && sicaOverride.retailer_id == null

  return (
    <div>
      <div className="p-4">
        <div className="text-base font-bold">{c.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{c.territory || 'Unmatched territory'}</span>
          {c.account?.email && <a href={`mailto:${c.account.email}`} className="inline-flex items-center gap-1 hover:text-foreground"><Mail className="size-3.5" />{c.account.email}</a>}
          {c.account?.phone && <a href={telHref(c.account.phone)} className="inline-flex items-center gap-1 hover:text-foreground"><Phone className="size-3.5" />{formatPhone(c.account.phone)}</a>}
        </div>
        <button
          onClick={() => onEarlyShip(!record.earlyShip)}
          aria-pressed={record.earlyShip}
          title={record.earlyShip ? 'Qualifies for early ship — click to clear' : 'Click to mark this customer as qualifying for early ship'}
          className={`mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
            record.earlyShip
              ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-background border-dashed border-muted-foreground/40 text-muted-foreground hover:border-emerald-600/50 hover:text-emerald-700'
          }`}
        >
          {record.earlyShip ? <Check className="size-3.5" /> : <Truck className="size-3.5" />}
          {record.earlyShip ? 'Qualifies for Early Ship' : 'Does not qualify for Early Ship'}
        </button>
      </div>

      {/* SICA credit card */}
      <div className="px-4 pb-3">
        <div className="rounded-lg border px-3 py-2.5" style={sica?.sicadex_cm != null ? { background: 'linear-gradient(180deg,#005b5b0a,#005b5b03)', borderColor: '#005b5b2e' } : undefined}>
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">SICA credit score · higher = more risk</div>
          {!sicaAvailable ? (
            <div className="text-xs text-muted-foreground mt-1.5">SICA not connected yet — deploy sync-sica and refresh scores.</div>
          ) : (
            <>
              {sica ? (
                sica.sicadex_cm != null ? (
                  <>
                    <div className="flex items-baseline gap-2 mt-1.5">
                      <ScoreChip retailer={sica} size="lg" />
                      <span className="text-xs text-muted-foreground">{sicaRisk(sica.sicadex_cm)?.tier}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1.5">
                      {sica.sicadex_avg_12mth != null && <>12-mo avg {sica.sicadex_avg_12mth} · </>}
                      {scoreRose(sica.sicadex_variance_smly) ? 'trending worse (score rising)' : 'trending better (score falling)'} vs last yr
                      {sica.member_count != null && <><br />Based on {sica.member_count.toLocaleString()} reporting {sica.member_count === 1 ? 'member' : 'members'}</>}
                      <br />Matched{sicaMatchConfirmed ? ' (confirmed)' : ''}: <span className="text-foreground">{sica.dba || sica.legal_name}</span>
                      {sica.sica_account_number && <> · SICA acct <span className="text-foreground">#{sica.sica_account_number}</span></>}
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-muted-foreground mt-1.5">
                    Matched{sicaMatchConfirmed ? ' (confirmed)' : ''} to <span className="text-foreground">{sica.dba || sica.legal_name}</span>{sica.sica_account_number ? ` (SICA acct #${sica.sica_account_number})` : ''} — no score (SICA shows N/A).
                  </div>
                )
              ) : (
                <div className="text-xs text-muted-foreground mt-1.5">
                  {sicaOverrideNoMatch ? 'Marked “no match” — no score shown for this account.' : 'No SICA match found for this account.'}
                </div>
              )}
              <MatchEditor
                matched={!!sica}
                confirmed={sicaMatchConfirmed}
                overrideNoMatch={sicaOverrideNoMatch}
                currentRetailerId={sica?.retailer_id ?? null}
                retailers={sicaRetailers}
                onAssign={onAssignMatch}
                onUndo={onUndoMatch}
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pb-4">
        <div className="rounded-lg border px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Total owed</div>
          <div className="text-xl font-bold mt-1 tabular-nums text-[#b91c1c]">{fmt(c.total)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Oldest: {oldest ? oldest.label : '—'}</div>
        </div>
        <div className="rounded-lg border px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Payment plan</div>
          <button
            onClick={() => onPlan(!record.plan)}
            className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${
              record.plan ? 'bg-[#005b5b] border-[#005b5b] text-white' : 'bg-background border-input text-muted-foreground hover:text-foreground'
            }`}
          >
            {record.plan ? <><Check className="size-3.5" /> On a plan</> : 'Not on a plan'}
          </button>
        </div>
      </div>

      {/* Aging breakdown */}
      <div className="px-4 pb-4">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">Aging breakdown</div>
        {BUCKET_META.map((b) => {
          const v = c.buckets[b.key] || 0
          return (
            <div key={b.key} className="flex items-center gap-2.5 py-1">
              <div className="w-20 text-xs text-muted-foreground">{b.label}</div>
              <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
                <i className="block h-full" style={{ width: `${c.total ? (v / c.total) * 100 : 0}%`, background: b.color }} />
              </div>
              <div className="w-20 text-right text-xs font-semibold tabular-nums" style={{ color: v > 0 ? b.color : undefined }}>{fmt(v)}</div>
            </div>
          )
        })}
      </div>

      {/* Terms rating */}
      <div className="px-4 pb-4">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">How do they pay?</div>
        <div className="flex gap-2 flex-wrap">
          {TERMS.map((t) => (
            <button
              key={t.key}
              onClick={() => onTerms(t.key)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                record.terms === t.key ? 'bg-[#005b5b] border-[#005b5b] text-white' : 'bg-background border-input text-muted-foreground hover:text-foreground'
              }`}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="border-t px-4 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold">Collection notes</h3>
          <span className="text-[11px] text-muted-foreground">{record.notes.length} {record.notes.length === 1 ? 'entry' : 'entries'}</span>
        </div>
        <div className="flex gap-2 mt-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            placeholder="Add a note — e.g. “sent statement, awaiting reply”"
            className="flex-1 text-sm rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/15"
          />
          <Button onClick={submit} className="bg-[#005b5b] hover:bg-[#004848] gap-1"><Plus className="size-4" /> Log</Button>
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">
          {QUICK_ACTIONS.map((q) => (
            <button
              key={q.label}
              onClick={() => onAdd(q.text)}
              className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border border-input bg-background text-muted-foreground hover:border-[#005b5b] hover:text-[#005b5b]"
            >
              <q.icon className="size-3" /> {q.label}
            </button>
          ))}
        </div>
        <ul className="mt-3 divide-y">
          {record.notes.length === 0 && <li className="py-3 text-xs text-muted-foreground">No notes yet — log your first contact above.</li>}
          {record.notes.map((n, i) => (
            <li key={i} className="flex gap-3 py-2.5 group">
              <span className="w-12 shrink-0 text-xs font-semibold text-[#005b5b] tabular-nums mt-0.5">{shortDate(n.ts)}</span>
              <span
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                onBlur={(e) => onEdit(i, e.currentTarget.textContent.trim())}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
                className="flex-1 text-sm leading-relaxed rounded px-1.5 py-0.5 -mx-1.5 hover:bg-muted focus:outline-none focus:bg-background focus:ring-1 focus:ring-[#005b5b]"
              >{n.text}</span>
              <button
                onClick={() => onDelete(i)}
                title="Delete note"
                className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-[#b91c1c]"
              ><Trash2 className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
