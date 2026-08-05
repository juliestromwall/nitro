// Store for the A/R Aging Detail. Unlike the collected lines (which accumulate),
// the aging is a point-in-time SNAPSHOT — each upload REPLACES the last, since the
// latest report is the current open picture. Persists to the shared portal KV so it
// survives refresh / other logins.
//
// Two payloads are kept:
//   - `open`  : the positive open invoices (openInvoicesFromAging) → drives Pending.
//   - `rows`  : the FULL parsed aging rows (every type + bucket, incl. credits) →
//               drives the Collections worklist (per-customer netted aging buckets).

import { pget, pset, pdel } from './portalStore'

const KEY_OPEN = 'ar_aging_open'
const KEY_META = 'ar_aging_meta'
const KEY_ROWS = 'ar_aging_rows'

export async function loadArAging() {
  try {
    const open = await pget(KEY_OPEN)
    const meta = await pget(KEY_META)
    const rows = await pget(KEY_ROWS)
    return {
      open: Array.isArray(open) ? open : null,
      meta: meta || null,
      rows: Array.isArray(rows) ? rows : null,
    }
  } catch {
    return { open: null, meta: null, rows: null }
  }
}

export async function saveArAging(open, meta, rows) {
  await pset(KEY_OPEN, open)
  await pset(KEY_META, meta || null)
  await pset(KEY_ROWS, Array.isArray(rows) ? rows : null)
}

export async function clearArAging() {
  try { await pdel(KEY_OPEN) } catch { /* best-effort */ }
  try { await pdel(KEY_META) } catch { /* best-effort */ }
  try { await pdel(KEY_ROWS) } catch { /* best-effort */ }
}
