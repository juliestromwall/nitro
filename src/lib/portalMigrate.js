// One-time migration: push the datasets currently sitting in this browser
// (legacy IndexedDB rc_tony/kv + rc_tony_* localStorage) up to Supabase
// (portal_data). Run once from the browser that holds the data; afterwards
// every authorized login reads the same server copy.
//
// Reads the legacy locations DIRECTLY (not through the store modules, which
// now point at Supabase) so it can copy local → server.

import { pget, pset } from './portalStore'

// localStorage key → portal_data key
const LS_MAP = {
  rc_tony_invoices_v1: 'invoices',
  rc_tony_invoices_meta_v1: 'invoices_meta',
  rc_tony_commission_payouts_v1: 'commission_payouts',
  rc_tony_rep_territories_v1: 'rep_territories',
}

// IndexedDB rc_tony/kv keys — same name in portal_data.
const IDB_KEYS = [
  'line_items', 'line_items_meta',
  'payments_tx', 'payments_meta',
  'bp_invoice_overrides', 'bp_invoice_overrides_meta',
  'wsr_remittances',
  'ar_snapshots',
]

function openLegacyDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('rc_tony', 1)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGetRaw(db, key) {
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv', 'readonly').objectStore('kv').get(key)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function isEmpty(val) {
  if (val == null) return true
  if (Array.isArray(val)) return val.length === 0
  if (typeof val === 'object') return Object.keys(val).length === 0
  return false
}

async function pushOne(key, val, overwrite, result) {
  if (isEmpty(val)) { result.empty.push(key); return }
  if (!overwrite) {
    let existing
    try { existing = await pget(key) } catch { existing = undefined }
    if (!isEmpty(existing)) { result.skipped.push(key); return }
  }
  await pset(key, val)
  const count = Array.isArray(val) ? val.length : (typeof val === 'object' ? Object.keys(val).length : 1)
  result.pushed.push({ key, count })
}

// overwrite=false (default): only fill keys the server doesn't already have,
// so a re-run is safe and won't clobber server data. overwrite=true forces.
export async function migrateLocalToServer({ overwrite = false } = {}) {
  const result = { pushed: [], skipped: [], empty: [] }

  for (const [lsKey, portalKey] of Object.entries(LS_MAP)) {
    let val = null
    try { const raw = localStorage.getItem(lsKey); if (raw) val = JSON.parse(raw) } catch {}
    await pushOne(portalKey, val, overwrite, result)
  }

  let db = null
  try { db = await openLegacyDB() } catch {}
  if (db) {
    for (const key of IDB_KEYS) {
      let val = null
      try { val = await idbGetRaw(db, key) } catch {}
      await pushOne(key, val, overwrite, result)
    }
  }

  return result
}
