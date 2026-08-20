// Per-account CRM for the accounting Payments page.
//
//   AccountHeaderCard — territory/rep/customer-id strip plus the editable
//                       contact list. Replaces the old read-only contact card
//                       so the account's people live in exactly one place.
//   AccountCrmPanel   — Notes and To-Dos, side by side, below the KPIs.

import { useState } from 'react'
import {
  Plus, Pencil, Trash2, Check, X, Star, Mail, Phone, StickyNote, CheckSquare, Square,
  MapPin, UserPlus, Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCrm } from '@/context/CrmContext'

const NOTE_TEXTAREA =
  'w-full min-h-[90px] rounded-lg border bg-amber-50 dark:bg-zinc-800/50 dark:border-zinc-700 p-3 text-sm resize-y ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#005b5b]/30'

const fmtStamp = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

const fmtDue = (ymd) => {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  return `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`
}

const todayYmd = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_CONTACT = { name: '', title: '', email: '', phone: '', notes: '' }

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

function ContactForm({ initial, onSave, onCancel, saveLabel = 'Save' }) {
  const [draft, setDraft] = useState({ ...EMPTY_CONTACT, ...initial })
  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }))
  const canSave = draft.name.trim() || draft.email.trim()

  return (
    <div className="rounded-lg border-2 border-[#005b5b]/30 bg-[#005b5b]/[0.03] dark:bg-[#005b5b]/10 p-4 space-y-3 shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input value={draft.name} onChange={set('name')} placeholder="Jane Doe" autoFocus className="bg-background" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Title / role</Label>
          <Input value={draft.title} onChange={set('title')} placeholder="Buyer, AP, Owner…" className="bg-background" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Email</Label>
          <Input value={draft.email} onChange={set('email')} placeholder="jane@shop.com" type="email" className="bg-background" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Phone</Label>
          <Input value={draft.phone} onChange={set('phone')} placeholder="(555) 555-5555" className="bg-background" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Notes</Label>
        <Input value={draft.notes} onChange={set('notes')} placeholder="Best reached Tue–Thu mornings…" className="bg-background" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          disabled={!canSave}
          onClick={() => onSave({
            name: draft.name.trim(),
            title: draft.title.trim(),
            email: draft.email.trim(),
            phone: draft.phone.trim(),
            notes: draft.notes.trim(),
          })}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  )
}

