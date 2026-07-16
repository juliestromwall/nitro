// Store for A/R Aging Summary snapshots (imported weekly; full history kept
// for week-over-week aging deltas). Persistence moved from browser-local
// IndexedDB to Supabase (see portalStore.js) so the data is shared across
// logins. Public API unchanged.

import { pget, pset, pdel } from './portalStore'

const KEY_SNAPSHOTS = 'ar_snapshots'

export async function loadArSnapshots() {
  try {
    const arr = await pget(KEY_SNAPSHOTS)
    if (!Array.isArray(arr)) return []
    // Sort by asOfDate desc so the most recent is first.
    return [...arr].sort((a, b) => (b.asOfDate || '').localeCompare(a.asOfDate || ''))
  } catch {
    return []
  }
}

export async function saveArSnapshots(snapshots) {
  await pset(KEY_SNAPSHOTS, snapshots)
}

export async function addArSnapshot(snapshot) {
  const existing = await loadArSnapshots()
  // De-dupe by asOfDate — replace an existing snapshot for the same as-of date
  // so re-uploading the same weekly report doesn't duplicate.
  const filtered = existing.filter(s => s.asOfDate !== snapshot.asOfDate)
  filtered.push(snapshot)
  await saveArSnapshots(filtered)
  return filtered.sort((a, b) => (b.asOfDate || '').localeCompare(a.asOfDate || ''))
}

export async function deleteArSnapshot(id) {
  const existing = await loadArSnapshots()
  const filtered = existing.filter(s => s.id !== id)
  await saveArSnapshots(filtered)
  return filtered
}

export async function clearArSnapshots() {
  try { await pdel(KEY_SNAPSHOTS) } catch {}
}
