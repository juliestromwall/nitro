// Store for Brightpearl invoice→customer overrides (recovers original
// WSR-member names QB strips on payment). Persistence moved from browser-local
// IndexedDB to Supabase (see portalStore.js) so the data is shared across
// logins. Public API unchanged.
//
// Shape: { overrides: { [invoiceNum]: originalCustomerName, ... }, meta: {...} }

import { pget, pset, pdel } from './portalStore'

const KEY_OVERRIDES = 'bp_invoice_overrides'
const KEY_META = 'bp_invoice_overrides_meta'

export async function loadBpOverrides() {
  try {
    const overrides = await pget(KEY_OVERRIDES)
    const meta = await pget(KEY_META)
    return { overrides: overrides && typeof overrides === 'object' ? overrides : {}, meta: meta || null }
  } catch {
    return { overrides: {}, meta: null }
  }
}

// Append semantics — incoming overrides merge onto whatever's stored, new
// file's mappings winning on conflict, so territories can be uploaded one at a
// time without losing prior ones.
export async function mergeBpOverrides(newOverrides, meta) {
  const existing = await pget(KEY_OVERRIDES)
  const merged = { ...(existing && typeof existing === 'object' ? existing : {}), ...newOverrides }
  await pset(KEY_OVERRIDES, merged)
  await pset(KEY_META, meta)
  return merged
}

export async function clearBpOverrides() {
  try { await pdel(KEY_OVERRIDES) } catch {}
  try { await pdel(KEY_META) } catch {}
}
