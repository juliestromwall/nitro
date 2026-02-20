import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import {
  ArrowLeft, Globe, Phone as PhoneIcon, Mail, MapPin, User, Plus, Pencil, Trash2,
  Pin, PinOff, Upload, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useAuth } from '@/context/AuthContext'
import { useAccounts } from '@/context/AccountContext'
import { useCompanies } from '@/context/CompanyContext'
import { useSales, deriveCycle } from '@/context/SalesContext'
import { useTodos } from '@/context/TodoContext'
import { uploadLogo } from '@/lib/db'
import { EXCLUDED_STAGES } from '@/lib/constants'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0)

const extractDomain = (url) => {
  if (!url) return null
  let domain = url.trim().toLowerCase()
  domain = domain.replace(/^https?:\/\//, '')
  domain = domain.replace(/^www\./, '')
  domain = domain.split('/')[0]
  if (!domain.includes('.')) return null
  return domain
}

function AccountDetail() {
  const { id } = useParams()
  const accountId = parseInt(id)
  const { user, userRole } = useAuth()
  const { getAccount, updateAccount } = useAccounts()
  const { companies } = useCompanies()
  const { orders, commissions, seasons } = useSales()
  const { getTodosByAccount, addTodo, updateTodo, toggleComplete, togglePin, deleteTodo } = useTodos()

  const canView = userRole === 'master_admin' || userRole === 'pro_rep'
  const account = getAccount(accountId)
  const accountTodos = getTodosByAccount(accountId)

  // Logo
  const [logoUrl, setLogoUrl] = useState(null)
  useEffect(() => {
    if (account?.logo_path) { setLogoUrl(account.logo_path); return }
    const domain = extractDomain(account?.website)
    if (!domain) { setLogoUrl(null); return }
    const clearbitUrl = `https://logo.clearbit.com/${domain}`
    const img = new Image()
    img.onload = () => setLogoUrl(clearbitUrl)
    img.onerror = () => setLogoUrl(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`)
    img.src = clearbitUrl
  }, [account?.website, account?.logo_path])

  const logoInputRef = useRef(null)
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const publicUrl = await uploadLogo(user.id, accountId, file)
      await updateAccount(accountId, { logo_path: publicUrl })
    } catch (err) {
      console.error('Failed to upload logo:', err)
    }
  }

  // ---- Edit Dialog ----
  const [editOpen, setEditOpen] = useState(false)
  const [editAutoLogo, setEditAutoLogo] = useState(null)
  const [editLogoPreview, setEditLogoPreview] = useState(null)
  const [editLogoFile, setEditLogoFile] = useState(null)
  const editFileRef = useRef(null)
  const emptyForm = { name: '', account_number: '', region: '', type: '', city: '', state: '', website: '', phone: '', logo_path: '' }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editLogoPreview || editLogoFile) return
    const domain = extractDomain(form.website)
    if (!domain) { setEditAutoLogo(null); return }
    const clearbitUrl = `https://logo.clearbit.com/${domain}`
    const img = new Image()
    img.onload = () => setEditAutoLogo(clearbitUrl)
    img.onerror = () => setEditAutoLogo(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`)
    img.src = clearbitUrl
  }, [form.website, editLogoPreview, editLogoFile])

  const openEdit = () => {
    if (!account) return
    setForm({
      name: account.name || '', account_number: account.account_number || '',
      region: account.region || '', type: account.type || '',
      city: account.city || '', state: account.state || '',
      website: account.website || '', phone: account.phone || '',
      logo_path: account.logo_path || '',
    })
    setEditLogoPreview(null)
    setEditLogoFile(null)
    setEditOpen(true)
  }

  const handleFormChange = (field, value) => setForm((p) => ({ ...p, [field]: value }))

  const handleEditLogoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setEditLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => { setEditLogoPreview(ev.target.result) }
    reader.readAsDataURL(file)
  }

  const removeEditLogo = () => {
    setEditLogoPreview(null); setEditLogoFile(null); setEditAutoLogo(null)
    setForm((p) => ({ ...p, logo_path: '' }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      let logoPath = form.logo_path
      if (editLogoFile) logoPath = await uploadLogo(user.id, accountId, editLogoFile)
      if (!logoPath && editAutoLogo) logoPath = editAutoLogo
      await updateAccount(accountId, { ...form, logo_path: logoPath })
      setEditOpen(false)
    } catch (err) {
      console.error('Failed to save account:', err)
    } finally {
      setSaving(false)
    }
  }

  const editCurrentLogo = editLogoPreview || editAutoLogo || form.logo_path

  // ---- Contact Inline Editing ----
  const pc = account?.primary_contact && typeof account.primary_contact === 'object' ? account.primary_contact : {}
  const additionalContacts = Array.isArray(account?.additional_contacts) ? account.additional_contacts : []
  const [editingContact, setEditingContact] = useState(null)
  const [addingContact, setAddingContact] = useState(false)
  const [contactSaving, setContactSaving] = useState(false)
  const emptyContactForm = { name: '', phone: '', email: '', address: '', role: '', extension: '' }
  const [contactForm, setContactForm] = useState(emptyContactForm)

  const startEditPrimary = () => {
    setEditingContact('primary')
    setContactForm({ name: pc.name || '', phone: pc.phone || '', email: pc.email || '', address: pc.address || '', role: pc.role || '', extension: pc.extension || '' })
    setAddingContact(false)
  }
  const startEditAdditional = (i) => {
    const c = additionalContacts[i]
    setEditingContact(i)
    setContactForm({ name: c.name || '', phone: c.phone || '', email: c.email || '', address: '', role: c.role || '', extension: c.extension || '' })
    setAddingContact(false)
  }
  const startAddContact = () => {
    setAddingContact(true)
    setEditingContact(null)
    setContactForm(emptyContactForm)
  }
  const cancelContactEdit = () => { setEditingContact(null); setAddingContact(false) }

  const savePrimaryContact = async () => {
    setContactSaving(true)
    try {
      await updateAccount(accountId, {
        primary_contact: { name: contactForm.name, phone: contactForm.phone, email: contactForm.email, address: contactForm.address, role: contactForm.role, extension: contactForm.extension },
      })
      setEditingContact(null)
    } catch (err) {
      console.error('Failed to save primary contact:', err)
    } finally {
      setContactSaving(false)
    }
  }
  const saveAdditionalContact = async (i) => {
    setContactSaving(true)
    try {
      const updated = [...additionalContacts]
      updated[i] = { name: contactForm.name, phone: contactForm.phone, email: contactForm.email, role: contactForm.role, extension: contactForm.extension }
      await updateAccount(accountId, { additional_contacts: updated })
      setEditingContact(null)
    } catch (err) {
      console.error('Failed to save contact:', err)
    } finally {
      setContactSaving(false)
    }
  }
  const saveNewContact = async () => {
    if (!contactForm.name.trim()) return
    setContactSaving(true)
    try {
      if (!pc.name) {
        await updateAccount(accountId, {
          primary_contact: { name: contactForm.name, phone: contactForm.phone, email: contactForm.email, address: contactForm.address, role: contactForm.role, extension: contactForm.extension },
        })
      } else {
        await updateAccount(accountId, {
          additional_contacts: [...additionalContacts, { name: contactForm.name, phone: contactForm.phone, email: contactForm.email, role: contactForm.role, extension: contactForm.extension }],
        })
      }
      setAddingContact(false)
      setContactForm(emptyContactForm)
    } catch (err) {
      console.error('Failed to add contact:', err)
    } finally {
      setContactSaving(false)
    }
  }
  const deleteAdditionalContact = async (i) => {
    try {
      await updateAccount(accountId, { additional_contacts: additionalContacts.filter((_, idx) => idx !== i) })
    } catch (err) {
      console.error('Failed to delete contact:', err)
    }
  }

  // Contact edit form rendered inline (not as a sub-component to avoid focus loss)
  const renderContactForm = (label, isPrimary, onSave) => (
    <div className="border rounded-lg p-3 space-y-2 bg-zinc-50 dark:bg-zinc-800/50">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <Input value={contactForm.name} onChange={(e) => setContactForm(p => ({ ...p, name: e.target.value }))} placeholder="Name" className="h-8 text-sm" />
        <Input value={contactForm.role} onChange={(e) => setContactForm(p => ({ ...p, role: e.target.value }))} placeholder="Role / Title" className="h-8 text-sm" />
        <Input value={contactForm.phone} onChange={(e) => setContactForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="h-8 text-sm" />
        <Input value={contactForm.extension} onChange={(e) => setContactForm(p => ({ ...p, extension: e.target.value }))} placeholder="Extension" className="h-8 text-sm" />
        <Input value={contactForm.email} onChange={(e) => setContactForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="h-8 text-sm" />
        {isPrimary && <Input value={contactForm.address} onChange={(e) => setContactForm(p => ({ ...p, address: e.target.value }))} placeholder="Address" className="h-8 text-sm" />}
      </div>
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={cancelContactEdit} className="h-7 text-xs">Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={contactSaving} className="h-7 text-xs">{contactSaving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  )

  // ---- Notes (auto-save) ----
  const [notes, setNotes] = useState(account?.notes || '')
  const notesTimer = useRef(null)
  useEffect(() => { setNotes(account?.notes || '') }, [account?.notes])
  const handleNotesChange = (value) => {
    setNotes(value)
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => { updateAccount(accountId, { notes: value }) }, 800)
  }

  // ---- Todo Dialog ----
  const [todoDialogOpen, setTodoDialogOpen] = useState(false)
  const [editingTodoId, setEditingTodoId] = useState(null)
  const [todoForm, setTodoForm] = useState({ title: '', note: '', company_id: '', phone: '', due_date: '' })

  const openAddTodo = () => { setEditingTodoId(null); setTodoForm({ title: '', note: '', company_id: '', phone: '', due_date: '' }); setTodoDialogOpen(true) }
  const openEditTodo = (todo) => {
    setEditingTodoId(todo.id)
    setTodoForm({ title: todo.title, note: todo.note || '', company_id: todo.company_id ? String(todo.company_id) : '', phone: todo.phone || '', due_date: todo.due_date || '' })
    setTodoDialogOpen(true)
  }
  const handleSaveTodo = async (e) => {
    e.preventDefault()
    const data = { title: todoForm.title, note: todoForm.note, client_id: accountId, company_id: todoForm.company_id ? parseInt(todoForm.company_id) : null, phone: todoForm.phone, due_date: todoForm.due_date || null }
    if (editingTodoId) { await updateTodo(editingTodoId, data) } else { await addTodo(data) }
    setTodoDialogOpen(false)
  }

  const today = new Date().toISOString().split('T')[0]
  const isOverdue = (todo) => !todo.completed && todo.due_date && todo.due_date < today
  const fmtDueDate = (d) => { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return isNaN(dt) ? d : `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}` }

  // ---- Reporting ----
  const accountOrders = useMemo(() => orders.filter((o) => o.client_id === accountId && !EXCLUDED_STAGES.includes(o.stage)), [orders, accountId])
  const accountOrderIds = useMemo(() => new Set(accountOrders.map((o) => o.id)), [accountOrders])
  const accountCommissions = useMemo(() => commissions.filter((c) => accountOrderIds.has(c.order_id)), [commissions, accountOrderIds])
  const totalOrders = accountOrders.length
  const totalRevenue = accountOrders.reduce((s, o) => s + (o.total || 0), 0)
  const totalCommission = accountCommissions.reduce((s, c) => s + (c.commission_due || 0), 0)

  const seasonMap = useMemo(() => Object.fromEntries(seasons.map((s) => [s.id, s])), [seasons])
  const companyMap = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c])), [companies])

  const byCycle = useMemo(() => {
    const m = {}
    for (const o of accountOrders) { const s = seasonMap[o.season_id]; const cy = s ? deriveCycle(s) : 'Unknown'; if (!m[cy]) m[cy] = { orders: 0, revenue: 0, commission: 0 }; m[cy].orders++; m[cy].revenue += o.total || 0 }
    for (const c of accountCommissions) { const o = orders.find((x) => x.id === c.order_id); const s = o ? seasonMap[o.season_id] : null; const cy = s ? deriveCycle(s) : 'Unknown'; if (m[cy]) m[cy].commission += c.commission_due || 0 }
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0]))
  }, [accountOrders, accountCommissions, seasonMap, orders])

  const byBrand = useMemo(() => {
    const m = {}
    for (const o of accountOrders) { const b = companyMap[o.company_id]?.name || 'Unknown'; if (!m[b]) m[b] = { orders: 0, revenue: 0, commission: 0 }; m[b].orders++; m[b].revenue += o.total || 0 }
    for (const c of accountCommissions) { const o = orders.find((x) => x.id === c.order_id); const b = o ? companyMap[o.company_id]?.name || 'Unknown' : 'Unknown'; if (m[b]) m[b].commission += c.commission_due || 0 }
    return Object.entries(m).sort((a, b) => b[1].revenue - a[1].revenue)
  }, [accountOrders, accountCommissions, companyMap, orders])

  if (!canView) return <Navigate to="/app/accounts" replace />

  if (!account) {
    return (
      <div className="px-6 py-4">
        <p className="text-muted-foreground">Account not found.</p>
        <Link to="/app/accounts" className="text-[#005b5b] hover:underline mt-2 inline-block">Back to Accounts</Link>
      </div>
    )
  }

  const websiteHref = account.website ? (account.website.startsWith('http') ? account.website : `https://${account.website}`) : null

  return (
    <div className="px-6 py-4 space-y-6">
      <Link to="/app/accounts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Accounts
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="relative group/logo">
          {logoUrl ? (
            <div className="w-16 h-16 rounded-xl bg-white border flex items-center justify-center p-1 shrink-0 cursor-pointer" onClick={() => logoInputRef.current?.click()}>
              <img src={logoUrl} alt="" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-dashed border-zinc-300 dark:border-zinc-600 flex items-center justify-center cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shrink-0" onClick={() => logoInputRef.current?.click()}>
              <Upload className="size-5 text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover/logo:opacity-100 flex items-center justify-center cursor-pointer transition-opacity" onClick={() => logoInputRef.current?.click()}>
            <Pencil className="size-4 text-white" />
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{account.name}</h1>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openEdit} title="Edit account">
              <Pencil className="size-3.5 text-muted-foreground" />
            </Button>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5 flex-wrap">
            {account.region && <span>{account.region}</span>}
            {account.type && <span>{account.type}</span>}
            {(account.city || account.state) && <span>{[account.city, account.state].filter(Boolean).join(', ')}</span>}
            {account.account_number && <span>#{account.account_number}</span>}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm">
            {websiteHref && (
              <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#005b5b] dark:text-[#00b3b3] hover:underline">
                <Globe className="size-3.5" />{account.website}
              </a>
            )}
            {account.phone && (
              <span className="flex items-center gap-1 text-muted-foreground"><PhoneIcon className="size-3.5" />{account.phone}</span>
            )}
          </div>
        </div>
      </div>

      {/* Contacts + Todos row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contacts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle className="text-base">Contacts</CardTitle>
              <Button variant="outline" size="sm" onClick={startAddContact}>
                <Plus className="size-3 mr-1" /> Add Contact
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {pc.name && editingContact !== 'primary' && (
              <div className="border rounded-lg p-3 bg-zinc-50 dark:bg-zinc-800/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Primary Contact</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startEditPrimary}>
                    <Pencil className="size-3 text-muted-foreground" />
                  </Button>
                </div>
                <div className="font-medium">
                  {pc.name}
                  {pc.role && <span className="text-muted-foreground text-sm font-normal ml-1">({pc.role})</span>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                  {pc.phone && <span className="flex items-center gap-1"><PhoneIcon className="size-3" />{pc.phone}{pc.extension && <span className="text-xs">ext. {pc.extension}</span>}</span>}
                  {pc.email && <span className="flex items-center gap-1"><Mail className="size-3" />{pc.email}</span>}
                  {pc.address && <span className="flex items-center gap-1"><MapPin className="size-3" />{pc.address}</span>}
                </div>
              </div>
            )}
            {editingContact === 'primary' && renderContactForm('Edit Primary Contact', true, savePrimaryContact)}

            {additionalContacts.map((c, i) => (
              editingContact === i ? (
                <div key={i}>{renderContactForm('Edit Contact', false, () => saveAdditionalContact(i))}</div>
              ) : (
                <div key={i} className="flex items-center gap-3 text-sm border rounded-lg px-3 py-2.5">
                  <User className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{c.name}</span>
                    {c.role && <span className="text-muted-foreground ml-1 text-xs">({c.role})</span>}
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      {c.phone && <span>{c.phone}{c.extension && <span> ext. {c.extension}</span>}</span>}
                      {c.email && <span className="truncate">{c.email}</span>}
                    </div>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditAdditional(i)}>
                      <Pencil className="size-3 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteAdditionalContact(i)}>
                      <Trash2 className="size-3 text-red-500" />
                    </Button>
                  </div>
                </div>
              )
            ))}

            {addingContact && renderContactForm(!pc.name ? 'Add Primary Contact' : 'Add Contact', !pc.name, saveNewContact)}

            {!pc.name && additionalContacts.length === 0 && !addingContact && (
              <p className="text-sm text-muted-foreground">No contacts yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Todos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle className="text-base">To Dos</CardTitle>
              <Button variant="outline" size="sm" onClick={openAddTodo}>
                <Plus className="size-3 mr-1" /> Add To Do
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {accountTodos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No to dos for this account.</p>
            ) : (
              <div className="border dark:border-zinc-700 rounded-xl overflow-hidden">
                <div className="divide-y dark:divide-zinc-700">
                  {accountTodos.map((todo) => (
                    <div key={todo.id} className="flex items-start gap-2 px-3 py-2.5 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                      <input type="checkbox" checked={todo.completed} onChange={() => toggleComplete(todo.id)} className="mt-1 accent-[#005b5b]" />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm ${todo.completed ? 'line-through text-muted-foreground' : ''}`}>{todo.title}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          {todo.company_id && companyMap[todo.company_id] && <span>{companyMap[todo.company_id].name}</span>}
                          {todo.due_date && <span className={isOverdue(todo) ? 'text-red-500 font-medium' : ''}>{fmtDueDate(todo.due_date)}</span>}
                          {todo.note && <span className="truncate max-w-[200px]">{todo.note}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => togglePin(todo.id)}>
                          {todo.pinned ? <PinOff className="size-3.5 text-amber-500" /> : <Pin className="size-3.5 text-muted-foreground" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTodo(todo)}>
                          <Pencil className="size-3.5 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteTodo(todo.id)}>
                          <Trash2 className="size-3.5 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes + Order History row — full width */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Add notes about this account..."
              className="w-full min-h-[180px] rounded-lg border bg-amber-50 dark:bg-zinc-800/50 p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#005b5b]/30 dark:border-zinc-700"
            />
          </CardContent>
        </Card>

        {/* Order History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border">
                <div className="text-2xl font-bold">{totalOrders}</div>
                <div className="text-xs text-muted-foreground">Orders</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border">
                <div className="text-2xl font-bold text-[#005b5b] dark:text-[#00b3b3]">{fmt(totalRevenue)}</div>
                <div className="text-xs text-muted-foreground">Revenue</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border">
                <div className="text-2xl font-bold text-emerald-600">{fmt(totalCommission)}</div>
                <div className="text-xs text-muted-foreground">Commission</div>
              </div>
            </div>

            {byCycle.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">By Cycle</h3>
                <div className="border rounded-lg overflow-hidden dark:border-zinc-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-800/50 text-muted-foreground text-xs">
                        <th className="text-left px-3 py-2 font-medium">Cycle</th>
                        <th className="text-right px-3 py-2 font-medium">#</th>
                        <th className="text-right px-3 py-2 font-medium">Revenue</th>
                        <th className="text-right px-3 py-2 font-medium">Commission</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-zinc-700">
                      {byCycle.map(([cy, d]) => (
                        <tr key={cy}>
                          <td className="px-3 py-2 font-medium">{cy}</td>
                          <td className="px-3 py-2 text-right">{d.orders}</td>
                          <td className="px-3 py-2 text-right">{fmt(d.revenue)}</td>
                          <td className="px-3 py-2 text-right text-emerald-600">{fmt(d.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {byBrand.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">By Brand</h3>
                <div className="border rounded-lg overflow-hidden dark:border-zinc-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-800/50 text-muted-foreground text-xs">
                        <th className="text-left px-3 py-2 font-medium">Brand</th>
                        <th className="text-right px-3 py-2 font-medium">#</th>
                        <th className="text-right px-3 py-2 font-medium">Revenue</th>
                        <th className="text-right px-3 py-2 font-medium">Commission</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-zinc-700">
                      {byBrand.map(([b, d]) => (
                        <tr key={b}>
                          <td className="px-3 py-2 font-medium">{b}</td>
                          <td className="px-3 py-2 text-right">{d.orders}</td>
                          <td className="px-3 py-2 text-right">{fmt(d.revenue)}</td>
                          <td className="px-3 py-2 text-right text-emerald-600">{fmt(d.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {totalOrders === 0 && <p className="text-sm text-muted-foreground">No orders yet.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Edit Account Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) setEditOpen(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>Update account details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input value={form.name} onChange={(e) => handleFormChange('name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Account #</Label>
              <Input value={form.account_number} onChange={(e) => handleFormChange('account_number', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={form.website} onChange={(e) => handleFormChange('website', e.target.value)} placeholder="example.com" />
            </div>
            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-2">
                <div className="relative shrink-0">
                  <button type="button" onClick={() => editFileRef.current?.click()} className="w-9 h-9 rounded border border-dashed border-zinc-300 dark:border-zinc-600 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors overflow-hidden">
                    {editCurrentLogo ? <img src={editCurrentLogo} alt="" className="w-full h-full object-contain" /> : <Upload className="size-3.5 text-muted-foreground" />}
                  </button>
                  {editCurrentLogo && (
                    <button onClick={removeEditLogo} className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center">
                      <X className="size-2 text-white" />
                    </button>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {editLogoPreview ? 'Click to change' : editAutoLogo ? 'Auto-detected from website' : 'Enter website to auto-detect'}
                </span>
              </div>
              <input ref={editFileRef} type="file" accept="image/*" onChange={handleEditLogoUpload} className="hidden" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => handleFormChange('phone', e.target.value)} placeholder="(555) 123-4567" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Region</Label><Input value={form.region} onChange={(e) => handleFormChange('region', e.target.value)} /></div>
              <div className="space-y-2"><Label>Type</Label><Input value={form.type} onChange={(e) => handleFormChange('type', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>City</Label><Input value={form.city} onChange={(e) => handleFormChange('city', e.target.value)} /></div>
              <div className="space-y-2"><Label>State</Label><Input value={form.state} onChange={(e) => handleFormChange('state', e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Todo Dialog */}
      <Dialog open={todoDialogOpen} onOpenChange={setTodoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTodoId ? 'Edit To Do' : 'Add To Do'}</DialogTitle>
            <DialogDescription>{editingTodoId ? 'Update to do details.' : 'Add a to do for this account.'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveTodo} className="space-y-4">
            <div className="space-y-2"><Label>Title</Label><Input value={todoForm.title} onChange={(e) => setTodoForm((p) => ({ ...p, title: e.target.value }))} required /></div>
            <div className="space-y-2"><Label>Note</Label><textarea value={todoForm.note} onChange={(e) => setTodoForm((p) => ({ ...p, note: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px] resize-y dark:bg-zinc-800 dark:border-zinc-700" /></div>
            <div className="space-y-2">
              <Label>Brand</Label>
              <select value={todoForm.company_id} onChange={(e) => setTodoForm((p) => ({ ...p, company_id: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm dark:bg-zinc-800 dark:border-zinc-700">
                <option value="">No brand</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Phone</Label><Input value={todoForm.phone} onChange={(e) => setTodoForm((p) => ({ ...p, phone: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={todoForm.due_date} onChange={(e) => setTodoForm((p) => ({ ...p, due_date: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!todoForm.title.trim()}>{editingTodoId ? 'Save Changes' : 'Add To Do'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AccountDetail
