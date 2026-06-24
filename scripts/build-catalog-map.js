// Builds src/lib/catalogMap.json — a SKU → brand lookup table generated from
// the .xlsx files in catalogs/{season}/. Run after updating any catalog file:
//
//   node scripts/build-catalog-map.js
//
// Conventions per catalog (confirmed with Tony 2026-05-19; see memory file
// project_commission_framework.md):
//   - Autumn order form: Sheet1, header row 28, STYLE NUMBER at col 2
//   - All other catalogs: their named sheet, header row 0, SKU at col 7
//   - Nitro catalog includes sub-brands "Khola" and "Spark" — all map to NITRO
//   - Catalog SKUs are matched exact-first, then by longest-prefix fallback at
//     runtime (handled by src/lib/catalogs.js)

import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SEASON = '2025-26'
const CATALOGS_DIR = path.join(__dirname, '..', 'catalogs', SEASON)
const OUT_PATH = path.join(__dirname, '..', 'src', 'lib', 'catalogMap.json')

const CATALOGS = [
  { file: 'AUTUMN FW25.26 HEADWEAR ORDERFORM V1.3 (1).xlsx',   sheet: 'Sheet1',                  headerRow: 28, skuCol: 2, brandId: 'brand-autumn', brandName: 'Autumn/Corduroy' },
  { file: 'AUTUMN MTN COLLECTION FW25.26 ORDERFORM .V1.4.xlsx', sheet: 'Order Form',             headerRow: 28, skuCol: 2, brandId: 'brand-autumn', brandName: 'Autumn/Corduroy' },
  { file: '20252026 Autumn Spring.xlsx',                       sheet: '2025-2026 Autumn Spring', headerRow: 0,  skuCol: 8, brandId: 'brand-autumn', brandName: 'Autumn/Corduroy' },
  // Corduroy is a separate brand at the product level but rolls up under
  // Autumn for commission purposes per Tony's instruction (2026-06-24).
  { file: 'CORDUROY FW25 ORDERFORM V1.1.xlsx',                 sheet: 'FW25 Orderform',          headerRow: 9,  skuCol: 4, brandId: 'brand-autumn', brandName: 'Autumn/Corduroy' },
  // Older-season Autumn catalog (carry-over coverage)
  { file: 'AUTUMN FW24.25 ORDERFORM V1.4.xlsx',                sheet: 'Order Form',              headerRow: 27, skuCol: 2, brandId: 'brand-autumn', brandName: 'Autumn/Corduroy' },
  { file: 'AUTUMN FW22 ORDER FORM .xlsx',                      sheet: 'Order Form',              headerRow: 25, skuCol: 1, brandId: 'brand-autumn', brandName: 'Autumn/Corduroy' },
  { file: 'US - Eivy 25-26 V.1.0xlsx.xlsx',                    sheet: 'Eivy',         headerRow: 0,  skuCol: 7, brandId: 'brand-eivy',   brandName: 'EIVY' },
  // Older-season Eivy catalogs (carry-over coverage)
  { file: 'US - Eivy 24-25 v1.0.xls',                          sheet: 'FALL -  WINTER',   headerRow: 5, skuCol: 5, brandId: 'brand-eivy', brandName: 'EIVY' },
  { file: 'US - Eivy 24-25 v1.0.xls',                          sheet: 'SPRING -  SUMMER', headerRow: 5, skuCol: 5, brandId: 'brand-eivy', brandName: 'EIVY' },
  { file: '2023 Eivy USA v1.2.xlsx',                           sheet: 'Eivy 22-23 Drop One', headerRow: 0, skuCol: 1, brandId: 'brand-eivy', brandName: 'EIVY' },
  { file: '2023 Eivy USA v1.2.xlsx',                           sheet: 'Eivy 22-23 Drop Two', headerRow: 0, skuCol: 1, brandId: 'brand-eivy', brandName: 'EIVY' },
  { file: 'US - L1 25-26 V.1.0.xlsx',                          sheet: 'L1',           headerRow: 0,  skuCol: 7, brandId: 'brand-l1',     brandName: 'L1' },
  // Older-season L1 catalogs (carry-over coverage)
  { file: 'US - L1 24-25 V.1.xls',                             sheet: 'L1',           headerRow: 3,  skuCol: 4, brandId: 'brand-l1',     brandName: 'L1' },
  { file: '2023 L1 USA v1.3.xlsx',                             sheet: 'L1',           headerRow: 0,  skuCol: 1, brandId: 'brand-l1',     brandName: 'L1' },
  { file: 'US - Nitro 25-26 V.1.1xlsx.xlsx',                   sheet: 'Nitro',        headerRow: 0,  skuCol: 7, brandId: 'brand-nitro',  brandName: 'NITRO' },
  { file: 'US - Nitro Rental 25-26 V.1.0.xlsx',                sheet: 'Nitro Rental', headerRow: 0,  skuCol: 7, brandId: 'brand-nitro',  brandName: 'NITRO', isRental: true },
  // Older-season Nitro catalog covers carry-over SKUs (e.g. N832*) that
  // appear on current-season invoices but aren't in the 25-26 catalog.
  { file: 'US - Nitro 24-25 V.4.xlsx',                         sheet: 'Nitro',        headerRow: 4,  skuCol: 4, brandId: 'brand-nitro',  brandName: 'NITRO' },
  { file: 'USA - Nitro Rental 23.24.xls',                      sheet: 'USA RENTAL ORDER',         headerRow: 4, skuCol: 4, brandId: 'brand-nitro', brandName: 'NITRO', isRental: true },
  // Next-season (26-27) Nitro catalogs covering carry-over SKUs already
  // appearing on current invoices.
  { file: 'US - Nitro 2627 V1.1 (1).xlsx',                     sheet: '2026-2027 Nitro Snowboards', headerRow: 0, skuCol: 5, brandId: 'brand-nitro', brandName: 'NITRO' },
  { file: 'US - Nitro Rental 2627 V1.1 .xlsx',                 sheet: '2026-2027 Nitro Rental',     headerRow: 0, skuCol: 5, brandId: 'brand-nitro', brandName: 'NITRO', isRental: true },
  { file: 'US - Nitro Packages 2627 V1.1 .xlsx',               sheet: '2026-2027 Nitro Packages',   headerRow: 0, skuCol: 6, brandId: 'brand-nitro', brandName: 'NITRO' },
]

