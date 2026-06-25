// IndexedDB-backed store for WSR ACH payment remittance forms.
// Each upload is one remittance (one check / one ACH transaction). We keep
// every remittance so we can reconstruct per-invoice payment dates +
// per-member attribution for WSR-cleared invoices. Same DB as other stores.
//
// Shape per record:
// {
//   id, uploadedAt, fileName,
//   checkDate: 'YYYY-MM-DD',
//   checkNumber: 'ACH06626',
//   paymentAmount: 4908.87,
//   invoices: [
//     { type, invoiceNum, invoiceDate, memberId, invoiceAmount,
//       vendorAdminFee, amountPaid }
//   ]
// }

const DB_NAME = 'rc_tony'
const STORE_NAME = 'kv'
const DB_VERSION = 1
const KEY_RECORDS = 'wsr_remittances'

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

export async function loadWsrRemittances() {
  try {
    const arr = await idbGet(KEY_RECORDS)
    if (!Array.isArray(arr)) return []
    // Newest check date first.
    return [...arr].sort((a, b) => (b.checkDate || '').localeCompare(a.checkDate || ''))
  } catch {
    return []
  }
}

// Add a remittance — dedupe by checkNumber so re-uploading the same file
// (or the same ACH ref under a different filename) replaces rather than
// duplicates.
export async function addWsrRemittance(rec) {
  const existing = await loadWsrRemittances()
  const filtered = existing.filter(r => r.checkNumber !== rec.checkNumber)
  filtered.push(rec)
  await idbSet(KEY_RECORDS, filtered)
  return filtered.sort((a, b) => (b.checkDate || '').localeCompare(a.checkDate || ''))
}

export async function deleteWsrRemittance(id) {
  const existing = await loadWsrRemittances()
  const filtered = existing.filter(r => r.id !== id)
  await idbSet(KEY_RECORDS, filtered)
  return filtered
}

export async function clearWsrRemittances() {
  try { await idbDel(KEY_RECORDS) } catch {}
}
