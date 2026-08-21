# Stage 1 Spec — Commission Attribution from Cash-Basis Sales Detail

**Goal:** compute each rep's commission from **what QuickBooks actually collected**,
read directly from the cash-basis "Sales by Customer Detail" report — replacing the
inferred, multi-invoice-prone attribution in the current settlement engine.

Status: **parser proven on real data (2026-08-03), not yet built into the app.**

---

## 1. Why this approach

The payment-first engine attributes commission by *inferring* which invoice a
payment settled — from week-over-week **Open Balance drops** plus a greedy
"assign the newest payment to the biggest drop first" rule (`settlementEngine.js`
`classifyDrop`). That inference is fine for one-payment-one-invoice, but **misfires
on multi-invoice payments** and collapses entirely when snapshot history is lost.

**Proven failure (Scotty's Ride Shop, 8/1/2026):** a $1,000 payment that actually
split four ways was attributed **100% to one invoice / one rep** (Carter/Autumn),
dropping the $402.81 NITRO slice owed to Steve Clare. See
[[project_payment_application_bug]].

QuickBooks already *knows* the true split. The cash-basis **Sales by Customer
Detail** report states it outright, at line-item granularity. So Stage 1 switches
commission attribution from **infer** to **read**.

**What stays / what changes:**
- **Keep** the payment-first snapshot spine for **A/R aging, "available," and the
  freeze/anchor model** ([[project_payment_first]], [[project_ar_aging_ingest]]).
- **Replace** the delta-inference *for commission attribution only* with this
  report. No more greedy multi-invoice guessing.

---

## 2. The data source

**QBO report:** *Sales by Customer Detail*, **cash/payment basis**, date range =
the commission period (weekly). Produced weekly (confirmed repeatable).
Sample: `Invoice data/7.1 - 8.1, Inc_Sales by Customer Detail (1).csv`.

Every row is dated to the **payment date**, and the **Amount** column is the
**paid portion** of that line — so the report is literally "what was collected this
period, per line item," already resolved to SKU.

### CSV format (validated)
- Lines 1-3: title block — company, `Sales by Customer Detail`, date range.
- Header row: `,Transaction date,Transaction type,Num,Product/Service full name,Description,Quantity,Sales price,Amount,Balance` (col A blank = grouping col).
- **Customer sections**: group-header row (customer in col A, rest blank) → line rows (col A blank, col B a date, type `Invoice`) → `Total for <customer>,,,,,,<qty>,,<$amount>,` subtotal.
- Grand `TOTAL,,,,,,<qty>,,<$amount>,` then a timestamp footer.
- Amounts: quoted, `$`, commas, negatives → strip `[$,\s]`, parseFloat.

### Column map (per line row)
| idx | field | use |
|----|-------|-----|
| 1 | Transaction date | = payment date |
| 2 | Transaction type | `Invoice` |
| 3 | Num | invoice # |
| 4 | Product/Service full name | **SKU** for brand lookup |
| 5 | Description | line classification hints |
| 8 | **Amount** | **paid portion (the commission input)** |
| 9 | Balance | running total (validation only) |

---

## 3. Parser rules (validated to the penny)

Reference implementation: scratchpad `parse-sales-detail.cjs` — reproduced QBO's
per-customer + grand totals exactly (29 customers, 0 mismatches, $7,192.64).

Per line, classify by SKU (→ `catalogMap.json`, same exact/base-prefix rule as
`src/lib/catalogs.js`) and description:

1. **Brand line** — SKU resolves → attribute `Amount` to that brand.
2. **Discount** (`Discount Item`, negative) — **allocate to its invoice's brand**,
   netting the commissionable base. *(Scotty's SI-125930: NITRO $671.35 − $268.54
   discount = **$402.81** commissionable.)* This is the one refinement beyond the
   proof parser.
3. **Shipping / Sales Tax / Interest-fee** — **excluded** from commission.
4. **Rental / Parts** (`NP…` SKUs, no catalog match) — route via the **rental
   split** rules, not brand rate (5% Adam + 5% territory NITRO rep, minus customer
   overrides — see `commissionRules.js` RENTAL_SPLIT).
5. **Unmatched brandable SKU** — flag for review (don't silently drop).

Then apply, per brand line:
- **Rate** from the layered model (customer+brand → rep+brand → brand default).
- **Season half-rate** — carry-over SKUs older than the payment's season at 0.5×,
  judged at the payment date ([[project_season_half_rate]]). *(Scotty's LECTRA
  BRUSH = NITRO 2024-25 → half rate.)*

Commission per line = `commissionableAmount × rate × seasonMultiplier`.

---

## 4. Rep routing

Attribute each brand's collected amount to the rep via the **existing** territory +
brand config (`REP_TERRITORIES`, `REP_BRANDS` in `paymentsDemoData.js`) — routing
itself is already correct and needs no change:
- Match the report's customer → app account (fuzzy name match, reuse the
  `PaymentsTracker` normalizer) → territory.
- (territory, brand) → rep. *(SOCAL/AZ: Autumn → Carter Katz; NITRO/L1/EIVY →
  Steve Clare.)*
- Keep WSR recovery for renamed member invoices ([[project_payment_first]]).

---

## 5. Data model

> **Superseded (2026-08).** The original plan below stored collected lines in
> dedicated Supabase tables (`collected_periods` / `collected_lines` /
> `collected_review`) written by a `sync-collected` edge function. Shipped
> implementation instead persists the accumulated, de-duped lines to the shared
> **portal KV store** (`public.portal_data`, via `src/lib/collectedStore.js`) —
> same durability, no bespoke schema or function. The `collected_*` schema and
> the `sync-collected` function were removed as dead code; sections 5–6 and
> build steps 2–3 are kept for historical context only.

Original design (server-side Supabase tables, RLS on) so ingested data survives
disk/browser loss — the failure that wiped IndexedDB and started this whole
investigation.

| Table | Purpose | Grain |
|---|---|---|
| `collected_lines` | one row per report line: period, customer, invoice, sku, brand, paid_amount, class (brand/shipping/tax/interest/discount/rental), rep_id, commissionable, commission | per line item |
| `collected_periods` | one row per uploaded report: date range, file, grand total, synced_at | per upload |
| `collected_review` | unmatched SKUs / unmatched customers flagged for a human | per issue |

Rollups (per rep per period) are a view over `collected_lines`.

---

## 6. Ingestion flow

1. **Upload slot** "Commission — collected (weekly)" on Data Uploads (same pattern
   as existing uploaders).
2. Parse → classify → route → **write to Supabase** (service-role edge function,
   like `sync-sica`), append-by-period (never silently replace).
3. Surface `collected_review` items (unmatched SKU/customer) as a banner.
4. Commission view reads the per-rep-per-period rollup.

**Weekly routine:** export cash-basis Sales by Customer Detail → upload → done.

---

## 7. Validation

Same bar as the A/R aging parser: on every upload, assert **parsed per-customer
and grand totals == the report's own `Total for…` / `TOTAL` rows** to the penny;
refuse/flag on mismatch. Spot-check Scotty's 8/1 = $379.29 Autumn + $402.81 NITRO
(net) + $146.25 rental + excluded shipping/interest.

---

## 8. Build order (PRs)

1. **Parser + validation** (port `parse-sales-detail.cjs` into the app lib; add
   discount→brand allocation; unit-test against the sample file).
2. **Schema + edge function** — Supabase tables + `sync-collected` writer.
3. **Upload slot** wired to the function.
4. **Rep routing + rate/season/rental** applied → per-rep-per-period rollup.
5. **Commission view** reads the rollup; retire the greedy attribution for this path.

---

## Open questions

1. **Discount allocation** when an invoice spans multiple brands — split the
   discount pro-rata across the invoice's brand lines? (Scotty's case is single-brand.)
2. **Rental SKU catalog** — confirm the `NP…` → rental mapping and the split rule
   per customer.
3. **Period boundaries** — align the report's date range to the payout cycle so
   nothing is double-counted or missed between weekly uploads.
4. **Cash vs accrual** — confirm the report is always run **cash basis** (accrual
   would show invoiced, not collected, breaking the model).
