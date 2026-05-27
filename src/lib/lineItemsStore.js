// IndexedDB-backed store for line items. Lifted out of localStorage when the
// dataset exceeded the ~5MB quota. IndexedDB typically allows hundreds of MB
// (or more — most browsers grant up to ~60% of free disk on demand).
//
// Public API mirrors what the rest of the app expects:
//   loadLineItems()          → { items: [], meta: null | {...} }
//   saveLineItems(rows, meta) → resolves when persisted
//   clearLineItems()          → resolves after wipe

const DB_NAME = 'rc_tony'
const STORE_NAME = 'kv'
const DB_VERSION = 1
const KEY_ITEMS = 'line_items'
const KEY_META = 'line_items_meta'

// Legacy localStorage keys for one-time migration from the previous storage.
const LEGACY_LS_ITEMS = 'rc_tony_invoice_items_v1'
const LEGACY_LS_META = 'rc_tony_invoice_items_meta_v1'

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

// One-time migration from localStorage → IndexedDB. Only runs when IDB has
// nothing yet and LS has something. Drops the LS keys after a successful
// migration so we don't double-store.
async function migrateFromLocalStorage() {
  try {
    const lsItems = localStorage.getItem(LEGACY_LS_ITEMS)
    if (!lsItems) return
    const parsed = JSON.parse(lsItems)
    if (!Array.isArray(parsed)) return
    await idbSet(KEY_ITEMS, parsed)
    const lsMeta = localStorage.getItem(LEGACY_LS_META)
    if (lsMeta) {
      try { await idbSet(KEY_META, JSON.parse(lsMeta)) } catch {}
    }
    // Free up the localStorage now that IDB owns this data
    localStorage.removeItem(LEGACY_LS_ITEMS)
    localStorage.removeItem(LEGACY_LS_META)
  } catch {
    // Migration is best-effort; ignore failures.
  }
}

export async function loadLineItems() {
  try {
    let items = await idbGet(KEY_ITEMS)
    let meta = await idbGet(KEY_META)
    if (!items) {
      await migrateFromLocalStorage()
      items = await idbGet(KEY_ITEMS)
      meta = await idbGet(KEY_META)
    }
    return { items: Array.isArray(items) ? items : [], meta: meta || null }
  } catch {
    return { items: [], meta: null }
  }
}

export async function saveLineItems(rows, meta) {
  await idbSet(KEY_ITEMS, rows)
  await idbSet(KEY_META, meta)
}

export async function clearLineItems() {
  try { await idbDel(KEY_ITEMS) } catch {}
  try { await idbDel(KEY_META) } catch {}
  try { localStorage.removeItem(LEGACY_LS_ITEMS) } catch {}
  try { localStorage.removeItem(LEGACY_LS_META) } catch {}
}
