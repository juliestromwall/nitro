# Spec (D): Payment-first commission spine

**Status:** proposal for review · **Author:** drafted 2026-07-22 · **Depends on:** A (real per-SKU seasons — done), B (`seasonOf`/`compareSeasons` — done)

## Why

Today the engine is **invoice-first**: it computes full commission from invoice line items, then treats cash as a correction (`paidFraction = (amount − openBalance)/amount`) and bolts a separate amount-matcher on to guess payment dates. That inversion is the root of every recurring problem:

- Credits and unapplied/overpayments leak into commission because `paidFraction` can't tell cash from a credit.
- The amount-matcher misses split/partial settlements (SI-127459) or mis-matches to coincidental old payments (wrong pre-anchor dates).
- The half-rate rule can't work, because it needs the **payment date** to know which season a line was earned in, and the engine doesn't have it.

**Commission is triggered by cash.** So payments must be the spine: cash drives *earned*, *available*, the *date*, and the *rate*.

## The key enabler: weekly Open-Balance deltas

The weekly "Invoices and Received Payments" export now carries an **Open Balance** column per invoice. The report doesn't link a payment to an invoice explicitly, but across weekly uploads the **drop in an invoice's Open Balance = exactly what was settled that week** — QuickBooks' own number, no amount-guessing.

> Store a per-invoice Open Balance snapshot on every upload. Each week, `settled_this_week = prevOpenBalance − newOpenBalance`. That delta is authoritative; the amount-matcher becomes a fallback only for history before the first snapshot.

Crucially, the delta yields a **date** (the upload/statement week) even for settlements that have **no discrete payment row** — e.g. an unapplied-overpayment draw-down. That's what finally makes SI-127459 resolvable.

## Settlement events

For each invoice, each week, classify the delta into one or more **settlement events**:

```
{ invoiceNum, date, amount, kind: 'cash' | 'credit' | 'unapplied', method }
```

Classification within the customer's block for that week:
1. A **Payment** row explains the delta (±$ tolerance) → `kind:'cash'`, `date` = payment date, `method` = Payment method column.
2. A **Credit Memo** explains it → `kind:'credit'` → **no commission** (product-return claw-back, if any, comes from the SC- doc's own line items).
3. Neither, but the balance still dropped → `kind:'unapplied'` (an earlier overpayment was applied). Reconcile against the customer's floating credit / check-deposits (Part E). Treat as cash-equivalent for commission (it *was* customer cash), dated to the settlement week (refine to the deposit date once E lands).
4. A single Payment covering several invoices → split across each invoice's delta.

## Commission integration

Per **cash** (or cash-equivalent unapplied) settlement event on an invoice:

```
portion        = event.amount / invoice.amount          # per-portion, straddle-safe
refSeason      = seasonOf(event.date)                   # season the cash landed in
for each line item on the invoice:
    isOlder    = compareSeasons(lineItem.skuSeason, refSeason) < 0
    rate       = isOlder ? baseRate * 0.5 : baseRate
    earned     = lineNet * rate * portion               # dated to event.date
```

- **Per-portion rating (locked 2026-07-22):** each payment slice is rated by *its own* date, so a July slice locks full and an October slice locks half on the same invoice.
- **Paid = locked, open = provisional:** a settled portion freezes at its event-date season. Any still-open remainder is rated against `seasonOf(today)` and re-evaluates each run until it settles — so open A26 auto-flips to half after 9/1 without touching already-paid portions.
- **Earned/Available (anchor math)** consumes these event dates instead of the matcher's guesses. The "paid-but-unmatched safety net" disappears — every paid invoice now has a dated settlement event.

## Storage (Supabase `portal_data` keys)

| Key | Shape | Purpose |
|-----|-------|---------|
| `invoice_balance_snapshots` | `{ [invoiceNum]: [{ asOf, openBalance }] }` | week-over-week deltas |
| `settlement_events` | `[{ invoiceNum, date, amount, kind, method }]` | derived; drives earned/available + rate |
| `check_deposits` | raw deposit rows (Part E) | overpayment / floating-credit source |
| `customer_credits` | `{ [customer]: runningUnappliedBalance }` (Part E) | classify `unapplied` events |

## Edge cases

- **First upload / pre-snapshot history:** no prior balance to diff. Baseline the current Open Balance; settlements before the first snapshot fall back to the existing amount-matcher. Deltas are correct forward-only.
- **SI-127459 walk-through:** week of 7/20 upload, SI-127459 Open Balance drops 868.28→0. Payment row = 400.28 (Check) → cash event dated 7/20. Residual 468 has no payment row → `unapplied` event, reconciled to the customer's prior overpayment → cash-equivalent. Both A26/A27... it's Autumn A26 on a 25-26 invoice → full rate → Andy earns the full $86.83, correctly dated.
- **Credit-settled invoice:** balance drops via a Credit Memo → `credit` event → no commission. If it's a product return with line items, the SC- doc supplies its own negative commission.
- **Straddling 9/1:** handled by per-portion event-date rating.
- **Overpayment never applied:** stays a floating credit (Part E), no commission until it settles an invoice.

## Rollout

1. **Now:** start persisting `invoice_balance_snapshots` on every weekly upload — begins accumulating the history the delta engine needs.
2. Build the settlement-event classifier (delta → events).
3. Re-point earned/available + the (now season-aware) rate onto settlement events; retire `paidFraction`-as-commission and the safety-net patch.
4. Layer Part E (check-deposits) to sharpen `unapplied` classification and surface floating credits in A/R.

## Open decisions

- **Unapplied draw-down date:** settlement week (simple, available now) vs. original deposit date (more correct, needs E). Recommend starting with the settlement week, refining with E.
- **Snapshot cadence:** one snapshot per upload vs. keep full history. Recommend full history (cheap, enables audit).
- **Tolerance** for "payment explains delta": reuse the current ±$5, or tighten now that we're within a single customer/week.
