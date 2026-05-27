// Runtime SKU → brand lookup, backed by the generated catalogMap.json.
// Regenerate the JSON whenever a catalog .xlsx changes:
//
//   node scripts/build-catalog-map.js
//
// Matching strategy (confirmed with Tony 2026-05-19):
//   1. Exact match on the full SKU
//   2. Fallback: base-prefix match (everything before the first "-")
//      e.g. invoice line "N833200-001175" matches any catalog SKU
//      starting with "N833200-" and inherits its brand
//
// We do NOT use the first letter of the SKU as a heuristic. Both EIVY and
// Autumn SKUs start with "A"; both L1 and Nitro start with "N". The catalog
// is the only authority on which SKU belongs to which brand.

import catalogMap from './catalogMap.json' with { type: 'json' }

// Build case-insensitive maps once at module load.
const EXACT = {}        // upper(sku) -> { brandId, brandName, season }
const BY_BASE = {}      // upper(base prefix before first "-") -> { brandId, brandName, season }

for (const [sku, info] of Object.entries(catalogMap.skus)) {
  const key = sku.toUpperCase()
  EXACT[key] = info
  const base = key.split('-')[0]
  // Zero collisions are verified by the build script; first hit wins.
  if (base && !BY_BASE[base]) BY_BASE[base] = info
}

export const CATALOG_META = {
  generatedAt: catalogMap.generatedAt,
  season: catalogMap.season,
  totalSkus: catalogMap.totalSkus,
}

/**
 * Look up the brand for a SKU from an invoice line item.
 * Returns null when the SKU is missing or doesn't match the catalog —
 * the caller decides what to do (typically flag for manual review).
 */
export function lookupBrand(rawSku) {
  if (rawSku == null) return null
  const sku = String(rawSku).trim().toUpperCase()
  if (!sku) return null

  if (EXACT[sku]) return EXACT[sku]

  const base = sku.split('-')[0]
  if (base && BY_BASE[base]) return BY_BASE[base]

  return null
}

/**
 * Annotate a list of line items with brand info. Returns the items in the
 * same order, with a `brand` field added (or `null` if unmatched).
 * Each item must have a `sku` field (or `productName`/`product` as fallback).
 */
export function annotateLineItems(items) {
  return items.map((it) => {
    const sku = it.sku ?? it.productName ?? it.product
    const brand = lookupBrand(sku)
    return { ...it, brand }
  })
}