function ContactCard({ contact, onEdit, onDelete, onMakePrimary, onCompose }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div className={`group relative rounded-lg border px-3.5 py-3 shadow-sm transition-shadow hover:shadow-md ${
      contact.isPrimary
        ? 'bg-[#005b5b]/[0.06] dark:bg-[#005b5b]/15 border-[#005b5b]/30'
        : 'bg-muted/40 dark:bg-zinc-800/40'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[10px] uppercase tracking-wider font-semibold ${
          contact.isPrimary ? 'text-[#005b5b] dark:text-teal-300' : 'text-muted-foreground'
        }`}>
          {contact.isPrimary ? 'Primary Contact' : 'Contact'}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {!contact.isPrimary && (
            <Button variant="ghost" size="icon" className="size-6" title="Make primary" onClick={onMakePrimary}>
              <Star className="size-3" />
            </Button>
          )}
          {onCompose && contact.email && (
            <Button variant="ghost" size="icon" className="size-6" title={`Email ${contact.email}`}
              onClick={() => onCompose({ to: contact.email, contactName: contact.name })}>
              <Mail className="size-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-6" title="Edit" onClick={onEdit}>
            <Pencil className="size-3" />
          </Button>
          {confirmDelete ? (
            <>
              <Button variant="ghost" size="icon" className="size-6 text-destructive" title="Confirm delete"
                onClick={() => { onDelete(); setConfirmDelete(false) }}>
                <Check className="size-3" />
              </Button>
              <Button variant="ghost" size="icon" className="size-6" title="Cancel" onClick={() => setConfirmDelete(false)}>
                <X className="size-3" />
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-destructive"
              title="Delete" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-1 font-semibold text-sm truncate">{contact.name || '—'}</div>
      {contact.title && <div className="text-xs text-muted-foreground truncate">{contact.title}</div>}
      <div className="mt-1.5 space-y-0.5 text-xs">
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-[#005b5b] truncate">
            <Mail className="size-3 shrink-0" /><span className="truncate">{contact.email}</span>
          </a>
        )}
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-[#005b5b]">
            <Phone className="size-3 shrink-0" />{contact.phone}
          </a>
        )}
      </div>
      {contact.notes && <div className="mt-1.5 text-xs text-muted-foreground italic">{contact.notes}</div>}
    </div>
  )
}

// Territory / rep / customer-id strip + the account's contacts, all in one card.
export function AccountHeaderCard({ account, repName, onEdit, onCompose }) {
  const { getContacts, addContact, updateContact, deleteContact, setPrimaryContact } = useCrm()
  const contacts = getContacts(account.id)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)

  // The customer import carried one name/email. Offer it as a one-click seed so
  // that data isn't stranded now that contacts are a list.
  const importedName = [account.firstName, account.lastName].filter(Boolean).join(' ')
  const showSeed = (importedName || account.email) && contacts.length === 0 && !adding

  // Every address we know for this account, for the header's Email button.
  const primaryContactName =
    (contacts.find((c) => c.isPrimary) || contacts[0])?.name || importedName || ''

  const emailList = (contacts.length
    ? contacts.map((c) => c.email).filter(Boolean)
    : [account.email].filter(Boolean)
  ).join(', ')

  return (
    <Card className="overflow-hidden shadow-sm">
      <div className="bg-muted/50 dark:bg-zinc-800/50 border-b px-5 py-2.5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#005b5b] dark:text-teal-300 uppercase tracking-wide text-xs">
            <MapPin className="size-3.5" />{account.territory || 'No territory'}
          </span>
          {repName && <span className="text-xs text-muted-foreground">Rep · <span className="text-foreground">{repName}</span></span>}
          {account.contactId && <span className="text-xs text-muted-foreground">Customer ID · {account.contactId}</span>}
        </div>
        <div className="flex items-center gap-2">
          {onCompose && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={!emailList}
              title={emailList ? `Email ${emailList}` : 'No contact email on this account'}
              onClick={() => onCompose({ to: emailList, contactName: primaryContactName })}
            >
              <Mail className="size-3.5 mr-1" /> Email
            </Button>
          )}
          {onEdit && (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onEdit}>
              <Pencil className="size-3.5 mr-1" /> Edit Account
            </Button>
          )}
          {!adding && (
            <Button size="sm" variant="outline" className="shadow-sm" onClick={() => { setAdding(true); setEditingId(null) }}>
              <Plus className="size-4 mr-1" /> Add Contact
            </Button>
          )}
        </div>
      </div>

      <CardContent className="pt-4 space-y-3">
        {adding && (
          <ContactForm
            initial={EMPTY_CONTACT}
            saveLabel="Add Contact"
            onCancel={() => setAdding(false)}
            onSave={(data) => { addContact(account.id, data); setAdding(false) }}
          />
        )}

        {showSeed && (
          <button
            type="button"
            onClick={() => addContact(account.id, { name: importedName, email: account.email || '' })}
            className="w-full text-left rounded-lg border border-dashed px-3.5 py-3 hover:border-[#005b5b]/50 hover:bg-[#005b5b]/[0.03] transition-colors group"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{importedName || account.email}</div>
                {importedName && account.email && <div className="text-xs text-muted-foreground truncate">{account.email}</div>}
                <div className="text-[11px] text-muted-foreground mt-0.5">From the customer import — click to make it an editable contact.</div>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#005b5b] shrink-0">
                <UserPlus className="size-3.5" /> Add
              </span>
            </div>
          </button>
        )}

        {contacts.length === 0 && !adding && !showSeed && (
          <p className="text-sm text-muted-foreground">No contacts yet — use Add Contact above.</p>
        )}

        {contacts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {contacts.map((c) => (
              editingId === c.id ? (
                <div key={c.id} className="sm:col-span-2 lg:col-span-3">
                  <ContactForm
                    initial={c}
                    onCancel={() => setEditingId(null)}
                    onSave={(data) => { updateContact(account.id, c.id, data); setEditingId(null) }}
                  />
                </div>
              ) : (
                <ContactCard
                  key={c.id}
                  contact={c}
                  onCompose={onCompose}
                  onEdit={() => { setEditingId(c.id); setAdding(false) }}
                  onDelete={() => deleteContact(account.id, c.id)}
                  onMakePrimary={() => setPrimaryContact(account.id, c.id)}
                />
              )
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

function NotesCard({ account }) {
  const { getNotes, addNote, updateNote, deleteNote } = useCrm()
  const notes = getNotes(account.id)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')

  const submit = () => {
    if (!draft.trim()) return
    addNote(account.id, draft)
    setDraft('')
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="inline-flex items-center justify-center size-7 rounded-lg bg-amber-500 shadow-sm">
            <StickyNote className="size-4 text-white" />
          </span>
          Notes
          {notes.length > 0 && <span className="text-xs font-normal text-muted-foreground">({notes.length})</span>}
        </CardTitle>
        <CardDescription>Anything worth remembering about this account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <textarea
            className={NOTE_TEXTAREA}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit() }}
            placeholder="Left a voicemail about the past-due invoices…"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">⌘/Ctrl + Enter to save</span>
            <Button size="sm" disabled={!draft.trim()} onClick={submit}>Add Note</Button>
          </div>
        </div>

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="group rounded-lg border bg-muted/30 dark:bg-zinc-800/30 px-3 py-2.5 shadow-sm">
                {editingId === n.id ? (
                  <div className="space-y-2">
                    <textarea className={NOTE_TEXTAREA} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} autoFocus />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" disabled={!editDraft.trim()} onClick={() => { updateNote(account.id, n.id, editDraft); setEditingId(null) }}>
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
                          title="Delete" onClick={() => deleteNote(account.id, n.id)}>
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      {n.author} · {fmtStamp(n.createdAt)}{n.editedAt && ' · edited'}
                    </div>
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

// ---------------------------------------------------------------------------
// To-dos
// ---------------------------------------------------------------------------

export function TodoRow({ todo, onToggle, onDelete, showAccount }) {
  const overdue = !todo.done && todo.due && todo.due < todayYmd()
  return (
    <div className={`group flex items-start gap-3 rounded-lg border px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md ${
      todo.done
        ? 'bg-muted/20 border-dashed'
        : overdue
          ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
          : 'bg-card'
    }`}>
      <button
        type="button"
        onClick={() => onToggle(todo.id)}
        className={`mt-0.5 shrink-0 ${todo.done ? 'text-[#005b5b]' : 'text-muted-foreground hover:text-[#005b5b]'}`}
        title={todo.done ? 'Mark as not done' : 'Mark as done'}
      >
        {todo.done ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-sm ${todo.done ? 'line-through text-muted-foreground' : ''}`}>
          {todo.priority === 'high' && !todo.done && (
            <span className="mr-1.5 text-[10px] uppercase tracking-wide font-semibold text-white bg-red-600 rounded px-1.5 py-0.5">
              High
            </span>
          )}
          {todo.title}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
          {showAccount && todo.accountName && <span className="font-medium text-foreground/70">{todo.accountName}</span>}
          {todo.due && (
            <span className={overdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
              Due {fmtDue(todo.due)}{overdue ? ' · overdue' : ''}
            </span>
          )}
          <span>{todo.author}</span>
        </div>
      </div>
      <Button
        variant="ghost" size="icon"
        className="size-6 shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        title="Delete"
        onClick={() => onDelete(todo.id)}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  )
}

// Title + due date + priority in one row. Used on the account page and the
// dashboard (which also passes an account picker through `extraField`).
export function TodoComposer({ onAdd, placeholder = 'Follow up on past-due invoice…', extraField }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState('normal')

  const submit = () => {
    if (!title.trim()) return
    onAdd({ title: title.trim(), due: due || null, priority })
    setTitle('')
    setDue('')
    setPriority('normal')
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 dark:bg-zinc-800/30 p-2">
      <Input
        className="w-full bg-background"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        placeholder={placeholder}
      />
      <div className="flex flex-wrap items-center gap-2">
        {extraField}
        <Input
          type="date"
          className="w-[150px] bg-background"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          title="Due date"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm w-[110px]"
          title="Priority"
        >
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select>
        <Button className="ml-auto" disabled={!title.trim()} onClick={submit}>
          <Plus className="size-4 mr-1" /> Add
        </Button>
      </div>
    </div>
  )
}

function TodosCard({ account }) {
  const { getTodos, addTodo, toggleTodo, deleteTodo } = useCrm()
  const todos = getTodos(account.id)
  const open = todos.filter((t) => !t.done)
  const done = todos.filter((t) => t.done)
  const [showDone, setShowDone] = useState(false)

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="inline-flex items-center justify-center size-7 rounded-lg bg-[#005b5b] shadow-sm">
            <CheckSquare className="size-4 text-white" />
          </span>
          To-Dos
          {open.length > 0 && <span className="text-xs font-normal text-muted-foreground">({open.length} open)</span>}
        </CardTitle>
        <CardDescription>Also shows up on the accounting Dashboard</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TodoComposer onAdd={(data) => addTodo({ ...data, accountId: account.id, accountName: account.name })} />

        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing open for this account.</p>
        ) : (
          <div className="space-y-2">
            {open.map((t) => <TodoRow key={t.id} todo={t} onToggle={toggleTodo} onDelete={deleteTodo} />)}
          </div>
        )}

        {done.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showDone ? 'Hide' : 'Show'} {done.length} completed
            </button>
            {showDone && done.map((t) => <TodoRow key={t.id} todo={t} onToggle={toggleTodo} onDelete={deleteTodo} />)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Sent email log
// ---------------------------------------------------------------------------

function EmailsCard({ account, onCompose }) {
  const { getEmails } = useCrm()
  const emails = getEmails(account.id)

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="inline-flex items-center justify-center size-7 rounded-lg bg-sky-600 shadow-sm">
              <Send className="size-4 text-white" />
            </span>
            Emails
            {emails.length > 0 && <span className="text-xs font-normal text-muted-foreground">({emails.length})</span>}
          </CardTitle>
          <CardDescription>Sent from RepCommish — Gmail keeps the full thread</CardDescription>
        </div>
        {onCompose && (
          <Button size="sm" variant="outline" className="shadow-sm" onClick={() => onCompose({})}>
            <Mail className="size-4 mr-1" /> New Email
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {emails.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent to this account yet.</p>
        ) : (
          <div className="space-y-2">
            {emails.map((e) => (
              <div key={e.id} className="rounded-lg border bg-muted/30 dark:bg-zinc-800/30 px-3 py-2.5 shadow-sm">
                <div className="text-sm font-medium truncate">{e.subject || '(no subject)'}</div>
                <div className="mt-0.5 text-xs text-muted-foreground truncate">To {e.to}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {e.author} · {fmtStamp(e.sentAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------

export default function AccountCrmPanel({ account, onCompose }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <div className="space-y-4">
        <TodosCard account={account} />
        <EmailsCard account={account} onCompose={onCompose} />
      </div>
      <NotesCard account={account} />
    </div>
  )
}
