// Store for QuickBooks "Invoices & Received Payments" transaction exports.
// Persistence moved from browser-local IndexedDB to Supabase (see
// portalStore.js) so the data is shared across logins. Public API unchanged.

import { pget, pset, pdel } from './portalStore'

const KEY_TX = 'payments_tx'
const KEY_META = 'payments_meta'

export async function loadPaymentsTx() {
  try {
    const tx = await pget(KEY_TX)
    const meta = await pget(KEY_META)
    return { transactions: Array.isArray(tx) ? tx : [], meta: meta || null }
  } catch {
    return { transactions: [], meta: null }
  }
}

export async function savePaymentsTx(transactions, meta) {
  await pset(KEY_TX, transactions)
  await pset(KEY_META, meta)
}

export async function clearPaymentsTx() {
  try { await pdel(KEY_TX) } catch {}
  try { await pdel(KEY_META) } catch {}
}
