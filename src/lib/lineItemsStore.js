// Store for invoice line items. Persistence moved from browser-local
// IndexedDB to Supabase (see portalStore.js) so the data is shared across
// logins. Public API unchanged: loadLineItems / saveLineItems / clearLineItems.

import { pget, pset, pdel } from './portalStore'

const KEY_ITEMS = 'line_items'
const KEY_META = 'line_items_meta'

export async function loadLineItems() {
  try {
    const items = await pget(KEY_ITEMS)
    const meta = await pget(KEY_META)
    return { items: Array.isArray(items) ? items : [], meta: meta || null }
  } catch {
    return { items: [], meta: null }
  }
}

export async function saveLineItems(rows, meta) {
  await pset(KEY_ITEMS, rows)
  await pset(KEY_META, meta)
}

export async function clearLineItems() {
  try { await pdel(KEY_ITEMS) } catch {}
  try { await pdel(KEY_META) } catch {}
}
