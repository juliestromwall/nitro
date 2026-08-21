// Store for the ACCUMULATED collected-commission lines (parsed from the cash-basis
// "Sales by Customer Detail" report). Persists to the shared Supabase KV layer
// (portalStore) like the other portal datasets, so the collected-driven rep ledger
// survives a refresh and is shared across authorized logins.
//
// Lines accumulate across weekly uploads and are de-duped by each line's stable
// fingerprint (`key` = invoice|sku|date|occurrence, assigned by parseSalesDetail).
// So overlapping reports are harmless: the same paid line collapses to one, a
// newly-recorded payment is added, and a re-uploaded/corrected line's newer value
// wins. Each paid line counts exactly once — the guarantee commissions need.

import { pget, pset, pdel } from './portalStore'

const KEY_LINES = 'collected_lines'
const KEY_META = 'collected_meta'

export async function loadCollected() {
  try {
    const lines = await pget(KEY_LINES)
    const meta = await pget(KEY_META)
    return { lines: Array.isArray(lines) ? lines : null, meta: meta || null }
  } catch {
    return { lines: null, meta: null }
  }
}

export async function saveCollected(lines, meta) {
  await pset(KEY_LINES, lines)
  await pset(KEY_META, meta || null)
}

export async function clearCollected() {
  try { await pdel(KEY_LINES) } catch { /* best-effort */ }
  try { await pdel(KEY_META) } catch { /* best-effort */ }
}
