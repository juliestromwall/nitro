import { useState } from 'react'
import { Upload, Trash2, Pencil } from 'lucide-react'
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
import ImportAccountsModal from '@/components/ImportAccountsModal'

function Accounts() {
  const { accounts, addAccount, updateAccount, removeAccount } = useAccounts()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const emptyForm = { name: '', account_number: '', region: '', type: '', city: '', state: '' }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const filteredAccounts = accounts.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
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
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        await updateAccount(editingId, form)
      } else {
        await addAccount(form)
      }
      setForm(emptyForm)
      setEditingId(null)
      setDialogOpen(false)
    } catch (err) {
      console.error('Failed to save account:', err)
      alert('Failed to save account: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }


  return (
    <div className="px-6 py-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <div className="flex items-center gap-2">
          <Button data-tour="import-csv" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4 mr-1" />
            Import Accounts
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) { setEditingId(null); setForm(emptyForm) }
          }}>
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
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account #</Label>
                  <Input
                    id="accountNumber"
                    value={form.account_number}
                    onChange={(e) => handleFormChange('account_number', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="region">Region</Label>
                    <Input
                      id="region"
                      value={form.region}
                      onChange={(e) => handleFormChange('region', e.target.value)}
                      placeholder=""
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Territory</Label>
                    <Input
                      id="type"
                      value={form.type}
                      onChange={(e) => handleFormChange('type', e.target.value)}
                      placeholder=""
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={form.city}
                      onChange={(e) => handleFormChange('city', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={form.state}
                      onChange={(e) => handleFormChange('state', e.target.value)}
                    />
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
          {filteredAccounts.map((account) => (
            <TableRow key={account.id} className="group">
              <TableCell className="w-10">
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEdit(account)}
                    title="Edit"
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setConfirmDeleteId(account.id)}
                    title="Delete"
                  >
                    <Trash2 className="size-3.5 text-red-500" />
                  </Button>
                </div>
              </TableCell>
              <TableCell className="font-medium">{account.name}</TableCell>
              <TableCell>{account.account_number}</TableCell>
              <TableCell>{account.region}</TableCell>
              <TableCell>{account.type}</TableCell>
              <TableCell>{account.city}</TableCell>
              <TableCell>{account.state}</TableCell>
            </TableRow>
          ))}
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
