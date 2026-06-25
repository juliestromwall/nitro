// IndexedDB-backed store for A/R Aging Summary snapshots.
// Tony imports these weekly — we keep the full history so we can compute
// week-over-week aging deltas and collections trends. Same DB as the line
// items store, separate key.

const DB_NAME = 'rc_tony'
const STORE_NAME = 'kv'
const DB_VERSION = 1
const KEY_SNAPSHOTS = 'ar_snapshots'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB not available in this environment'))
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
  })
  return dbPromise
}

function tx(mode) {
  return openDB().then((db) => db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
}

async function idbGet(key) {
  const store = await tx('readonly')
  return new Promise((resolve, reject) => {
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key, value) {
  const store = await tx('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbDel(key) {
  const store = await tx('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function loadArSnapshots() {
  try {
    const arr = await idbGet(KEY_SNAPSHOTS)
    if (!Array.isArray(arr)) return []
    // Sort by asOfDate desc so the most recent is first.
    return [...arr].sort((a, b) => (b.asOfDate || '').localeCompare(a.asOfDate || ''))
  } catch {
    return []
  }
}

export async function saveArSnapshots(snapshots) {
  await idbSet(KEY_SNAPSHOTS, snapshots)
}

export async function addArSnapshot(snapshot) {
  const existing = await loadArSnapshots()
  // De-dupe by asOfDate — if a snapshot for the same as-of date already
  // exists, replace it. Avoids accidental duplicates from re-uploading the
  // same weekly report.
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
  try { await idbDel(KEY_SNAPSHOTS) } catch {}
}
