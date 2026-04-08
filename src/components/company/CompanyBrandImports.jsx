import { useState, useEffect, useMemo } from 'react'
import { FileText, CheckCircle, AlertTriangle, Clock, XCircle, ExternalLink, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useAccounts } from '@/context/AccountContext'
import { useSales } from '@/context/SalesContext'
import { fetchBrandUploads, updateBrandUpload, getDocumentUrl } from '@/lib/db'

const fmt = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

function CompanyBrandImports({ companyId }) {
  const { accounts } = useAccounts()
  const { orders, getSeasonsForCompany, addOrder, updateOrder } = useSales()
  const { active: activeSeasons } = getSeasonsForCompany(companyId)

  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending') // 'pending' | 'processed'
  const [reviewUpload, setReviewUpload] = useState(null)
  const [saving, setSaving] = useState(false)

  // Review form state
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [selectedAccountName, setSelectedAccountName] = useState('')
  const [selectedSeasonId, setSelectedSeasonId] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [accountSearch, setAccountSearch] = useState('')
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const [confirmMode, setConfirmMode] = useState(false)

  useEffect(() => {
    loadUploads()
  }, [companyId])

  async function loadUploads() {
    try {
      setLoading(true)
      const data = await fetchBrandUploads(companyId)
      setUploads(data)
    } catch (err) {
      console.error('Failed to load brand uploads:', err)
    } finally {
      setLoading(false)
    }
  }

  const pendingUploads = useMemo(
    () => uploads.filter((u) => u.status === 'pending' || u.status === 'unmatched'),
    [uploads]
  )
  const processedUploads = useMemo(
    () => uploads.filter((u) => ['matched', 'created', 'dismissed'].includes(u.status)),
    [uploads]
  )
  const displayUploads = filter === 'pending' ? pendingUploads : processedUploads

  // Potential matches: orders for selected account + season in this company
  const potentialMatches = useMemo(() => {
    if (!selectedAccountId || !selectedSeasonId) return []
    return orders.filter(
      (o) =>
        o.company_id === companyId &&
        o.client_id === parseInt(selectedAccountId) &&
        o.season_id === selectedSeasonId
    )
  }, [orders, companyId, selectedAccountId, selectedSeasonId])

  // Filtered accounts for searchable dropdown
  const filteredAccounts = useMemo(() => {
    if (!accountSearch) return accounts.slice(0, 50)
    const q = accountSearch.toLowerCase()
    return accounts.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 50)
  }, [accounts, accountSearch])

  function openReview(upload) {
    setReviewUpload(upload)
    const matchedId = upload.client_id ? String(upload.client_id) : ''
    const matchedName = matchedId ? (accounts.find((a) => a.id === upload.client_id)?.name || upload.metadata?.matched_account_name || '') : ''
    setSelectedAccountId(matchedId)
    setSelectedAccountName(matchedName)
    setSelectedSeasonId(upload.metadata?.season_id || activeSeasons[0]?.id || '')
    setSelectedOrderId('')
    setAccountSearch('')
    setShowAccountDropdown(false)
    setConfirmMode(false)
  }

  function closeReview() {
    setReviewUpload(null)
    setSaving(false)
    setConfirmMode(false)
  }

  async function handleViewPdf(filePath) {
    try {
      const url = await getDocumentUrl(filePath)
      window.open(url, '_blank')
    } catch (err) {
      console.error('Failed to get document URL:', err)
    }
  }

  async function handleSave() {
    if (!reviewUpload || !selectedAccountId || !selectedSeasonId) return
    setSaving(true)
    try {
      const extracted = reviewUpload.metadata?.extracted || {}
      const docEntry = { name: reviewUpload.file_name, path: reviewUpload.file_path }

      let orderId
      let newStatus

      if (selectedOrderId) {
        // Attach to existing order
        const order = orders.find((o) => o.id === parseInt(selectedOrderId))
        if (!order) return
        const invoices = Array.isArray(order.invoices) ? [...order.invoices, docEntry] : [docEntry]
        const updateData = { invoices }
        if (extracted.invoice_number) updateData.invoice_number = extracted.invoice_number
        if (extracted.amount) updateData.total = parseFloat(extracted.amount) || order.total
        await updateOrder(order.id, updateData)
        orderId = order.id
        newStatus = 'matched'
      } else {
        // Create new order
        const newOrder = await addOrder({
          client_id: parseInt(selectedAccountId),
          company_id: companyId,
          season_id: selectedSeasonId,
          order_type: 'Rental',
          stage: 'Invoiced',
          total: parseFloat(extracted.amount) || 0,
          invoice_number: extracted.invoice_number || null,
          invoices: [docEntry],
          notes: `Created from brand import on ${new Date().toLocaleDateString()}`,
        })
        orderId = newOrder.id
        newStatus = 'created'
      }

      await updateBrandUpload(reviewUpload.id, {
        status: newStatus,
        matched_order_id: orderId,
        season_id: selectedSeasonId,
        client_id: parseInt(selectedAccountId),
      })
      setUploads((prev) =>
        prev.map((u) => (u.id === reviewUpload.id ? { ...u, status: newStatus, matched_order_id: orderId } : u))
      )
      closeReview()
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDismiss() {
    if (!reviewUpload) return
    setSaving(true)
    try {
      await updateBrandUpload(reviewUpload.id, { status: 'dismissed' })
      setUploads((prev) =>
        prev.map((u) => (u.id === reviewUpload.id ? { ...u, status: 'dismissed' } : u))
      )
      closeReview()
    } catch (err) {
      console.error('Dismiss failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const extracted = reviewUpload?.metadata?.extracted || {}

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-zinc-300 border-t-[#005b5b]" />
      </div>
    )
  }

  if (uploads.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="size-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No brand imports yet</p>
        <p className="text-xs mt-1">Uploads from brand admins will appear here for review</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('pending')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            filter === 'pending'
              ? 'bg-[#005b5b] text-white'
              : 'bg-zinc-100 dark:bg-zinc-800 text-muted-foreground hover:text-foreground'
          }`}
        >
          Pending Review
          {pendingUploads.length > 0 && (
            <span className="ml-1.5 bg-white/20 text-xs px-1.5 py-0.5 rounded-full">
              {pendingUploads.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setFilter('processed')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            filter === 'processed'
              ? 'bg-[#005b5b] text-white'
              : 'bg-zinc-100 dark:bg-zinc-800 text-muted-foreground hover:text-foreground'
          }`}
        >
          Processed
          {processedUploads.length > 0 && (
            <span className="ml-1.5 text-xs opacity-60">({processedUploads.length})</span>
          )}
        </button>
      </div>

      {/* Upload cards */}
      {displayUploads.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {filter === 'pending' ? 'No pending imports' : 'No processed imports'}
        </p>
      ) : (
        <div className="space-y-2">
          {displayUploads.map((upload) => {
            const ext = upload.metadata?.extracted || {}
            const accountName = upload.metadata?.matched_account_name || ext.account_name
            return (
              <div
                key={upload.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              >
                <FileText className="size-5 text-zinc-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => handleViewPdf(upload.file_path)}
                    className="text-sm font-medium text-[#005b5b] hover:underline truncate block text-left"
                  >
                    {upload.file_name}
                  </button>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {accountName && <span>{accountName}</span>}
                    {ext.invoice_number && <span>#{ext.invoice_number}</span>}
                    {ext.amount && <span>{fmt(ext.amount)}</span>}
                    {ext.date && <span>{ext.date}</span>}
                  </div>
                </div>
                <StatusBadge status={upload.status} />
                {(upload.status === 'pending' || upload.status === 'unmatched') && (
                  <Button size="sm" variant="outline" onClick={() => openReview(upload)}>
                    Review
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={!!reviewUpload} onOpenChange={(open) => !open && closeReview()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Import</DialogTitle>
            <DialogDescription>{reviewUpload?.file_name}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* PDF link */}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => reviewUpload && handleViewPdf(reviewUpload.file_path)}
            >
              <ExternalLink className="size-4 mr-2" /> View PDF
            </Button>

            {/* Extracted data */}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground mb-1">Extracted Data</p>
              {extracted.account_name && (
                <div className="text-sm"><span className="font-medium">Account:</span> {extracted.account_name}</div>
              )}
              {extracted.invoice_number && (
                <div className="text-sm"><span className="font-medium">Invoice #:</span> {extracted.invoice_number}</div>
              )}
              {extracted.amount && (
                <div className="text-sm"><span className="font-medium">Amount:</span> {fmt(extracted.amount)}</div>
              )}
              {extracted.date && (
                <div className="text-sm"><span className="font-medium">Date:</span> {extracted.date}</div>
              )}
            </div>

            {/* Account selector */}
            <div>
              <Label className="text-sm">Account</Label>
              <div className="relative mt-1">
                {selectedAccountId ? (
                  <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700">
                    <span className="text-sm flex-1">{selectedAccountName}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAccountId('')
                        setSelectedAccountName('')
                        setSelectedOrderId('')
                        setAccountSearch('')
                      }}
                      className="text-muted-foreground hover:text-zinc-700"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search accounts..."
                      value={accountSearch}
                      onChange={(e) => {
                        setAccountSearch(e.target.value)
                        setShowAccountDropdown(true)
                      }}
                      onFocus={() => setShowAccountDropdown(true)}
                      className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 outline-none focus:border-[#005b5b]"
                    />
                    {showAccountDropdown && accountSearch && (
                      <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-zinc-800 border dark:border-zinc-700 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                        {filteredAccounts.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setSelectedAccountId(String(a.id))
                              setSelectedAccountName(a.name)
                              setAccountSearch('')
                              setShowAccountDropdown(false)
                              setSelectedOrderId('')
                            }}
                            className="block w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
                          >
                            <span className="font-medium">{a.name}</span>
                            {(a.city || a.state) && (
                              <span className="text-muted-foreground ml-2">{[a.city, a.state].filter(Boolean).join(', ')}</span>
                            )}
                          </button>
                        ))}
                        {filteredAccounts.length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No accounts found</div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Season (tracker) selector */}
            <div>
              <Label className="text-sm">Sales Tracker</Label>
              <select
                value={selectedSeasonId}
                onChange={(e) => {
                  setSelectedSeasonId(e.target.value)
                  setSelectedOrderId('')
                }}
                className="w-full mt-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#005b5b]"
              >
                <option value="">Select tracker...</option>
                {activeSeasons.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Potential matches — optional, attach to existing instead of creating new */}
            {selectedAccountId && selectedSeasonId && potentialMatches.length > 0 && (
              <div>
                <Label className="text-sm">Attach to existing order? <span className="font-normal text-muted-foreground">(optional)</span></Label>
                {(
                  <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
                    {potentialMatches.map((o) => (
                      <label
                        key={o.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                          selectedOrderId === String(o.id)
                            ? 'border-[#005b5b] bg-[#005b5b]/5'
                            : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="matchOrder"
                          value={o.id}
                          checked={selectedOrderId === String(o.id)}
                          onChange={(e) => setSelectedOrderId(e.target.value)}
                          className="accent-[#005b5b]"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{o.order_number || `Order #${o.id}`}</span>
                          <span className="ml-2 text-muted-foreground">{fmt(o.total)}</span>
                          <Badge variant="outline" className="ml-2 text-xs">{o.stage}</Badge>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Confirmation summary */}
          {confirmMode && (
            <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 space-y-1 text-sm">
              <p className="font-medium text-emerald-800 dark:text-emerald-300">Confirm save:</p>
              <p><span className="font-medium">Account:</span> {selectedAccountName}</p>
              <p><span className="font-medium">Tracker:</span> {activeSeasons.find((s) => s.id === selectedSeasonId)?.label}</p>
              {extracted.invoice_number && <p><span className="font-medium">Invoice #:</span> {extracted.invoice_number}</p>}
              {extracted.amount && <p><span className="font-medium">Amount:</span> {fmt(extracted.amount)}</p>}
              <p><span className="font-medium">Action:</span> {selectedOrderId
                ? `Attach to ${orders.find((o) => o.id === parseInt(selectedOrderId))?.order_number || `Order #${selectedOrderId}`}`
                : 'Create new sale'
              }</p>
              <p className="text-xs text-muted-foreground">PDF will be attached as an invoice document</p>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button
              variant="ghost"
              onClick={handleDismiss}
              disabled={saving}
              className="text-zinc-500"
            >
              Dismiss
            </Button>
            <div className="flex-1" />
            {confirmMode ? (
              <>
                <Button variant="outline" onClick={() => setConfirmMode(false)} disabled={saving}>
                  Back
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-[#005b5b] hover:bg-[#007a7a] text-white"
                >
                  {saving ? 'Saving...' : 'Confirm'}
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setConfirmMode(true)}
                disabled={!selectedAccountId || !selectedSeasonId}
                className="bg-[#005b5b] hover:bg-[#007a7a] text-white"
              >
                {selectedOrderId ? 'Save to Existing Order' : 'Save as New Sale'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusBadge({ status }) {
  switch (status) {
    case 'pending':
      return <Badge variant="outline" className="text-blue-600 border-blue-200"><Clock className="size-3 mr-1" /> Pending</Badge>
    case 'unmatched':
      return <Badge variant="outline" className="text-amber-600 border-amber-200"><AlertTriangle className="size-3 mr-1" /> Unmatched</Badge>
    case 'matched':
      return <Badge variant="outline" className="text-green-600 border-green-200"><CheckCircle className="size-3 mr-1" /> Matched</Badge>
    case 'created':
      return <Badge variant="outline" className="text-green-600 border-green-200"><CheckCircle className="size-3 mr-1" /> Created</Badge>
    case 'dismissed':
      return <Badge variant="outline" className="text-zinc-400 border-zinc-200"><XCircle className="size-3 mr-1" /> Dismissed</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default CompanyBrandImports
