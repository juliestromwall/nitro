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

export async function loadBpOrders() {
  try {
    const orders = await pget(KEY_ORDERS)
    const meta = await pget(KEY_META)
    return { orders: orders && typeof orders === 'object' ? orders : {}, meta: meta || null }
  } catch {
    return { orders: {}, meta: null }
  }
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
  // Best-effort on both keys — a failure to delete one shouldn't strand the other.
  try { await pdel(KEY_ORDERS) } catch { /* already gone or offline */ }
  try { await pdel(KEY_META) } catch { /* already gone or offline */ }
}

// The engine wants a flat { invoiceNum: orderType } map, not the full records.
export function orderTypeMap(orders) {
  const out = {}
  for (const [invoice, rec] of Object.entries(orders || {})) {
    if (rec?.orderType) out[invoice] = rec.orderType
  }
  return out
}
