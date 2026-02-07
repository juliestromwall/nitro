import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { companies as initialCompanies, orders } from '@/data/mockData'

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
  const [companyList, setCompanyList] = useState(initialCompanies)
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
      setCompanyList((prev) =>
        prev.map((c) => (c.id === editingId ? { ...c, ...data } : c))
      )
    } else {
      const newCompany = {
        id: Math.max(...companyList.map((c) => c.id), 0) + 1,
        ...data,
      }
      setCompanyList((prev) => [...prev, newCompany])
    }

    setForm({ name: '', commissionPercent: '' })
    setEditingId(null)
    setDialogOpen(false)
  }

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
            <TableHead>Company Name</TableHead>
            <TableHead className="text-right">Commission %</TableHead>
            <TableHead className="text-right">YTD Sales</TableHead>
            <TableHead className="text-right">All Time Sales</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companyList.map((company) => {
            const { ytdSales, allTimeSales } = getCompanyStats(company.id)
            return (
              <TableRow key={company.id}>
                <TableCell className="font-medium">{company.name}</TableCell>
                <TableCell className="text-right">{company.commissionPercent}%</TableCell>
                <TableCell className="text-right">{fmt(ytdSales)}</TableCell>
                <TableCell className="text-right">{fmt(allTimeSales)}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(company)}
                    title="Edit company"
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export default Companies
