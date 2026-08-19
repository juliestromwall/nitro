// Store for Brightpearl order metadata, keyed by QB invoice number.
//
// This is what makes the commission engine order-type aware: promo and warranty
// earn nothing, closeout earns half, and an off-convention Ref is flagged for
// review. It also carries the Brightpearl sales-order number and the customer
// PO — the two fields that would otherwise have to be pushed onto QuickBooks
// invoices through their (3-slot, UI-only) custom fields.
//
// Persisted to the shared portal KV so it survives refresh and every authorized
// login sees the same data. Mirrors bpOverridesStore.js.
//
// Shape:
//   orders: { [invoiceNum]: { orderId, ref, code, orderType, poNumber, customer, dateCreated } }
//   meta:   { uploadedAt, fileName, counts, rowCount }

import { pget, pset, pdel } from './portalStore'

const KEY_ORDERS = 'bp_orders'
const KEY_META = 'bp_orders_meta'
// Uncoded invoices Tony has reviewed and dismissed. Kept in its OWN key rather
// than stamped onto the order records so a re-upload of the export (which
// overwrites records) can't silently resurrect them into the review queue.
const KEY_OMITTED = 'bp_orders_omitted'

export async function loadBpOrders() {
  try {
    const orders = await pget(KEY_ORDERS)
    const meta = await pget(KEY_META)
    const omitted = await pget(KEY_OMITTED)
    return {
      orders: orders && typeof orders === 'object' ? orders : {},
      meta: meta || null,
      omitted: omitted && typeof omitted === 'object' ? omitted : {},
    }
  } catch {
    return { orders: {}, meta: null, omitted: {} }
  }
}

// Mark invoices as reviewed-and-dismissed. `at` is passed in (callers stamp the
// time) to match how collectionsStore handles timestamps.
export async function omitBpOrders(invoiceNums, at) {
  const existing = await pget(KEY_OMITTED)
  const next = { ...(existing && typeof existing === 'object' ? existing : {}) }
  for (const num of invoiceNums || []) if (num) next[num] = { at }
  await pset(KEY_OMITTED, next)
  return next
}

// Put one back into the review queue.
export async function unomitBpOrder(invoiceNum) {
  const existing = await pget(KEY_OMITTED)
  const next = { ...(existing && typeof existing === 'object' ? existing : {}) }
  delete next[invoiceNum]
  await pset(KEY_OMITTED, next)
  return next
}

// Append semantics — a new export merges onto what's stored, the incoming file
// winning on conflict. Brightpearl exports are date-ranged, so this lets them be
// uploaded period by period without losing earlier orders. A later export also
// legitimately CORRECTS an earlier one (a Ref gets fixed), which is why the new
// file wins rather than being skipped.
export async function mergeBpOrders(byInvoice, meta) {
  const existing = await pget(KEY_ORDERS)
  const merged = { ...(existing && typeof existing === 'object' ? existing : {}), ...byInvoice }
  await pset(KEY_ORDERS, merged)
  await pset(KEY_META, meta)
  return merged
}

export async function clearBpOrders() {
  // Best-effort on each key — a failure to delete one shouldn't strand the others.
  try { await pdel(KEY_ORDERS) } catch { /* already gone or offline */ }
  try { await pdel(KEY_META) } catch { /* already gone or offline */ }
  try { await pdel(KEY_OMITTED) } catch { /* already gone or offline */ }
}

// orderTypeMap moved to brightpearlOrders.js — it is pure order-type logic
// with no persistence concern, and living here made it untestable (this module
// pulls in Supabase). Re-exported so existing imports keep working.
export { orderTypeMap } from './brightpearlOrders'