// Heuristic for "is this string a SKU?" — must have at least one letter and
// one digit, length >= 4, not match obvious non-SKU labels.
const NON_SKU_LABELS = new Set(['SKU', 'STYLE NUMBER', 'STYLE', 'UPC', 'BRAND'])
function looksLikeSku(raw) {
  if (raw == null) return false
  const s = String(raw).trim()
  if (s.length < 4) return false
  if (NON_SKU_LABELS.has(s.toUpperCase())) return false
  if (!/[A-Za-z]/.test(s)) return false
  if (!/\d/.test(s)) return false
  return true
}

const skus = {}
const collisions = []
const stats = {}

for (const cat of CATALOGS) {
  const filePath = path.join(CATALOGS_DIR, cat.file)
  if (!fs.existsSync(filePath)) {
    console.error(`MISSING: ${cat.file}`)
    process.exit(1)
  }
  const wb = XLSX.read(fs.readFileSync(filePath))
  const ws = wb.Sheets[cat.sheet]
  if (!ws) {
    console.error(`MISSING SHEET "${cat.sheet}" in ${cat.file}`)
    process.exit(1)
  }
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  let added = 0
  let skipped = 0
  for (let i = cat.headerRow + 1; i < matrix.length; i++) {
    const row = matrix[i]
    if (!row) continue
    const raw = row[cat.skuCol]
    if (!looksLikeSku(raw)) { skipped++; continue }
    const sku = String(raw).trim()
    const existing = skus[sku]
    if (existing && existing.brandId !== cat.brandId) {
      collisions.push({ sku, existing: existing.brandName, incoming: cat.brandName, file: cat.file })
      continue
    }
    if (existing) continue // duplicate within same brand → no-op
    const entry = { brandId: cat.brandId, brandName: cat.brandName, season: SEASON }
    if (cat.isRental) entry.isRental = true
    skus[sku] = entry
    added++
  }
  stats[cat.file] = { brand: cat.brandName, added, skippedRows: skipped }
}

const output = {
  generatedAt: new Date().toISOString(),
  season: SEASON,
  totalSkus: Object.keys(skus).length,
  collisions,
  skus,
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2))

console.log(`Wrote ${OUT_PATH}`)
console.log(`Total SKUs: ${output.totalSkus}`)
console.log(`Collisions (same SKU in different brands): ${collisions.length}`)
for (const [file, s] of Object.entries(stats)) {
  console.log(`  ${s.brand.padEnd(18)} ${String(s.added).padStart(5)} SKUs added (${s.skippedRows} non-SKU rows skipped) — ${file}`)
}
if (collisions.length) {
  console.log('\nCOLLISIONS (review these — same SKU appeared in multiple brands):')
  for (const c of collisions.slice(0, 20)) {
    console.log(`  ${c.sku}  ${c.existing} vs ${c.incoming}  in  ${c.file}`)
  }
  if (collisions.length > 20) console.log(`  ... and ${collisions.length - 20} more`)
}
