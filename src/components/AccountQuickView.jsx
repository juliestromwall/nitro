import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Info, Globe, Phone as PhoneIcon, Mail, MapPin, User, Plus, Pencil, Trash2, X, Check, CheckCircle2, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { useAccounts } from '@/context/AccountContext'
import { useCompanies } from '@/context/CompanyContext'
import { useTodos } from '@/context/TodoContext'
import { useAuth } from '@/context/AuthContext'

const extractDomain = (url) => {
  if (!url) return null
  let domain = url.trim().toLowerCase()
  domain = domain.replace(/^https?:\/\//, '')
  domain = domain.replace(/^www\./, '')
  domain = domain.split('/')[0]
  if (!domain.includes('.')) return null
  return domain
}

function AccountQuickView({ accountId }) {
  const { userRole } = useAuth()
  const { getAccount, updateAccount } = useAccounts()
  const { companies } = useCompanies()
  const { addTodo, getTodosByAccount, toggleComplete } = useTodos()
  const account = getAccount(accountId)
  const [open, setOpen] = useState(false)
  const [logoUrl, setLogoUrl] = useState(null)

  // Contact editing
  const [editingContact, setEditingContact] = useState(null) // 'primary' | index number | null
  const [contactForm, setContactForm] = useState({ name: '', phone: '', extension: '', email: '', address: '', role: '' })
  const [addingContact, setAddingContact] = useState(false)

  // Notes
  const [notes, setNotes] = useState('')
  const notesTimer = useRef(null)

  // Todo quick add
  const [showTodoForm, setShowTodoForm] = useState(false)
  const [todoTitle, setTodoTitle] = useState('')
  const [todoCompanyId, setTodoCompanyId] = useState('')

  useEffect(() => {
    const src = account?.logo_path || null
    if (src) { setLogoUrl(src); return }
    const domain = extractDomain(account?.website)
    if (!domain) { setLogoUrl(null); return }
    const clearbitUrl = `https://logo.clearbit.com/${domain}`
    const img = new Image()
    img.onload = () => setLogoUrl(clearbitUrl)
    img.onerror = () => setLogoUrl(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`)
    img.src = clearbitUrl
  }, [account?.website, account?.logo_path])

  useEffect(() => {
    if (open && account) setNotes(account.notes || '')
  }, [open, account])

  const canView = userRole === 'master_admin' || userRole === 'pro_rep'
  if (!canView || !account) return null

  const pc = account.primary_contact && typeof account.primary_contact === 'object' ? account.primary_contact : {}
  const additionalContacts = Array.isArray(account.additional_contacts) ? account.additional_contacts : []
  const accountTodos = getTodosByAccount(accountId)
  const incompleteTodos = accountTodos.filter((t) => !t.completed)
  const hasInfo = account.website || account.phone || pc.name || additionalContacts.length > 0 || incompleteTodos.length > 0
  if (!hasInfo) return null

  const websiteHref = account.website
    ? (account.website.startsWith('http') ? account.website : `https://${account.website}`)
    : null

  const handleNotesChange = (value) => {
    setNotes(value)
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => {
      updateAccount(accountId, { notes: value })
    }, 800)
  }

  // Contact CRUD
  const startEditPrimary = () => {
    setEditingContact('primary')
    setContactForm({ name: pc.name || '', phone: pc.phone || '', extension: pc.extension || '', email: pc.email || '', address: pc.address || '', role: pc.role || '' })
    setAddingContact(false)
  }

  const startEditAdditional = (index) => {
    const c = additionalContacts[index]
    setEditingContact(index)
    setContactForm({ name: c.name || '', phone: c.phone || '', extension: c.extension || '', email: c.email || '', address: '', role: c.role || '' })
    setAddingContact(false)
  }

  const startAddContact = () => {
    setAddingContact(true)
    setEditingContact(null)
    setContactForm({ name: '', phone: '', extension: '', email: '', address: '', role: '' })
  }

  const cancelEdit = () => {
    setEditingContact(null)
    setAddingContact(false)
  }

  const savePrimaryContact = async () => {
    try {
      await updateAccount(accountId, {
        primary_contact: { name: contactForm.name, phone: contactForm.phone, extension: contactForm.extension, email: contactForm.email, address: contactForm.address, role: contactForm.role },
      })
      setEditingContact(null)
    } catch (err) {
      console.error('Failed to save primary contact:', err)
    }
  }

  const saveAdditionalContact = async (index) => {
    try {
      const updated = [...additionalContacts]
      updated[index] = { name: contactForm.name, phone: contactForm.phone, extension: contactForm.extension, email: contactForm.email, role: contactForm.role }
      await updateAccount(accountId, { additional_contacts: updated })
      setEditingContact(null)
    } catch (err) {
      console.error('Failed to save contact:', err)
    }
  }

  const saveNewContact = async () => {
    if (!contactForm.name.trim()) return
    try {
      if (!pc.name) {
        await updateAccount(accountId, {
          primary_contact: { name: contactForm.name, phone: contactForm.phone, extension: contactForm.extension, email: contactForm.email, address: contactForm.address, role: contactForm.role },
        })
      } else {
        const updated = [...additionalContacts, { name: contactForm.name, phone: contactForm.phone, extension: contactForm.extension, email: contactForm.email, role: contactForm.role }]
        await updateAccount(accountId, { additional_contacts: updated })
      }
      setAddingContact(false)
      setContactForm({ name: '', phone: '', extension: '', email: '', address: '', role: '' })
    } catch (err) {
      console.error('Failed to save new contact:', err)
    }
  }

  const deleteAdditionalContact = async (index) => {
    const updated = additionalContacts.filter((_, i) => i !== index)
    await updateAccount(accountId, { additional_contacts: updated })
  }

  const handleAddTodo = async () => {
    if (!todoTitle.trim()) return
    await addTodo({
      title: todoTitle,
      client_id: accountId,
      company_id: todoCompanyId ? parseInt(todoCompanyId) : null,
      note: '',
      phone: '',
      due_date: null,
    })
    setTodoTitle('')
    setTodoCompanyId('')
    setShowTodoForm(false)
  }

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="inline-flex items-center justify-center p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
        title="Account info"
      >
        <Info className="size-3.5 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center gap-3 mb-1">
            {logoUrl ? (
              <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center p-0.5 shrink-0">
                <img src={logoUrl} alt="" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-lg font-bold text-zinc-500 dark:text-zinc-300 shrink-0">
                {account.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <Link
                to={`/app/accounts/${account.id}`}
                className="font-bold text-base text-[#005b5b] dark:text-[#00b3b3] hover:underline"
                onClick={() => setOpen(false)}
              >
                {account.name}
              </Link>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {account.region && <span>{account.region}</span>}
                {account.type && <span>{account.type}</span>}
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-3">
            {websiteHref && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="size-3.5 text-muted-foreground shrink-0" />
                <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="text-[#005b5b] dark:text-[#00b3b3] hover:underline truncate" onClick={(e) => e.stopPropagation()}>
                  {account.website}
                </a>
              </div>
            )}
            {account.phone && (
              <div className="flex items-center gap-2 text-sm">
                <PhoneIcon className="size-3.5 text-muted-foreground shrink-0" />
                <span>{account.phone}</span>
              </div>
            )}

            {/* Primary Contact */}
            {pc.name && editingContact !== 'primary' && (
              <div className="border rounded-lg p-3 bg-zinc-50 dark:bg-zinc-800/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-muted-foreground">Primary Contact</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startEditPrimary}>
                    <Pencil className="size-3 text-muted-foreground" />
                  </Button>
                </div>
                <div className="font-medium text-sm">
                  {pc.name}
                  {pc.role && <span className="text-muted-foreground ml-1 text-xs">({pc.role})</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                  {pc.phone && <span className="flex items-center gap-1"><PhoneIcon className="size-3" />{pc.phone}{pc.extension && ` x${pc.extension}`}</span>}
                  {pc.email && <span className="flex items-center gap-1"><Mail className="size-3" />{pc.email}</span>}
                  {pc.address && <span className="flex items-center gap-1"><MapPin className="size-3" />{pc.address}</span>}
                </div>
              </div>
            )}

            {/* Primary Contact Edit Form */}
            {editingContact === 'primary' && (
              <div className="border rounded-lg p-3 space-y-2 bg-zinc-50 dark:bg-zinc-800/50">
                <div className="text-xs font-semibold text-muted-foreground">Edit Primary Contact</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={contactForm.name} onChange={(e) => setContactForm(p => ({ ...p, name: e.target.value }))} placeholder="Name" className="text-sm h-8" />
                  <Input value={contactForm.role} onChange={(e) => setContactForm(p => ({ ...p, role: e.target.value }))} placeholder="Role" className="text-sm h-8" />
                  <Input value={contactForm.phone} onChange={(e) => setContactForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="text-sm h-8" />
                  <Input value={contactForm.extension} onChange={(e) => setContactForm(p => ({ ...p, extension: e.target.value }))} placeholder="Extension" className="text-sm h-8" />
                  <Input value={contactForm.email} onChange={(e) => setContactForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="text-sm h-8" />
                  <Input value={contactForm.address} onChange={(e) => setContactForm(p => ({ ...p, address: e.target.value }))} placeholder="Address" className="text-sm h-8" />
                </div>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-7 text-xs">Cancel</Button>
                  <Button size="sm" onClick={savePrimaryContact} className="h-7 text-xs">Save</Button>
                </div>
              </div>
            )}

            {/* Additional Contacts */}
            {additionalContacts.map((c, i) => (
              editingContact === i ? (
                <div key={i} className="border rounded-lg p-3 space-y-2 bg-zinc-50 dark:bg-zinc-800/50">
                  <div className="text-xs font-semibold text-muted-foreground">Edit Contact</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={contactForm.name} onChange={(e) => setContactForm(p => ({ ...p, name: e.target.value }))} placeholder="Name" className="text-sm h-8" />
                    <Input value={contactForm.role} onChange={(e) => setContactForm(p => ({ ...p, role: e.target.value }))} placeholder="Role" className="text-sm h-8" />
                    <Input value={contactForm.phone} onChange={(e) => setContactForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="text-sm h-8" />
                    <Input value={contactForm.extension} onChange={(e) => setContactForm(p => ({ ...p, extension: e.target.value }))} placeholder="Extension" className="text-sm h-8" />
                    <Input value={contactForm.email} onChange={(e) => setContactForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="text-sm h-8" />
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-7 text-xs">Cancel</Button>
                    <Button size="sm" onClick={() => saveAdditionalContact(i)} className="h-7 text-xs">Save</Button>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex items-center gap-3 text-sm border rounded-lg px-3 py-2">
                  <User className="size-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{c.name}</span>
                    {c.role && <span className="text-muted-foreground ml-1 text-xs">({c.role})</span>}
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      {c.phone && <span>{c.phone}{c.extension && ` x${c.extension}`}</span>}
                      {c.email && <span className="truncate">{c.email}</span>}
                    </div>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditAdditional(i)}>
                      <Pencil className="size-3 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteAdditionalContact(i)}>
                      <Trash2 className="size-3 text-red-500" />
                    </Button>
                  </div>
                </div>
              )
            ))}

            {/* Add Contact Form */}
            {addingContact ? (
              <div className="border rounded-lg p-3 space-y-2 bg-zinc-50 dark:bg-zinc-800/50">
                <div className="text-xs font-semibold text-muted-foreground">{!pc.name ? 'Add Primary Contact' : 'Add Contact'}</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={contactForm.name} onChange={(e) => setContactForm(p => ({ ...p, name: e.target.value }))} placeholder="Name" className="text-sm h-8" />
                  <Input value={contactForm.role} onChange={(e) => setContactForm(p => ({ ...p, role: e.target.value }))} placeholder="Role" className="text-sm h-8" />
                  <Input value={contactForm.phone} onChange={(e) => setContactForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="text-sm h-8" />
                  <Input value={contactForm.extension} onChange={(e) => setContactForm(p => ({ ...p, extension: e.target.value }))} placeholder="Extension" className="text-sm h-8" />
                  <Input value={contactForm.email} onChange={(e) => setContactForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="text-sm h-8" />
                  {!pc.name && (
                    <Input value={contactForm.address} onChange={(e) => setContactForm(p => ({ ...p, address: e.target.value }))} placeholder="Address" className="text-sm h-8" />
                  )}
                </div>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-7 text-xs">Cancel</Button>
                  <Button size="sm" onClick={saveNewContact} disabled={!contactForm.name.trim()} className="h-7 text-xs">Save</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={startAddContact} className="w-full">
                <Plus className="size-3 mr-1" /> Add Contact
              </Button>
            )}

            {/* Todos */}
            {incompleteTodos.length > 0 && (
              <div className="border-t pt-3">
                <Label className="text-xs font-semibold text-muted-foreground">To Dos ({incompleteTodos.length})</Label>
                <div className="space-y-1 mt-1">
                  {incompleteTodos.map((todo) => {
                    const isOverdue = todo.due_date && new Date(todo.due_date) < new Date() && !todo.completed
                    return (
                      <div key={todo.id} className="flex items-start gap-2 text-sm group">
                        <button onClick={() => toggleComplete(todo.id)} className="mt-0.5 shrink-0">
                          <Circle className="size-3.5 text-muted-foreground hover:text-[#005b5b]" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className={isOverdue ? 'text-red-600 dark:text-red-400' : ''}>{todo.title}</span>
                          {todo.due_date && (
                            <span className={`ml-1 text-xs ${isOverdue ? 'text-red-500' : 'text-muted-foreground'}`}>
                              {new Date(todo.due_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="border-t pt-3">
              <Label className="text-xs font-semibold text-muted-foreground">Notes</Label>
              <textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Add notes..."
                className="w-full min-h-[60px] mt-1 rounded-lg border bg-zinc-50 dark:bg-zinc-800/50 p-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#005b5b]/30 dark:border-zinc-700"
              />
            </div>

            {/* Quick Add Todo */}
            <div className="border-t pt-3">
              {showTodoForm ? (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Quick Add To Do</Label>
                  <Input value={todoTitle} onChange={(e) => setTodoTitle(e.target.value)} placeholder="To do title..." className="text-sm h-8" />
                  <select
                    value={todoCompanyId}
                    onChange={(e) => setTodoCompanyId(e.target.value)}
                    className="w-full rounded-md border px-2 py-1 text-sm dark:bg-zinc-800 dark:border-zinc-700"
                  >
                    <option value="">No brand</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setShowTodoForm(false); setTodoTitle('') }} className="h-7 text-xs">Cancel</Button>
                    <Button size="sm" onClick={handleAddTodo} disabled={!todoTitle.trim()} className="h-7 text-xs">Add</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setShowTodoForm(true)} className="w-full">
                  <Plus className="size-3 mr-1" /> Add To Do
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default AccountQuickView
