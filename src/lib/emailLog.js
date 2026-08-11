// Tracks when each rep was last emailed their commission report. Persists to the
// shared portal KV so the "Last emailed …" note under the Email button survives
// refresh and is consistent across logins. Shape: { [repId]: isoTimestamp }.

import { pget, pset } from './portalStore'

const KEY = 'rep_email_log'

export async function loadEmailLog() {
  try {
    const v = await pget(KEY)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export async function saveEmailLog(map) {
  await pset(KEY, map || {})
}
