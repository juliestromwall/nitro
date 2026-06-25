// IndexedDB-backed store for Brightpearl invoice→customer overrides.
// Used to recover original WSR-member names that QB strips when a payment
// arrives and the customer field gets renamed to bare "WSR". Same DB as
// the other stores, separate key.
//
// Shape: { overrides: { [invoiceNum]: originalCustomerName, ... }, meta: {...} }

const DB_NAME = 'rc_tony'
const STORE_NAME = 'kv'
const DB_VERSION = 1
const KEY_OVERRIDES = 'bp_invoice_overrides'
const KEY_META = 'bp_invoice_overrides_meta'

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
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
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

export async function loadBpOverrides() {
  try {
    const overrides = await idbGet(KEY_OVERRIDES)
    const meta = await idbGet(KEY_META)
    return { overrides: overrides && typeof overrides === 'object' ? overrides : {}, meta: meta || null }
  } catch {
    return { overrides: {}, meta: null }
  }
}

// Append semantics — incoming overrides are merged onto whatever's stored,
// with the new file's mappings winning on conflict. Lets Tony upload one
// territory at a time without losing prior territories.
export async function mergeBpOverrides(newOverrides, meta) {
  const existing = await idbGet(KEY_OVERRIDES)
  const merged = { ...(existing && typeof existing === 'object' ? existing : {}), ...newOverrides }
  await idbSet(KEY_OVERRIDES, merged)
  await idbSet(KEY_META, meta)
  return merged
}

export async function clearBpOverrides() {
  try { await idbDel(KEY_OVERRIDES) } catch {}
  try { await idbDel(KEY_META) } catch {}
}
