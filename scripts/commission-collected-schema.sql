-- Commission attribution — "collected" schema (Stage 1, PR #2)
-- Stores the parsed cash-basis "Sales by Customer Detail" report: exactly what was
-- collected per line, resolved to brand, so commission is READ from QuickBooks
-- instead of inferred from Open-Balance deltas. Incremental — safe to re-run.
-- Populated by the `sync-collected` edge function. See docs/commission-attribution-spec.md.

-- ── One row per uploaded report (a payment period) ──────────────────────────
-- Re-uploading the same period_label replaces that period wholesale (the
-- edge function deletes the old period first; children cascade).
create table if not exists collected_periods (
  id            bigint generated always as identity primary key,
  period_label  text not null,                 -- e.g. "July 1-August 3, 2026" (from the report header)
  period_start  date,                           -- parsed from the label when possible
  period_end    date,
  source_file   text,
  grand_total   numeric,                        -- report's own TOTAL (for the audit trail)
  line_count    integer,
  uploaded_by   uuid references auth.users(id) default auth.uid(),
  synced_at     timestamptz not null default now(),
  unique (period_label)
);

-- ── One row per report line item (the paid portion) ─────────────────────────
create table if not exists collected_lines (
  id             bigint generated always as identity primary key,
  period_id      bigint not null references collected_periods(id) on delete cascade,
  customer       text,
  invoice        text,
  txn_date       date,                          -- the payment date (every row carries it)
  sku            text,
  description    text,
  brand          text,                          -- null for non-brand lines
  kind           text not null,                 -- brand | shipping | tax | interest | discount | rental | unmatched
  paid_amount    numeric not null default 0,    -- discounts arrive as their own negative lines
  season         text,
  -- Filled by the rep-routing / rating step (PR #4); null until then.
  rep_id         text,
  commissionable boolean not null default false,
  commission     numeric
);
create index if not exists collected_lines_period_idx   on collected_lines (period_id);
create index if not exists collected_lines_customer_idx on collected_lines (lower(customer));
create index if not exists collected_lines_invoice_idx  on collected_lines (invoice);
create index if not exists collected_lines_brand_idx    on collected_lines (brand);
create index if not exists collected_lines_rep_idx      on collected_lines (rep_id);

-- ── Review queue: brandable SKUs that didn't resolve to the catalog ──────────
create table if not exists collected_review (
  id           bigint generated always as identity primary key,
  period_id    bigint not null references collected_periods(id) on delete cascade,
  customer     text,
  invoice      text,
  sku          text,
  description  text,
  paid_amount  numeric,
  reason       text not null default 'unmatched_sku'
);
create index if not exists collected_review_period_idx on collected_review (period_id);

-- ── Convenience view: commissionable collected per (period, rep, brand) ──────
create or replace view collected_by_rep_brand as
select period_id, rep_id, brand,
       sum(paid_amount)              as collected,
       sum(coalesce(commission, 0))  as commission,
       count(*)                      as line_count
from collected_lines
where kind = 'brand'
group by period_id, rep_id, brand;

alter view collected_by_rep_brand set (security_invoker = on);

-- ── RLS: Foundry-wide commission data. Any authenticated user may READ; writes
--    happen only via the service role (the sync-collected edge function), which
--    bypasses RLS — so no insert/update/delete policies are granted here.
alter table collected_periods enable row level security;
alter table collected_lines   enable row level security;
alter table collected_review  enable row level security;

create policy "Authenticated can read collected_periods" on collected_periods for select using (auth.uid() is not null);
create policy "Authenticated can read collected_lines"   on collected_lines   for select using (auth.uid() is not null);
create policy "Authenticated can read collected_review"  on collected_review  for select using (auth.uid() is not null);
