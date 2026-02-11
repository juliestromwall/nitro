import { useState, useRef } from 'react'
import { Pencil, Archive, ArchiveRestore, GripVertical, Upload, X, Plus } from 'lucide-react'
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
import { useCompanies } from '@/context/CompanyContext'
import { useSales } from '@/context/SalesContext'
import { useAuth } from '@/context/AuthContext'
import { uploadLogo } from '@/lib/db'

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)

const currentYear = new Date().getFullYear()

function Companies() {
  const { user } = useAuth()
  const { companies, addCompany, updateCompany, toggleArchive, reorderCompanies } = useCompanies()
  const { orders } = useSales()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', commission_percent: '', logo_path: null, order_types: [], items: [], stages: [] })
  const [logoPreview, setLogoPreview] = useState(null)
  const [logoFile, setLogoFile] = useState(null)
  const fileInputRef = useRef(null)
  const [newOrderType, setNewOrderType] = useState('')
  const [newStage, setNewStage] = useState('')
  const [newItem, setNewItem] = useState('')
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  function getCompanyStats(companyId) {
    const companyOrders = orders.filter((o) => o.company_id === companyId)
    const allTimeSales = companyOrders.reduce((sum, o) => sum + (o.total || 0), 0)

    const ytdOrders = companyOrders.filter((o) => {
      if (!o.close_date) return false
      const parts = o.close_date.split('/')
      const year = parseInt(parts[2] || parts[0])
      return year === currentYear
    })
    const ytdSales = ytdOrders.reduce((sum, o) => sum + (o.total || 0), 0)

    return { ytdSales, allTimeSales }
  }

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setLogoPreview(ev.target.result)
    }
    reader.readAsDataURL(file)
  }

  const removeLogo = () => {
    setForm((prev) => ({ ...prev, logo_path: null }))
    setLogoPreview(null)
    setLogoFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openAdd = () => {
    setEditingId(null)
    setForm({ name: '', commission_percent: '', logo_path: null, order_types: [], items: [], stages: [] })
    setLogoPreview(null)
    setLogoFile(null)
    setNewOrderType('')
    setNewItem('')
    setNewStage('')
    setDialogOpen(true)
  }

  const openEdit = (company) => {
    setEditingId(company.id)
    setForm({
      name: company.name,
      commission_percent: String(company.commission_percent),
      logo_path: company.logo_path,
      order_types: company.order_types || [],
      items: company.items || [],
      stages: company.stages || [],
    })
    setLogoPreview(company.logo_path)
    setLogoFile(null)
    setNewOrderType('')
    setNewItem('')
    setNewStage('')
    setDialogOpen(true)
  }

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    try {
      let logoPath = form.logo_path

      // Upload logo if a new file was selected
      if (logoFile) {
        const companyId = editingId || 'new'
        logoPath = await uploadLogo(user.id, companyId, logoFile)
      }

      const data = {
        name: form.name,
        commission_percent: parseFloat(form.commission_percent),
        logo_path: logoPath,
        order_types: form.order_types,
        items: form.items,
        stages: form.stages,
      }

      if (editingId) {
        await updateCompany(editingId, data)
      } else {
        await addCompany(data)
      }

      setForm({ name: '', commission_percent: '', logo_path: null, order_types: [], items: [], stages: [] })
      setLogoPreview(null)
      setLogoFile(null)
      setEditingId(null)
      setDialogOpen(false)
    } catch (err) {
      console.error('Failed to save company:', err)
      setSaveError(err.message || 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDragStart = (e, index) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDrop = (e, toIndex) => {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== toIndex) {
      const activeIds = active.map((c) => c.id)
      const fromFullIndex = companies.findIndex((c) => c.id === activeIds[dragIndex])
      const toFullIndex = companies.findIndex((c) => c.id === activeIds[toIndex])
      reorderCompanies(fromFullIndex, toFullIndex)
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const active = companies.filter((c) => !c.archived)
  const archived = companies.filter((c) => c.archived)

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Companies</h1>
        <Button onClick={openAdd}>Add Company</Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={() => {}}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" showCloseButton={false} onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Company' : 'Add Company'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update the company details.' : 'Add a company you earn commission from.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {logoPreview ? (
                  <div className="relative">
                    <img src={logoPreview} alt="" className="w-12 h-12 object-contain rounded border" />
                    <button
                      type="button"
                      onClick={removeLogo}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded border-2 border-dashed border-zinc-300 flex items-center justify-center text-zinc-400">
                    <Upload className="size-5" />
                  </div>
                )}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {logoPreview ? 'Change' : 'Upload'}
                  </Button>
                </div>
              </div>
            </div>
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
                value={form.commission_percent}
                onChange={(e) => handleFormChange('commission_percent', e.target.value)}
                required
              />
            </div>

            {/* Order Types */}
            <div className="space-y-2">
              <Label>Order Types</Label>
              {form.order_types.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.order_types.map((t, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 text-sm">
                      {t}
                      <button type="button" onClick={() => setForm((p) => ({ ...p, order_types: p.order_types.filter((_, j) => j !== i) }))} className="ml-0.5 hover:text-red-500">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Rental, Retail, Demo"
                  value={newOrderType}
                  onChange={(e) => setNewOrderType(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newOrderType.trim(); if (v && !form.order_types.includes(v)) { setForm((p) => ({ ...p, order_types: [...p.order_types, v] })); setNewOrderType('') } } }}
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => { const v = newOrderType.trim(); if (v && !form.order_types.includes(v)) { setForm((p) => ({ ...p, order_types: [...p.order_types, v] })); setNewOrderType('') } }} disabled={!newOrderType.trim()}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <Label>Items</Label>
              {form.items.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.items.map((t, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 text-sm">
                      {t}
                      <button type="button" onClick={() => setForm((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }))} className="ml-0.5 hover:text-red-500">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Upgraded Boards, Boots, Bindings"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newItem.trim(); if (v && !form.items.includes(v)) { setForm((p) => ({ ...p, items: [...p.items, v] })); setNewItem('') } } }}
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => { const v = newItem.trim(); if (v && !form.items.includes(v)) { setForm((p) => ({ ...p, items: [...p.items, v] })); setNewItem('') } }} disabled={!newItem.trim()}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            {/* Stages */}
            <div className="space-y-2">
              <Label>Stages</Label>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-sm bg-zinc-100">Order Placed</Badge>
                <Badge variant="outline" className="text-sm bg-zinc-100">Cancelled</Badge>
                {form.stages.filter((s) => s !== 'Order Placed' && s !== 'Cancelled').map((t, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 text-sm">
                    {t}
                    <button type="button" onClick={() => setForm((p) => ({ ...p, stages: p.stages.filter((s) => s !== t) }))} className="ml-0.5 hover:text-red-500">
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add custom stage..."
                  value={newStage}
                  onChange={(e) => setNewStage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newStage.trim(); if (v && !form.stages.includes(v) && v !== 'Order Placed' && v !== 'Cancelled') { setForm((p) => ({ ...p, stages: [...p.stages, v] })); setNewStage('') } } }}
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => { const v = newStage.trim(); if (v && !form.stages.includes(v) && v !== 'Order Placed' && v !== 'Cancelled') { setForm((p) => ({ ...p, stages: [...p.stages, v] })); setNewStage('') } }} disabled={!newStage.trim()}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            {saveError && (
              <p className="text-sm text-red-600">{saveError}</p>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setSaveError(null) }}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Company'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead className="w-14">Logo</TableHead>
            <TableHead>Company Name</TableHead>
            <TableHead className="text-right">Commission %</TableHead>
            <TableHead className="text-right">YTD Sales</TableHead>
            <TableHead className="text-right">All Time Sales</TableHead>
            <TableHead className="w-24"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {active.map((company, index) => {
            const { ytdSales, allTimeSales } = getCompanyStats(company.id)
            return (
              <TableRow
                key={company.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`${
                  dragOverIndex === index && dragIndex !== index ? 'border-t-2 border-t-blue-500' : ''
                } ${dragIndex === index ? 'opacity-40' : ''}`}
              >
                <TableCell className="cursor-grab active:cursor-grabbing">
                  <GripVertical className="size-4 text-muted-foreground" />
                </TableCell>
                <TableCell>
                  {company.logo_path ? (
                    <img src={company.logo_path} alt="" className="w-8 h-8 object-contain" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-zinc-200 flex items-center justify-center text-zinc-600 text-sm font-bold">
                      {company.name.charAt(0)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium">{company.name}</TableCell>
                <TableCell className="text-right">{company.commission_percent}%</TableCell>
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
                    <TableCell className="w-10"></TableCell>
                    <TableCell>
                      <div className="w-8 h-8 rounded bg-zinc-100 flex items-center justify-center text-zinc-400 text-sm font-bold">
                        {company.name.charAt(0)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {company.name}
                      <Badge variant="secondary" className="ml-2">Archived</Badge>
                    </TableCell>
                    <TableCell className="text-right">{company.commission_percent}%</TableCell>
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
