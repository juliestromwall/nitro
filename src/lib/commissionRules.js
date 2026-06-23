// Commission rules for the Tony portal.
//
// Older-season products are paid at HALF the resolved rate for all reps and
// all brands. The engine determines "older" by comparing each SKU's catalog
// season (from catalogMap.json) to CURRENT_SEASON below. Flip CURRENT_SEASON
// when starting a new selling season — every 2025-26 SKU automatically
// becomes "older" at half rate.
export const CURRENT_SEASON = '2025-26'

// Layered model — most specific wins at lookup time:
//   1. Customer + Rep + Brand override   (CUSTOMER_OVERRIDES, rare)
//   2. Customer + Brand override         (CUSTOMER_OVERRIDES, common — e.g. Backcountry.com)
//   3. Rep + Brand rate                  (REP_RATES — the bulk of the data)
//   4. Brand default                     (BRAND_DEFAULTS)
//
// Rental invoices (SKU comes from the Nitro Rental catalog) get split:
//   - Default: 5% to Adam + 5% to the territory NITRO rep
//   - Customer-override exception: 10% to Adam, 0% to territory rep
// See RENTAL_SPLIT below.
//
// All rates stored as decimals (0.08 == 8%).
// All structures keyed by season so 2025-26 invoices keep their season's rate
// even after we update for 2026-27.

// ============================================================
// Brand defaults — flat rate paid to the territory rep when no per-rep rate
// is set. Used for brands that pay everyone the same rate.
// ============================================================
// Shape: { [season]: { [brandId]: rate } }
export const BRAND_DEFAULTS = {
  '2025-26': {
    // Autumn/Corduroy: flat 10% to every territory rep, no per-rep variation.
    'brand-autumn': 0.10,
  },
}

// ============================================================
// Rep × Brand rates (per season)
// ============================================================
// Shape: { [season]: { [repId]: { [brandId]: rate } } }
export const REP_RATES = {
  '2025-26': {
    // Note: Autumn/Corduroy rates are NOT listed per-rep — they live in
    // BRAND_DEFAULTS at a flat 10% for everyone. Add per-rep Autumn entries
    // only if a rep needs an explicit non-default rate (none today).
    'rep-rob': {
      'brand-nitro':  0.08,
      'brand-l1':     0.08,
      'brand-eivy':   0.08,
    },
    'rep-jason': {
      'brand-nitro':  0.07,
      'brand-l1':     0.07,
    },
    'rep-kathy-karlovic': {
      'brand-eivy':   0.07,
    },
    'rep-steve-clare': {
      'brand-nitro':  0.07,
      'brand-l1':     0.07,
      'brand-eivy':   0.07,
    },
    // rep-carter-katz: Autumn-only — covered by BRAND_DEFAULTS
    'rep-andy-wise': {
      'brand-nitro':  0.07,
      'brand-l1':     0.07,
    },
    'rep-erika-lowder': {
      'brand-eivy':   0.07,
    },
    'rep-cody-prudoehl': {
      'brand-nitro':  0.08,
      'brand-l1':     0.08,
    },
    // rep-brian-kulak: Autumn-only — covered by BRAND_DEFAULTS
    'rep-kim-kulak': {
      'brand-eivy':   0.07,
    },
    'rep-jj-catlett': {
      'brand-nitro':  0.07,
      'brand-l1':     0.07,
      'brand-eivy':   0.07,
    },
    // rep-harrison-montgomery: Autumn-only — covered by BRAND_DEFAULTS
    'rep-dave-spruill': {
      'brand-nitro':  0.08,
      'brand-l1':     0.08,
      'brand-eivy':   0.08,
    },
    // rep-chris-cooper: Autumn-only — covered by BRAND_DEFAULTS
    // rep-evan-ricker: Autumn-only — covered by BRAND_DEFAULTS
    'rep-trevor-stockhausen': {
      'brand-nitro':  0.07,
      'brand-l1':     0.07,
      'brand-eivy':   0.07,
    },
    // Adam Stromwall is intentionally NOT listed in REP_RATES. His NITRO
    // rental commission lives in RENTAL_SPLIT.adamRate (5%) — that is the
    // single source of truth. Adam has no non-rental NITRO rate; non-rental
    // NITRO commissions go to the territory rep.
  },
}

// ============================================================
// Customer overrides — per-customer rate and/or routing overrides
// ============================================================
// Shape: {
//   [season]: {
//     [customerName]: {                  // EXACT match on invoice Customer field
//       [brandId]: { rate?, repId?, rentalAdamFullCut? }
//     }
//   }
// }
// Matching: EXACT match on the customer name as it appears on the invoice.
//   Variants ("REI Co-Op", "REI Berkeley", etc.) should be FLAGGED by the
//   commission engine for manual review — don't auto-apply the override.
//
// Field semantics (all optional, mix and match):
//   rate?              — Use this rate instead of the rep's normal rate. If
//                        absent, use the credited rep's normal rate for that
//                        brand from REP_RATES.
//   repId?             — Route the commission to this rep, bypassing territory
//                        routing. If absent, normal territory routing applies.
//                        For NITRO Rental: when 'brand-nitro' has a repId
//                        override, that rep also takes the 5% territory-rep
//                        slice in the rental split (Adam still gets his 5%).
//   splitByTerritory?  — Array of territory names. Commission for non-rental
//                        invoices is split equally among the brand's reps in
//                        those territories. Each rep gets THEIR OWN normal
//                        rate applied to their share of the invoice (Option A).
//                        Keyed by territory (not rep id) so the rule survives
//                        rep turnover. Does NOT affect rental commissions —
//                        rental invoices at this customer fall through to the
//                        regular RENTAL_SPLIT rule.
//   rentalAdamFullCut? — true for the "Adam gets the full 10%" NITRO Rental
//                        exception (territory rep gets 0%).
export const CUSTOMER_OVERRIDES = {
  '2025-26': {
    'REI': {
      'brand-nitro': { rate: 0.06 },
    },
    'BACKCOUNTRY.COM': {
      'brand-nitro': { rate: 0.06 },
    },
    'CRE MNGMNT DBA MILOSPORT - SLC': {
      'brand-nitro': { rate: 0.05 },
    },
    'WAVE RAVE': {
      'brand-nitro':  { repId: 'rep-jason' },
      'brand-l1':     { repId: 'rep-jason' },
      'brand-autumn': { repId: 'rep-carter-katz' },
      'brand-eivy':   { repId: 'rep-kathy-karlovic' },
    },
    'Big Sky Distribution Center (WSR)': {
      'brand-nitro':  { splitByTerritory: ['PNW', 'MIDWEST PLAINS'] },
    },
  },
}

// ============================================================
// Rental split (NITRO Rental catalog SKUs only)
// ============================================================
export const RENTAL_SPLIT = {
  '2025-26': {
    'brand-nitro': {
      adamRate:        0.05, // Adam's slice on a standard rental invoice
      territoryRate:   0.05, // territory NITRO rep's slice
      adamFullCutRate: 0.10, // for customer-override exceptions
    },
  },
}

// ============================================================
// Older-product rates (lower rate for prior-year SKUs)
// ============================================================
// TODO — Tony to define: identifier (SKU year prefix? season tag?) + rate.
export const OLDER_PRODUCT_RULES = {
  '2025-26': {
    // example shape (placeholder):
    // 'brand-nitro': { match: { skuPrefix: 'N82' }, rate: 0.05 }
  },
}
