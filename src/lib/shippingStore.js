// Store for the weekly warehouse shipping snapshot.
//
// Two Brightpearl exports, taken the same day:
//   open     — every order NOT yet invoiced (2027 Booking, Order Printed, …)
//   shipped  — invoiced orders, WITH the Tax date column
//
// REPLACE semantics, not merge. Unlike bp_orders (which accumulates a season of
// commission data), this is a point-in-time photograph of the pipeline: an order
// that moved from "Order Printed" to "Invoiced" this week must LEAVE the open
// set, and merging would strand it in both. Each upload supersedes the last.
//
// Order notes are dropped before storing — they are the largest field and the
// report never reads them.

import { pget, pset, pdel } from './portalStore'

const KEY_DATA = 'shipping_snapshot'
const KEY_META = 'shipping_snapshot_meta'

// Only what the report actually uses, so a 1,600-order snapshot stays small.
const slim = (r) => ({
  status: r.status || '',
  ref: r.ref || '',
  customer: r.customer || '',
  total: r.total || 0,
  taxDate: r.taxDate || '',
  orderType: r.orderType || '',
  invoice: r.invoice || '',
})

export async function loadShippingSnapshot() {
  try {
    const data = await pget(KEY_DATA)
    const meta = await pget(KEY_META)
    return {
      openOrders: Array.isArray(data?.openOrders) ? data.openOrders : [],
      shipped: Array.isArray(data?.shipped) ? data.shipped : [],
      meta: meta || null,
    }
  } catch {
    return { openOrders: [], shipped: [], meta: null }
  }
}

export async function saveShippingSnapshot({ openOrders = [], shipped = [] }, meta) {
  await pset(KEY_DATA, { openOrders: openOrders.map(slim), shipped: shipped.map(slim) })
  await pset(KEY_META, meta)
}

export async function clearShippingSnapshot() {
  try { await pdel(KEY_DATA) } catch { /* already gone or offline */ }
  try { await pdel(KEY_META) } catch { /* already gone or offline */ }
}

/**
 * Which of the two files this is, judged by content rather than filename —
 * Brightpearl exports get renamed constantly. The invoiced export is the one
 * whose rows are tagged Invoiced and carry a tax date.
 */
export function classifyShippingExport(rows) {
  if (!rows?.length) return null
  const invoiced = rows.filter((r) => /invoiced/i.test(r.status || '')).length
  return invoiced / rows.length > 0.5 ? 'shipped' : 'open'
}
