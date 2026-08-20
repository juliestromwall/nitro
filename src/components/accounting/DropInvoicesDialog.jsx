// Drop invoice PDFs onto a connected rep's sales.
//
// Tony drops one or many PDFs; each is matched to one of the rep's sales by any
// number found in the filename (order number first, then invoice number). Every
// match is shown for confirmation and can be corrected before anything uploads —
// a wrong auto-match silently attached to the wrong sale is worse than no match.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Upload, Loader2, Check, AlertTriangle, X, FileText } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchRepSales, dropRepInvoices } from '@/lib/accountingDb'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)

// Every run of 4+ digits in the filename — order/invoice numbers, ignoring
// short noise like "v2" or a page count.
const numbersIn = (name) => (String(name).match(/\d{4,}/g) || [])

const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader()
  fr.onload = () => resolve(String(fr.result).split(',')[1] || '')
  fr.onerror = reject
  fr.readAsDataURL(file)
})

export default function DropInvoicesDialog({ repId, repName, open, onOpenChange }) {
  const [orders, setOrders] = useState([])
  const [clientsById, setClientsById] = useState({})
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])       // { file, name, orderId, invoiceNumber }
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const load = useCallback(async () => {
    if (!repId) return
    setLoading(true); setError('')
    try {
      const data = await fetchRepSales(repId)
      setOrders(data.orders ?? [])
      setClientsById(Object.fromEntries((data.clients ?? []).map((c) => [c.id, c])))
    } catch (err) {
      setError(err.message || "Couldn't load this rep's sales.")
    } finally {
      setLoading(false)
    }
  }, [repId])

  useEffect(() => {
    if (open) { load(); setRows([]); setResults(null); setError('') }
  }, [open, load])

  const byOrderNumber = useMemo(() => {
    const m = new Map()
    for (const o of orders) {
      if (o.order_number) m.set(String(o.order_number), o)
      if (o.invoice_number) m.set(String(o.invoice_number), o)
    }
    return m
  }, [orders])

  const label = (o) => {
    if (!o) return ''
    const acct = clientsById[o.client_id]?.name || 'Unknown account'
    return `${o.order_number || '—'} · ${acct} · ${fmt(o.total)}`
  }

  const addFiles = async (fileList) => {
    const files = Array.from(fileList).filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
    if (!files.length) { setError('Only PDF files can be attached.'); return }
    setError('')
    const next = files.map((file) => {
      const hit = numbersIn(file.name).map((n) => byOrderNumber.get(n)).find(Boolean)
      return {
        file,
        name: file.name,
        orderId: hit?.id ?? '',
        invoiceNumber: hit?.invoice_number || '',
      }
    })
    setRows((prev) => [...prev, ...next])
  }

  const matched = rows.filter((r) => r.orderId)
  const unmatched = rows.length - matched.length

  const upload = async () => {
    setBusy(true); setError('')
    try {
      const items = await Promise.all(matched.map(async (r) => ({
        orderId: r.orderId,
        invoiceNumber: r.invoiceNumber || null,
        fileName: r.name,
        fileBase64: await readAsBase64(r.file),
      })))
      const { results: res } = await dropRepInvoices(repId, items)
      setResults(res || [])
      await load()
    } catch (err) {
      setError(err.message || 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  const okCount = results?.filter((r) => r.ok).length ?? 0
  const failCount = results ? results.length - okCount : 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Drop invoices — {repName || 'Rep'}</DialogTitle>
          <DialogDescription>
            Drop invoice PDFs here. Each one is matched to a sale by the number in its
            filename — check the matches before uploading.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {results ? (
          <div className="py-6 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Check className="size-5 text-emerald-600" />
              Attached {okCount} invoice{okCount === 1 ? '' : 's'}
              {failCount > 0 && <span className="text-red-600">· {failCount} failed</span>}
            </div>
            {failCount > 0 && (
              <ul className="text-xs text-red-600 space-y-1">
                {results.filter((r) => !r.ok).map((r, i) => (
                  <li key={i}>Order {r.orderNumber || r.orderId}: {r.error}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
              onClick={() => inputRef.current?.click()}
              className={`rounded-xl border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors ${
                dragging
                  ? 'border-[#005b5b] bg-[#005b5b]/5'
                  : 'border-zinc-300 dark:border-zinc-700 hover:border-[#005b5b]'
              }`}
            >
              <Upload className="size-6 mx-auto text-zinc-400 mb-2" />
              <p className="text-sm font-medium">Drop invoice PDFs here, or click to choose</p>
              <p className="text-xs text-muted-foreground mt-1">
                {loading ? 'Loading sales…' : `${orders.length} sales available to match against`}
              </p>
              <input
                ref={inputRef} type="file" accept="application/pdf" multiple hidden
                onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
              />
            </div>

            {rows.length > 0 && (
              <div className="max-h-[45vh] overflow-y-auto space-y-2 mt-2">
                {unmatched > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-600">
                    <AlertTriangle className="size-3.5" />
                    {unmatched} file{unmatched === 1 ? '' : 's'} didn't match a sale — pick one, or they'll be skipped.
                  </p>
                )}
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2">
                    <FileText className="size-4 text-zinc-400 shrink-0" />
                    <span className="text-sm truncate flex-1 min-w-0" title={r.name}>{r.name}</span>
                    <select
                      value={r.orderId}
                      onChange={(e) => setRows((prev) => prev.map((x, j) => j === i ? { ...x, orderId: e.target.value } : x))}
                      className="text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 max-w-[16rem]"
                    >
                      <option value="">— choose a sale —</option>
                      {orders.map((o) => (
                        <option key={o.id} value={o.id}>{label(o)}</option>
                      ))}
                    </select>
                    <Input
                      value={r.invoiceNumber}
                      onChange={(e) => setRows((prev) => prev.map((x, j) => j === i ? { ...x, invoiceNumber: e.target.value } : x))}
                      placeholder="Invoice #"
                      className="h-8 w-28 text-xs shrink-0"
                    />
                    <button
                      onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                      className="text-zinc-400 hover:text-red-600 shrink-0"
                      title="Remove"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {results ? 'Close' : 'Cancel'}
          </Button>
          {!results && (
            <Button
              onClick={upload}
              disabled={busy || matched.length === 0}
              className="bg-[#005b5b] hover:bg-[#004848]"
            >
              {busy ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Upload className="size-4 mr-1.5" />}
              Attach {matched.length || ''} invoice{matched.length === 1 ? '' : 's'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
