// Store for the open receivables parsed from the A/R Aging Detail report. Unlike
// the collected lines (which accumulate), the aging is a point-in-time SNAPSHOT —
// each upload REPLACES the last, since the latest report is the current open
// picture. Persists to the shared portal KV so it survives refresh / other logins.

import { pget, pset, pdel } from './portalStore'

const KEY_OPEN = 'ar_aging_open'
const KEY_META = 'ar_aging_meta'

export async function loadArAging() {
  try {
    const open = await pget(KEY_OPEN)
    const meta = await pget(KEY_META)
    return { open: Array.isArray(open) ? open : null, meta: meta || null }
  } catch {
    return { open: null, meta: null }
  }
}

export async function saveArAging(open, meta) {
  await pset(KEY_OPEN, open)
  await pset(KEY_META, meta || null)
}

export async function clearArAging() {
  try { await pdel(KEY_OPEN) } catch { /* best-effort */ }
  try { await pdel(KEY_META) } catch { /* best-effort */ }
}
