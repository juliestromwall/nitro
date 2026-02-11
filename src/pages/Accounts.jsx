import { useState, useRef } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAccounts } from '@/context/AccountContext'
import { regions, accountTypes } from '@/lib/constants'
import { parseCSVLine } from '@/lib/csv'

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, ''))

  const map = {}
  headers.forEach((h, i) => {
    if (['account_name', 'account name', 'name'].includes(h)) map.name = i
    else if (['account_number', 'account number', 'account #', 'account#'].includes(h)) map.account_number = i
    else if (h === 'region') map.region = i
    else if (h === 'type') map.type = i
    else if (h === 'city') map.city = i
    else if (h === 'state') map.state = i
  })

  if (map.name === undefined) return []

  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line)
    return {
      name: cols[map.name] || '',
      account_number: map.account_number !== undefined ? cols[map.account_number] || '' : '',
      region: map.region !== undefined ? cols[map.region] || '' : '',
      type: map.type !== undefined ? cols[map.type] || '' : '',
      city: map.city !== undefined ? cols[map.city] || '' : '',
      state: map.state !== undefined ? cols[map.state] || '' : '',
    }
  }).filter((r) => r.name)
}

function Accounts() {
  const { accounts, addAccount, addAccounts } = useAccounts()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)
  const [form, setForm] = useState({
    name: '',
    account_number: '',
    region: '',
    type: '',
    city: '',
    state: '',
  })

  const filteredAccounts = accounts.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    await addAccount(form)
    setForm({ name: '', account_number: '', region: '', type: '', city: '', state: '' })
    setDialogOpen(false)
  }

  const handleCSVImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const rows = parseCSV(text)
      if (rows.length === 0) {
        alert('No valid rows found. Make sure your CSV has an "account_name" column header.')
        return
      }
      await addAccounts(rows)
      alert(`Successfully imported ${rows.length} account${rows.length === 1 ? '' : 's'}.`)
    } catch (err) {
      console.error('CSV import failed:', err)
      alert('Import failed. Please check the file format.')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCSVImport}
            className="hidden"
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="size-4 mr-1" />
            {importing ? 'Importing...' : 'Import CSV'}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>Add Account</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Account</DialogTitle>
                <DialogDescription>Add a new account.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Account Name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account #</Label>
                  <Input
                    id="accountNumber"
                    value={form.account_number}
                    onChange={(e) => handleFormChange('account_number', e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Region</Label>
                    <Select value={form.region} onValueChange={(v) => handleFormChange('region', v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                      <SelectContent>
                        {regions.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => handleFormChange('type', v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {accountTypes.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  <Button type="submit">Save Account</Button>
                </DialogFooter>
              </form>
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
            <TableRow key={account.id}>
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
    </div>
  )
}

export default Accounts
