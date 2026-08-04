// Store for the collected-commission entries (parsed from the cash-basis "Sales
// by Customer Detail" report). Persists to the shared Supabase KV layer
// (portalStore) like the other portal datasets, so the collected-driven rep
// ledger survives a refresh and is shared across authorized logins.
//
// We persist the slim per-line records the ledger needs — { repId, commission,
// date } — plus a little metadata for display. Public API mirrors the other
// stores: loadCollected / saveCollected / clearCollected.

import { pget, pset, pdel } from './portalStore'

const KEY_ENTRIES = 'collected_entries'
const KEY_META = 'collected_meta'

export async function loadCollected() {
  try {
    const entries = await pget(KEY_ENTRIES)
    const meta = await pget(KEY_META)
    return { entries: Array.isArray(entries) ? entries : null, meta: meta || null }
  } catch {
    return { entries: null, meta: null }
  }
}

export async function saveCollected(entries, meta) {
  await pset(KEY_ENTRIES, entries)
  await pset(KEY_META, meta || null)
}

export async function clearCollected() {
  try { await pdel(KEY_ENTRIES) } catch { /* best-effort */ }
  try { await pdel(KEY_META) } catch { /* best-effort */ }
}
