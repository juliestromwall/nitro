// IndexedDB-backed store for QuickBooks "Invoices & Received Payments"
// transaction exports. Single replace semantics — each upload supersedes
// the previous one (this is typically a single date-bounded export Tony
// re-pulls periodically, not a snapshot series).

const DB_NAME = 'rc_tony'
const STORE_NAME = 'kv'
const DB_VERSION = 1
const KEY_TX = 'payments_tx'
const KEY_META = 'payments_meta'

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

export async function loadPaymentsTx() {
  try {
    const tx = await idbGet(KEY_TX)
    const meta = await idbGet(KEY_META)
    return { transactions: Array.isArray(tx) ? tx : [], meta: meta || null }
  } catch {
    return { transactions: [], meta: null }
  }
}

export async function savePaymentsTx(transactions, meta) {
  await idbSet(KEY_TX, transactions)
  await idbSet(KEY_META, meta)
}

export async function clearPaymentsTx() {
  try { await idbDel(KEY_TX) } catch {}
  try { await idbDel(KEY_META) } catch {}
}
