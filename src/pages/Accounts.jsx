import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Upload, Trash2, Pencil, Globe, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import { useAccounts } from '@/context/AccountContext'
import { useAuth } from '@/context/AuthContext'
import { uploadLogo } from '@/lib/db'
import ImportAccountsModal from '@/components/ImportAccountsModal'

const extractDomain = (url) => {
  if (!url) return null
  let domain = url.trim().toLowerCase()
  domain = domain.replace(/^https?:\/\//, '')
  domain = domain.replace(/^www\./, '')
  domain = domain.split('/')[0]
  if (!domain.includes('.')) return null
  return domain
}

function Accounts() {
  const { user, userRole } = useAuth()
  const { accounts, addAccount, updateAccount, removeAccount } = useAccounts()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [autoLogo, setAutoLogo] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [logoFile, setLogoFile] = useState(null)
  const fileInputRef = useRef(null)
  const canViewDetail = userRole === 'master_admin' || userRole === 'pro_rep'

  const emptyForm = {
    name: '', account_number: '', region: '', type: '', city: '', state: '',
    website: '', phone: '', logo_path: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const filteredAccounts = accounts.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // Auto-detect logo from website
  useEffect(() => {
    if (logoPreview || logoFile) return // manual upload takes priority
    const domain = extractDomain(form.website)
    if (!domain) { setAutoLogo(null); return }
    const clearbitUrl = `https://logo.clearbit.com/${domain}`
    const img = new Image()
    img.onload = () => setAutoLogo(clearbitUrl)
    img.onerror = () => setAutoLogo(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`)
    img.src = clearbitUrl
  }, [form.website, logoPreview, logoFile])

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => { setLogoPreview(ev.target.result) }
    reader.readAsDataURL(file)
  }

  const removeLogo = () => {
    setLogoPreview(null)
    setLogoFile(null)
    setAutoLogo(null)
    setForm((prev) => ({ ...prev, logo_path: '' }))
  }

  const openEdit = (account) => {
    setEditingId(account.id)
    setForm({
      name: account.name || '',
      account_number: account.account_number || '',
      region: account.region || '',
      type: account.type || '',
      city: account.city || '',
      state: account.state || '',
      website: account.website || '',
      phone: account.phone || '',
      logo_path: account.logo_path || '',
    })
    setLogoPreview(null)
    setLogoFile(null)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      let logoPath = form.logo_path
      if (logoFile) {
        const accountId = editingId || 'new'
        logoPath = await uploadLogo(user.id, accountId, logoFile)
      }
      if (!logoPath && autoLogo) {
        logoPath = autoLogo
      }

      const data = { ...form, logo_path: logoPath }
      if (editingId) {
        await updateAccount(editingId, data)
      } else {
        await addAccount(data)
      }
      setForm(emptyForm)
      setEditingId(null)
      setLogoPreview(null)
      setLogoFile(null)
      setAutoLogo(null)
      setDialogOpen(false)
    } catch (err) {
      console.error('Failed to save account:', err)
      alert('Failed to save account: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const resetDialog = () => {
    setEditingId(null)
    setForm(emptyForm)
    setAutoLogo(null)
    setLogoPreview(null)
    setLogoFile(null)
  }

  const currentLogo = logoPreview || autoLogo || form.logo_path

  return (
    <div className="px-6 py-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <div className="flex items-center gap-2">
          <Button data-tour="import-csv" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4 mr-1" />
            Import Accounts
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetDialog() }}>
            <DialogTrigger asChild>
              <Button data-tour="add-account">Add Account</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Account' : 'Add Account'}</DialogTitle>
                <DialogDescription>{editingId ? 'Update account details.' : 'Add a new account.'}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Account Name</Label>
                  <Input id="name" value={form.name} onChange={(e) => handleFormChange('name', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account #</Label>
                  <Input id="accountNumber" value={form.account_number} onChange={(e) => handleFormChange('account_number', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" value={form.website} onChange={(e) => handleFormChange('website', e.target.value)} placeholder="example.com" />
                </div>

                {/* Logo */}
                <div className="space-y-2">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-2">
                    <div className="relative shrink-0">
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="w-9 h-9 rounded border border-dashed border-zinc-300 dark:border-zinc-600 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors overflow-hidden">
                        {currentLogo ? (
                          <img src={currentLogo} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <Upload className="size-3.5 text-muted-foreground" />
                        )}
                      </button>
                      {currentLogo && (
                        <button onClick={removeLogo} className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center">
                          <X className="size-2 text-white" />
                        </button>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {logoPreview ? 'Click to change' : autoLogo ? 'Auto-detected from website' : 'Enter website to auto-detect'}
                    </span>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => handleFormChange('phone', e.target.value)} placeholder="(555) 123-4567" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="region">Region</Label>
                    <Input id="region" value={form.region} onChange={(e) => handleFormChange('region', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Input id="type" value={form.type} onChange={(e) => handleFormChange('type', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" value={form.city} onChange={(e) => handleFormChange('city', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" value={form.state} onChange={(e) => handleFormChange('state', e.target.value)} />
                  </div>
                </div>

                <DialogFooter>
                  <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                    {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Account'}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Input
        placeholder="Search accounts..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Account Name</TableHead>
            <TableHead>Account #</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>City</TableHead>
            <TableHead>State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredAccounts.map((account) => {
            const hasWebsite = !!account.website
            const hasContact = account.primary_contact?.name
            const logo = account.logo_path
            return (
              <TableRow key={account.id} className="group">
                <TableCell className="w-10">
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(account)} title="Edit">
                      <Pencil className="size-3.5 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmDeleteId(account.id)} title="Delete">
                      <Trash2 className="size-3.5 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {logo && (
                      <img src={logo} alt="" className="w-5 h-5 rounded object-contain shrink-0" />
                    )}
                    {canViewDetail ? (
                      <Link to={`/app/accounts/${account.id}`} className="text-[#005b5b] hover:underline dark:text-[#00b3b3]">
                        {account.name}
                      </Link>
                    ) : (
                      <span>{account.name}</span>
                    )}
                    {hasWebsite && <Globe className="size-3 text-muted-foreground" title="Has website" />}
                    {hasContact && <User className="size-3 text-muted-foreground" title="Has contact" />}
                  </div>
                </TableCell>
                <TableCell>{account.account_number}</TableCell>
                <TableCell>{account.region}</TableCell>
                <TableCell>{account.type}</TableCell>
                <TableCell>{account.city}</TableCell>
                <TableCell>{account.state}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this account? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await removeAccount(confirmDeleteId)
                setConfirmDeleteId(null)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportAccountsModal open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}

export default Accounts
