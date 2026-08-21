// Weekly warehouse shipping report — the full version, with values.
//
// A counts-mostly copy of this lives on the Foundry Hub for the warehouse crew
// (foundry-hub/scripts/build-shipping.mjs). This one is behind the app's login
// and shows everything: pipeline value, revenue by brand, season totals.
//
// Fed by two Brightpearl exports. They can be uploaded here or from the
// Data Uploads tab — both routes call the same handler.

import { useMemo, useState } from 'react'
import { Package, Printer, Truck, Upload, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildShippingReport, UNRESOLVED_BRAND } from '@/lib/shippingReport'

const TEAL = '#005b5b'
// Brand colours, reused by the swatches and the per-customer pills.
const BRAND_COLOR = {
  NITRO: '#005b5b',
  Autumn: '#b26a00',
  L1: '#455356',
  Eivy: '#6f8285',
  Corduroy: '#8d9b9d',
  [UNRESOLVED_BRAND]: '#a8b3b5',
}

const usd = (n) => `$${Math.round(n || 0).toLocaleString('en-US')}`
const compact = (n) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 1000).toLocaleString('en-US')}k` : `$${Math.round(n)}`)
const int = (n) => (n || 0).toLocaleString('en-US')

function Stat({ label, value, hint }) {
  return (
    <div className="bg-background p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-1">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  )
}

function Stage({ icon, step, title, orders, value, tags, color }) {
  return (
    <div className="relative border rounded-md p-5 flex flex-col overflow-hidden bg-background">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color }}>
        {icon} {step}
      </div>
      <h3 className="mt-2 text-sm font-semibold">{title}</h3>
      <div className="mt-3 text-3xl font-semibold tabular-nums leading-none">{int(orders)}</div>
      <div className="mt-1.5 text-sm text-muted-foreground tabular-nums">{usd(value)}</div>
      <div className="mt-auto pt-3 flex flex-wrap gap-1">
        {tags.map((t) => (
          <span key={t} className="text-[10px] font-mono border rounded px-1.5 py-0.5 text-muted-foreground">{t}</span>
        ))}
      </div>
    </div>
  )
}

export default function ShippingView({ snapshot, meta, onPickFile, onClear, error, busy }) {
  // Two-step confirm, kept local: the shared confirm dialog lives inside
  // InvoicesView, not in this view's parent, so there is nothing to reach for.
  const [confirmingClear, setConfirmingClear] = useState(false)
  const report = useMemo(
    () => buildShippingReport({ openOrders: snapshot?.openOrders || [], shipped: snapshot?.shipped || [] }),
    [snapshot],
  )
  const { stages, season, share, weeks, byBrand, byTag, undated } = report
  const [selected, setSelected] = useState(null)
  const [metric, setMetric] = useState('orders')

  const weekIdx = selected == null ? weeks.length - 1 : Math.min(selected, weeks.length - 1)
  const week = weeks[weekIdx]
  const isCurrent = weekIdx === weeks.length - 1
  const peak = Math.max(1, ...weeks.map((w) => w[metric]))
  const pick = (e) => { if (e.target.files?.[0]) { onPickFile(e.target.files[0]); e.target.value = '' } }

  if (!season.orders) {
    return (
      <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 py-16 px-6 text-center">
        <Package className="size-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium mb-1">No shipping snapshot yet</p>
        <p className="text-sm text-muted-foreground mb-5 max-w-lg mx-auto">
          Upload two Brightpearl order exports taken the same day: every order <em>except</em> invoiced,
          and the invoiced orders <em>with the Tax date column</em>. Tax date is the ship date —
          &ldquo;Date created&rdquo; is when the order was written, which for a pre-book is months earlier.
        </p>
        <label className="inline-flex">
          <input type="file" accept=".csv" className="hidden" onChange={pick} />
          <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted cursor-pointer gap-1.5">
            <Upload className="size-4" /> Choose a Brightpearl export
          </span>
        </label>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Season progress — how much of the season is still ahead */}
      <div className="border rounded-md p-5 space-y-4 bg-background">
        <div className="flex justify-between items-baseline gap-4 flex-wrap">
          <div>
            <div className="text-3xl font-semibold tabular-nums leading-none">{share.shipped.toFixed(1)}%</div>
            <div className="text-sm text-muted-foreground mt-1">
              of season value shipped — {usd(stages.shipped.value)} of {usd(season.value)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-semibold tabular-nums leading-none">{int(stages.shipped.orders)}</div>
            <div className="text-sm text-muted-foreground mt-1">of {int(season.orders)} orders out the door</div>
          </div>
        </div>
        <div className="flex h-7 border rounded overflow-hidden">
          <span className="flex items-center justify-center text-[10px] font-semibold text-white tabular-nums"
                style={{ width: `${share.shipped}%`, background: TEAL }}>
            {share.shipped > 6 ? `${share.shipped.toFixed(1)}%` : ''}
          </span>
          <span className="flex items-center justify-center text-[10px] font-semibold text-white tabular-nums"
                style={{ width: `${share.printed}%`, background: '#455356' }}>
            {share.printed > 6 ? `${share.printed.toFixed(1)}%` : ''}
          </span>
          <span className="flex items-center justify-center text-[10px] font-semibold text-white tabular-nums"
                style={{ width: `${share.toPrint}%`, background: '#b26a00' }}>
            {share.toPrint > 12 ? `${share.toPrint.toFixed(1)}% still to print` : ''}
          </span>
        </div>
        <div className="flex gap-5 flex-wrap text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-sm" style={{ background: TEAL }} />Shipped</span>
          <span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-sm" style={{ background: '#455356' }} />Printed, awaiting ship</span>
          <span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-sm" style={{ background: '#b26a00' }} />To print</span>
        </div>
      </div>

      {/* Pipeline */}
      <div className="grid gap-4 md:grid-cols-3">
        <Stage icon={<Package className="size-3.5" />} step="Stage 1 · Booked" title="To print" color="#b26a00"
               orders={stages.toPrint.orders} value={stages.toPrint.value}
               tags={byTag.map((t) => t.tag)} />
        <Stage icon={<Printer className="size-3.5" />} step="Stage 2 · Packed" title="Printed, awaiting ship" color="#455356"
               orders={stages.printed.orders} value={stages.printed.value}
               tags={['Order Printed']} />
        <Stage icon={<Truck className="size-3.5" />} step="Stage 3 · Shipped" title="Invoiced" color={TEAL}
               orders={stages.shipped.orders} value={stages.shipped.value}
               tags={['Invoiced']} />
      </div>

      {/* Weekly chart */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4 flex-wrap border-b pb-2">
          <h3 className="text-xs uppercase tracking-wider font-semibold">Shipped per week</h3>
          <div className="flex border rounded overflow-hidden">
            {[['orders', 'Orders'], ['value', 'Value']].map(([k, lbl]) => (
              <button key={k} onClick={() => setMetric(k)}
                className={`px-3 py-1 text-[10px] uppercase tracking-wider font-semibold ${
                  metric === k ? 'text-white' : 'text-muted-foreground hover:bg-muted'}`}
                style={metric === k ? { background: TEAL } : undefined}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <div className="border rounded-md p-5 pb-3 overflow-x-auto bg-background">
          <div className="grid grid-flow-col auto-cols-fr gap-2 items-end h-44 min-w-[620px]">
            {weeks.map((w, i) => (
              <button key={w.key} onClick={() => setSelected(i)}
                      title={`${w.label}: ${int(w.orders)} orders, ${usd(w.value)}`}
                      className="flex flex-col justify-end items-center gap-1.5 h-full group">
                <span className={`text-[11px] tabular-nums ${i === weekIdx ? 'font-semibold' : 'text-muted-foreground'}`}>
                  {metric === 'orders' ? w.orders : compact(w.value)}
                </span>
                <span className="w-full border-t-2 transition-all group-hover:opacity-80"
                      style={{
                        height: `${Math.max(2, (w[metric] / peak) * 100)}%`,
                        background: i === weekIdx ? TEAL : '#e3eeee',
                        borderTopColor: TEAL,
                      }} />
                <span className={`text-[10px] tabular-nums border-t w-full pt-1.5 text-center ${
                  i === weekIdx ? 'font-semibold' : 'text-muted-foreground'}`}>{w.label}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Click a week to see who was shipped. Orders and value tell different stories — toggle above.
        </p>
      </div>

      {/* Selected week */}
      {week && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-4 flex-wrap border-b pb-2">
            <h3 className="text-xs uppercase tracking-wider font-semibold">
              {isCurrent ? 'Shipped this week' : `Shipped week ending ${week.label}`}
            </h3>
            <span className="text-xs text-muted-foreground">
              {int(week.orders)} orders to {week.customers.length} customer{week.customers.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border rounded-md overflow-hidden">
            <Stat label="Orders" value={int(week.orders)} />
            <Stat label="Value" value={usd(week.value)} />
            <Stat label="Avg order" value={usd(week.avgOrder)} />
            <Stat label="Customers" value={int(week.customers.length)} />
          </div>
          <div className="border rounded-md overflow-x-auto bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-semibold py-2 px-4">Customer</th>
                  <th className="text-right font-semibold py-2 px-4">Orders</th>
                  <th className="text-right font-semibold py-2 px-4">Value</th>
                </tr>
              </thead>
              <tbody>
                {week.customers.map((c) => (
                  <tr key={c.customer} className="border-b last:border-0">
                    <td className="py-2 px-4">
                      <span className="font-medium">{c.customer}</span>
                      {c.wsr && <span className="ml-2 text-[9px] font-mono border rounded px-1 py-0.5 text-muted-foreground">WSR</span>}
                      <span className="inline-flex gap-1 ml-2 flex-wrap">
                        {c.brands.map((b) => (
                          <span key={b} className="inline-flex items-center gap-1 text-[10px] font-mono uppercase border rounded px-1.5 py-0.5 text-muted-foreground">
                            <i className="size-1.5 rounded-full" style={{ background: BRAND_COLOR[b] || BRAND_COLOR[UNRESOLVED_BRAND] }} />
                            {b}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums">{c.orders}</td>
                    <td className="py-2 px-4 text-right tabular-nums">{usd(c.value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold bg-muted/40">
                  <td className="py-2 px-4">{week.customers.length} customers</td>
                  <td className="py-2 px-4 text-right tabular-nums">{int(week.orders)}</td>
                  <td className="py-2 px-4 text-right tabular-nums">{usd(week.value)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* By brand */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4 flex-wrap border-b pb-2">
          <h3 className="text-xs uppercase tracking-wider font-semibold">Left to ship, by brand</h3>
          <span className="text-xs text-muted-foreground">The row the spreadsheet left as &ldquo;In progress&rdquo;</span>
        </div>
        <div className="border rounded-md overflow-x-auto bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left font-semibold py-2 px-4">Brand</th>
                <th className="text-right font-semibold py-2 px-4">To go</th>
                <th className="text-right font-semibold py-2 px-4">Value waiting</th>
                <th className="text-right font-semibold py-2 px-4">Shipped</th>
                <th className="text-right font-semibold py-2 px-4">Value shipped</th>
              </tr>
            </thead>
            <tbody>
              {byBrand.map((b) => (
                <tr key={b.brand} className="border-b last:border-0">
                  <td className="py-2 px-4">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <i className="size-2.5 rounded-full" style={{ background: BRAND_COLOR[b.brand] || BRAND_COLOR[UNRESOLVED_BRAND] }} />
                      {b.brand}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums">{int(b.leftOrders)}</td>
                  <td className="py-2 px-4 text-right tabular-nums">{usd(b.leftValue)}</td>
                  <td className={`py-2 px-4 text-right tabular-nums ${b.shippedOrders ? '' : 'text-muted-foreground'}`}>
                    {b.shippedOrders ? int(b.shippedOrders) : '—'}
                  </td>
                  <td className={`py-2 px-4 text-right tabular-nums ${b.shippedOrders ? '' : 'text-muted-foreground'}`}>
                    {b.shippedOrders ? usd(b.shippedValue) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold bg-muted/40">
                <td className="py-2 px-4">Total</td>
                <td className="py-2 px-4 text-right tabular-nums">{int(stages.toPrint.orders + stages.printed.orders)}</td>
                <td className="py-2 px-4 text-right tabular-nums">{usd(stages.toPrint.value + stages.printed.value)}</td>
                <td className="py-2 px-4 text-right tabular-nums">{int(stages.shipped.orders)}</td>
                <td className="py-2 px-4 text-right tabular-nums">{usd(stages.shipped.value)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Upload / snapshot state */}
      <div className="rounded-md border border-dashed px-3 py-2 text-sm flex flex-wrap items-center gap-3">
        <Package className="size-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Snapshot:</span>
        <span className="font-medium">{int(season.orders)}</span>
        <span className="text-muted-foreground">orders · {weeks.length} shipping weeks</span>
        {undated > 0 && (
          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700">
            {undated} shipped with no tax date
          </span>
        )}
        {meta?.openFile && <span className="text-xs text-muted-foreground">• {meta.openFile}</span>}
        {meta?.shippedFile && <span className="text-xs text-muted-foreground">• {meta.shippedFile}</span>}
        <span className="ml-auto flex items-center gap-2">
          <label className="inline-flex">
            <input type="file" accept=".csv" className="hidden" onChange={pick} disabled={busy} />
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted cursor-pointer gap-1">
              <Upload className="size-3.5" /> {busy ? 'Reading…' : 'Upload export'}
            </span>
          </label>
          {confirmingClear ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Clear the snapshot?</span>
              <Button variant="destructive" size="sm" className="h-7 text-xs"
                      onClick={() => { setConfirmingClear(false); onClear() }}>Yes, clear</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => setConfirmingClear(false)}>Cancel</Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmingClear(true)}
                    className="text-muted-foreground h-7 text-xs">
              <Trash2 className="size-3.5 mr-1" />Clear
            </Button>
          )}
        </span>
        {error && <p className="basis-full text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
