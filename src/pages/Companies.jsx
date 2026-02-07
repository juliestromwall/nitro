import { useState } from 'react'
import { Pencil, Archive, ArchiveRestore } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { orders } from '@/data/mockData'
import { useCompanies } from '@/context/CompanyContext'

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)

const currentYear = new Date().getFullYear()

function getCompanyStats(companyId) {
  const companyOrders = orders.filter((o) => o.companyId === companyId)
  const allTimeSales = companyOrders.reduce((sum, o) => sum + o.total, 0)

  const ytdOrders = companyOrders.filter((o) => {
    const parts = o.closeDate.split('/')
    const year = parseInt(parts[2])
    return year === currentYear
  })
  const ytdSales = ytdOrders.reduce((sum, o) => sum + o.total, 0)

  return { ytdSales, allTimeSales }
}

function Companies() {
  const { companies, addCompany, updateCompany, toggleArchive } = useCompanies()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', commissionPercent: '' })

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const openAdd = () => {
    setEditingId(null)
    setForm({ name: '', commissionPercent: '' })
    setDialogOpen(true)
  }

  const openEdit = (company) => {
    setEditingId(company.id)
    setForm({ name: company.name, commissionPercent: String(company.commissionPercent) })
    setDialogOpen(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = {
      name: form.name,
      commissionPercent: parseFloat(form.commissionPercent),
    }

    if (editingId) {
      updateCompany(editingId, data)
    } else {
      addCompany(data)
    }

    setForm({ name: '', commissionPercent: '' })
    setEditingId(null)
    setDialogOpen(false)
  }

  const active = companies.filter((c) => !c.archived)
  const archived = companies.filter((c) => c.archived)

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Companies</h1>
        <Button onClick={openAdd}>Add Company</Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Company' : 'Add Company'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update the company details.' : 'Add a company you earn commission from.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={form.name}
                onChange={(e) => handleFormChange('name', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commissionPercent">Commission %</Label>
              <Input
                id="commissionPercent"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.commissionPercent}
                onChange={(e) => handleFormChange('commissionPercent', e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit">{editingId ? 'Save Changes' : 'Add Company'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">Logo</TableHead>
            <TableHead>Company Name</TableHead>
            <TableHead className="text-right">Commission %</TableHead>
            <TableHead className="text-right">YTD Sales</TableHead>
            <TableHead className="text-right">All Time Sales</TableHead>
            <TableHead className="w-24"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {active.map((company) => {
            const { ytdSales, allTimeSales } = getCompanyStats(company.id)
            return (
              <TableRow key={company.id}>
                <TableCell>
                  {company.logo ? (
                    <img src={company.logo} alt="" className="w-8 h-8 object-contain" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-zinc-200 flex items-center justify-center text-zinc-600 text-sm font-bold">
                      {company.name.charAt(0)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium">{company.name}</TableCell>
                <TableCell className="text-right">{company.commissionPercent}%</TableCell>
                <TableCell className="text-right">{fmt(ytdSales)}</TableCell>
                <TableCell className="text-right">{fmt(allTimeSales)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(company)}
                      title="Edit company"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleArchive(company.id)}
                      title="Archive company"
                    >
                      <Archive className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {archived.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-muted-foreground">Archived</h2>
          <Table>
            <TableBody>
              {archived.map((company) => {
                const { ytdSales, allTimeSales } = getCompanyStats(company.id)
                return (
                  <TableRow key={company.id} className="opacity-60">
                    <TableCell>
                      <div className="w-8 h-8 rounded bg-zinc-100 flex items-center justify-center text-zinc-400 text-sm font-bold">
                        {company.name.charAt(0)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {company.name}
                      <Badge variant="secondary" className="ml-2">Archived</Badge>
                    </TableCell>
                    <TableCell className="text-right">{company.commissionPercent}%</TableCell>
                    <TableCell className="text-right">{fmt(ytdSales)}</TableCell>
                    <TableCell className="text-right">{fmt(allTimeSales)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleArchive(company.id)}
                        title="Restore company"
                      >
                        <ArchiveRestore className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  )
}

export default Companies
