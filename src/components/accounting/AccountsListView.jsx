// Flat, sortable A–Z list of every account — the "just show me the list"
// counterpart to the territory-grouped dashboard Tony built. Clicking any row
// opens that account's detail page.

import { useCallback, useMemo, useState } from 'react'
import { Search, StickyNote, CheckSquare, Users, Plus, Send } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useCrm } from '@/context/CrmContext'
import AccountName from '@/components/accounting/AccountName'

const fmt = (n) => {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  const abs = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return num < 0 ? `-$${abs}` : `$${abs}`
}

function SortHeader({ col, label, align = 'left', sortBy, sortDir, onSort }) {
  const active = sortBy === col
  return (
    <th className={`py-2.5 px-4 font-semibold whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? 'text-foreground' : ''}`}
      >
        {label}
        {active && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  )
}

export default function AccountsListView({
  accounts,
  accountOpenBalances = {},
  invoiceNumsByAccountId = {},
  repNameForAccount,
  onAddAccount,
  onSelect,
}) {
  const { countsByAccount, getContacts } = useCrm()
  const [search, setSearch] = useState('')
  const [territoryFilter, setTerritoryFilter] = useState('all')
  const [openOnly, setOpenOnly] = useState(false)
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  const territories = useMemo(() => {
    const set = new Set(accounts.map((a) => a.territory).filter(Boolean))
    return Array.from(set).sort()
  }, [accounts])

  // Primary contact falls back to the name/email on the account record itself,
  // which is all Tony's original import carried.
  const contactFor = useCallback((a) => {
    const list = getContacts(a.id)
    const primary = list.find((c) => c.isPrimary) || list[0]
    if (primary) return { name: primary.name, email: primary.email, phone: primary.phone }
    return {
      name: [a.firstName, a.lastName].filter(Boolean).join(' '),
      email: a.email || '',
      phone: a.phone || '',
    }
  }, [getContacts])

  const rows = useMemo(() => {
    const q = search.toLowerCase().trim()
    return accounts
      .filter((a) => {
        if (territoryFilter !== 'all' && a.territory !== territoryFilter) return false
        if (openOnly && !(accountOpenBalances[a.id] > 0.005)) return false
        if (!q) return true
        const c = contactFor(a)
        return (
          a.name.toLowerCase().includes(q) ||
          (c.name || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q) ||
          (a.territory || '').toLowerCase().includes(q) ||
          (a.contactId || '').toLowerCase().includes(q) ||
          (invoiceNumsByAccountId[a.id] || []).some((num) => num.toLowerCase().includes(q))
        )
      })
      .map((a) => {
        const c = contactFor(a)
        const counts = countsByAccount[a.id] || { contacts: 0, notes: 0, openTodos: 0, emails: 0 }
        return {
          account: a,
          contactName: c.name,
          email: c.email,
          phone: c.phone,
          territory: a.territory || '',
          rep: repNameForAccount?.(a) || '',
          openBalance: accountOpenBalances[a.id] || 0,
          counts,
        }
      })
  }, [accounts, search, territoryFilter, openOnly, accountOpenBalances, invoiceNumsByAccountId, countsByAccount, repNameForAccount, contactFor])

  const sorted = useMemo(() => {
    const sign = sortDir === 'asc' ? 1 : -1
    const key = (r) => {
      switch (sortBy) {
        case 'contact':   return (r.contactName || '').toLowerCase()
        case 'territory': return r.territory.toLowerCase()
        case 'rep':       return r.rep.toLowerCase()
        case 'open':      return r.openBalance
        case 'activity':  return r.counts.openTodos * 1000 + r.counts.notes * 10 + r.counts.emails
        default:          return r.account.name.toLowerCase()
      }
    }
    return [...rows].sort((a, b) => {
      const ka = key(a), kb = key(b)
      if (ka < kb) return -1 * sign
      if (ka > kb) return 1 * sign
      return a.account.name.localeCompare(b.account.name)
    })
  }, [rows, sortBy, sortDir])

  const onSort = (col) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir(col === 'open' || col === 'activity' ? 'desc' : 'asc')
    }
  }

  const filtersActive = Boolean(search.trim()) || territoryFilter !== 'all' || openOnly

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by account, contact, email, phone, territory, or invoice #…"
            className="pl-9 shadow-sm"
          />
        </div>
        <select
          value={territoryFilter}
          onChange={(e) => setTerritoryFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm min-w-[240px] shadow-sm"
        >
          <option value="all">All territories</option>
          {territories.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <Button
          variant={openOnly ? 'default' : 'outline'}
          size="sm"
          className="shadow-sm h-9"
          onClick={() => setOpenOnly((v) => !v)}
        >
          Open Balances
        </Button>
        {onAddAccount && (
          <Button size="sm" className="shadow-sm h-9" onClick={onAddAccount}>
            <Plus className="size-4 mr-1" /> Add Account
          </Button>
        )}
      </div>

      {/* Only worth a line when the list is actually narrowed. */}
      {filtersActive && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{sorted.length} {sorted.length === 1 ? 'account' : 'accounts'} match</span>
          <button
            type="button"
            onClick={() => { setSearch(''); setTerritoryFilter('all'); setOpenOnly(false) }}
            className="text-[#005b5b] dark:text-[#00b3b3] hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* List */}
      <div className="rounded-xl border shadow-sm overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 dark:bg-zinc-800/60 text-[11px] uppercase tracking-wide text-muted-foreground border-b">
              <SortHeader col="name"      label="Account"      sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader col="contact"   label="Contact"      sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader col="territory" label="Territory"    sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader col="rep"       label="Rep"          sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader col="activity"  label="Activity"     sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader col="open"      label="Open Balance" align="right" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.account.id}
                onClick={() => onSelect(r.account.id)}
                className="group border-b last:border-0 cursor-pointer odd:bg-muted/20 hover:bg-[#005b5b]/[0.06] dark:hover:bg-[#005b5b]/20 transition-colors"
              >
                {/* Account name reads as the link it is; the contact-name suffix
                    the import baked in is muted so the shop name stands out. */}
                <td className="py-3 px-4">
                  <span className="font-medium text-[#005b5b] dark:text-[#00b3b3] group-hover:underline">
                    <AccountName account={r.account} contactName={r.contactName} />
                  </span>
                </td>
                <td className="py-3 px-4">
                  {r.contactName && <div className="text-xs font-medium truncate">{r.contactName}</div>}
                  {r.email && <div className="text-xs text-muted-foreground truncate">{r.email}</div>}
                  {r.phone && <div className="text-xs text-muted-foreground">{r.phone}</div>}
                  {!r.contactName && !r.email && !r.phone && <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="py-3 px-4">
                  {r.territory ? (
                    <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                      {r.territory}
                    </span>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">{r.rep || '—'}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1.5">
                    {r.counts.contacts > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] bg-muted text-muted-foreground" title={`${r.counts.contacts} contacts`}>
                        <Users className="size-3" />{r.counts.contacts}
                      </span>
                    )}
                    {r.counts.notes > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300" title={`${r.counts.notes} notes`}>
                        <StickyNote className="size-3" />{r.counts.notes}
                      </span>
                    )}
                    {r.counts.emails > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300" title={`${r.counts.emails} emails sent`}>
                        <Send className="size-3" />{r.counts.emails}
                      </span>
                    )}
                    {r.counts.openTodos > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold bg-[#005b5b] text-white" title={`${r.counts.openTodos} open to-dos`}>
                        <CheckSquare className="size-3" />{r.counts.openTodos}
                      </span>
                    )}
                    {!r.counts.contacts && !r.counts.notes && !r.counts.openTodos && !r.counts.emails && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
                <td className={`py-3 px-4 text-right tabular-nums whitespace-nowrap ${
                  r.openBalance > 0.005 ? 'font-bold text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
                }`}>
                  {r.openBalance > 0.005 ? fmt(r.openBalance) : '—'}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  No accounts match those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
