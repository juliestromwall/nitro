// Accounting home — the first tab on the Payments page. To-dos across every
// account, a quick-notes scratchpad, and top-line stats.

import { useMemo, useState } from 'react'
import { CheckSquare, StickyNote, Trash2, Pencil, AlertTriangle, Wallet, Store, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useCrm } from '@/context/CrmContext'
import { TodoRow, TodoComposer } from '@/components/accounting/AccountCrmPanel'
import { StatTile } from '@/components/accounting/StatTile'
import GmailConnectCard from '@/components/gmail/GmailConnectCard'

const NOTE_TEXTAREA =
  'w-full min-h-[90px] rounded-lg border bg-amber-50 dark:bg-zinc-800/50 dark:border-zinc-700 p-3 text-sm resize-y ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#005b5b]/30'

const fmtMoney = (n) => {
  const num = Number(n || 0)
  const abs = Math.abs(num).toLocaleString('en-US', { maximumFractionDigits: 0 })
  return num < 0 ? `-$${abs}` : `$${abs}`
}

const fmtStamp = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

const todayYmd = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function QuickNotes() {
  const { quickNotes, addQuickNote, updateQuickNote, deleteQuickNote } = useCrm()
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')

  const submit = () => {
    if (!draft.trim()) return
    addQuickNote(draft)
    setDraft('')
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="inline-flex items-center justify-center size-7 rounded-lg bg-amber-500 shadow-sm">
            <StickyNote className="size-4 text-white" />
          </span>
          Quick Notes
          {quickNotes.length > 0 && <span className="text-xs font-normal text-muted-foreground">({quickNotes.length})</span>}
        </CardTitle>
        <CardDescription>Scratchpad — not tied to any account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <textarea
            className={NOTE_TEXTAREA}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit() }}
            placeholder="Jot something down…"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">⌘/Ctrl + Enter to save</span>
            <Button size="sm" disabled={!draft.trim()} onClick={submit}>Add Note</Button>
          </div>
        </div>

        {quickNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <div className="space-y-2">
            {quickNotes.map((n) => (
              <div key={n.id} className="group rounded-lg border bg-muted/30 dark:bg-zinc-800/30 px-3 py-2.5 shadow-sm">
                {editingId === n.id ? (
                  <div className="space-y-2">
                    <textarea className={NOTE_TEXTAREA} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} autoFocus />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" disabled={!editDraft.trim()} onClick={() => { updateQuickNote(n.id, editDraft); setEditingId(null) }}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm whitespace-pre-wrap min-w-0">{n.body}</p>
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="size-6" title="Edit"
                          onClick={() => { setEditingId(n.id); setEditDraft(n.body) }}>
                          <Pencil className="size-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-destructive"
                          title="Delete" onClick={() => deleteQuickNote(n.id)}>
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-1.5 text-[11px] text-muted-foreground">{n.author} · {fmtStamp(n.createdAt)}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AccountingDashboard({ accounts = [], stats = {}, onSelectAccount, onCompose }) {
  const { todos, addTodo, toggleTodo, deleteTodo } = useCrm()
  const [filter, setFilter] = useState('open') // 'open' | 'overdue' | 'done'
  const [todoAccountId, setTodoAccountId] = useState('')

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => a.name.localeCompare(b.name)),
    [accounts]
  )

  const today = todayYmd()
  const openTodos = useMemo(() => todos.filter((t) => !t.done), [todos])
  const overdueTodos = useMemo(() => openTodos.filter((t) => t.due && t.due < today), [openTodos, today])
  const doneTodos = useMemo(() => todos.filter((t) => t.done), [todos])

  // Open items first by due date (undated last), then priority.
  const visibleTodos = useMemo(() => {
    const list = filter === 'done' ? doneTodos : filter === 'overdue' ? overdueTodos : openTodos
    const rank = { high: 0, normal: 1, low: 2 }
    return [...list].sort((a, b) => {
      if (filter === 'done') return (b.completedAt || '').localeCompare(a.completedAt || '')
      const da = a.due || '9999-99-99'
      const db = b.due || '9999-99-99'
      if (da !== db) return da.localeCompare(db)
      return (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1)
    })
  }, [filter, openTodos, overdueTodos, doneTodos])

  const FILTERS = [
    { key: 'open', label: `Open (${openTodos.length})` },
    { key: 'overdue', label: `Overdue (${overdueTodos.length})` },
    { key: 'done', label: `Done (${doneTodos.length})` },
  ]

  return (
    <div className="space-y-6">
      {/* Stats — overdue turns red so it can't hide among the others */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          icon={Wallet}
          tone="teal"
          label="Open Balance"
          value={fmtMoney(stats.openBalanceTotal)}
          hint={`${stats.accountsWithBalance || 0} accounts owing`}
        />
        <StatTile
          icon={Store}
          tone="zinc"
          label="Accounts"
          value={(stats.accountCount || 0).toLocaleString()}
          hint={`${stats.territoryCount || 0} territories`}
        />
        <StatTile
          icon={CheckSquare}
          tone="emerald"
          label="Open To-Dos"
          value={openTodos.length}
          hint={`${doneTodos.length} completed`}
          onClick={() => setFilter('open')}
        />
        <StatTile
          icon={AlertTriangle}
          tone={overdueTodos.length ? 'red' : 'zinc'}
          label="Overdue"
          value={overdueTodos.length}
          hint="past their due date"
          onClick={() => setFilter('overdue')}
        />
      </div>

      {onCompose && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="shadow-sm" onClick={onCompose}>
            <Mail className="size-4 mr-1" /> New Email
          </Button>
        </div>
      )}

      {overdueTodos.length > 0 && filter !== 'overdue' && (
        <button
          type="button"
          onClick={() => setFilter('overdue')}
          className="w-full text-left rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-3 py-2.5 text-sm text-red-900 dark:text-red-200"
        >
          <AlertTriangle className="size-4 inline mr-1.5 -mt-0.5" />
          <span className="font-semibold">{overdueTodos.length} overdue {overdueTodos.length === 1 ? 'to-do' : 'to-dos'}</span>
          {' — '}<span className="underline">review</span>
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* To-dos */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="inline-flex items-center justify-center size-7 rounded-lg bg-[#005b5b] shadow-sm">
                <CheckSquare className="size-4 text-white" />
              </span>
              To-Dos
            </CardTitle>
            <CardDescription>Everything open across all accounts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TodoComposer
              placeholder="Call about the past-due invoice…"
              extraField={
                <select
                  value={todoAccountId}
                  onChange={(e) => setTodoAccountId(e.target.value)}
                  className="h-9 px-3 rounded-md border border-input bg-transparent text-sm sm:w-[190px]"
                  title="Attach to an account"
                >
                  <option value="">No account</option>
                  {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              }
              onAdd={(data) => {
                const acct = sortedAccounts.find((a) => a.id === todoAccountId)
                addTodo({ ...data, accountId: acct?.id || null, accountName: acct?.name || null })
              }}
            />

            <div className="flex items-center gap-1 border-b">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    filter === f.key
                      ? 'border-[#005b5b] text-[#005b5b]'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {visibleTodos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                {filter === 'done' ? 'Nothing completed yet.' : filter === 'overdue' ? 'Nothing overdue. Nice.' : 'All clear — no open to-dos.'}
              </p>
            ) : (
              <div className="space-y-2">
                {visibleTodos.map((t) => (
                  <div key={t.id} className="group relative">
                    <TodoRow todo={t} onToggle={toggleTodo} onDelete={deleteTodo} showAccount />
                    {t.accountId && onSelectAccount && (
                      <button
                        type="button"
                        onClick={() => onSelectAccount(t.accountId)}
                        className="absolute right-10 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground hover:text-[#005b5b] opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Open account →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <GmailConnectCard />
          <QuickNotes />
        </div>
      </div>
    </div>
  )
}
