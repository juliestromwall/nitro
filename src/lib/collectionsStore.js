// Store for A/R Collections annotations — the human layer on top of the aging:
// per-account collection notes, a payment-plan flag, and a "how do they pay?"
// terms rating. Persists to the shared portal KV so it survives refresh and is
// shared across authorized logins (Tony + accounting).
//
// Shape (one blob, keyed by a stable account key — the account id, or the
// normalized customer name when no account matched):
//   { [accountKey]: { notes: [{ ts, text }], plan: boolean, terms: 'on_terms' | 'late_30' | 'no_respect' | null } }
// `ts` is an ISO string stamped at write time (dates can't be generated in some
// contexts, so callers pass it in).

import { pget, pset } from './portalStore'

const KEY = 'collections_notes'

export async function loadCollectionsNotes() {
  try {
    const v = await pget(KEY)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export async function saveCollectionsNotes(map) {
  await pset(KEY, map || {})
}

// Convenience: an empty per-account record.
export function emptyRecord() {
  return { notes: [], plan: false, terms: null }
}
