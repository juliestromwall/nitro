-- Published Payout Availability (accounting → rep)
-- =====================================================================
-- Accounting's portal computes, per rep:
--   available = startingAdjustment + earnedSinceAnchor − paidOutSinceAnchor
-- i.e. commission on invoices customers have ACTUALLY PAID, less what's been
-- paid out. Reps cannot see any of the inputs (invoices, payments, payouts),
-- so this table is how that single figure is handed to them.
--
-- Accounting publishes; the rep reads it and requests against it. One current
-- figure per (accounting, rep) — republishing overwrites, so the rep always
-- sees the latest rather than a growing history.
--
-- Requires accounting-connection-migration.sql and payout-requests-migration.sql.
-- Run once in the Supabase SQL Editor.
-- =====================================================================

create table if not exists rep_payout_availability (
  id bigint generated always as identity primary key,
  accounting_id uuid references auth.users(id) not null default auth.uid(),
  rep_id        uuid references auth.users(id) not null,

  amount_available numeric(12,2) not null default 0,
  as_of         date not null default current_date,   -- what the figure is good as of
  note          text,                                  -- optional context for the rep
  portal_rep_key text,                                 -- accounting's internal rep id, e.g. 'rep-rob'

  published_at timestamptz not null default now(),

  unique (accounting_id, rep_id)
);

create index if not exists rep_availability_rep_idx on rep_payout_availability (rep_id);

alter table rep_payout_availability enable row level security;

-- ── Rep side: read-only, and only their own figure ───────────────────
create policy "Reps can view their published availability"
  on rep_payout_availability for select using (auth.uid() = rep_id);

-- ── Accounting side ──────────────────────────────────────────────────
create policy "Accounting can view what they published"
  on rep_payout_availability for select using (auth.uid() = accounting_id);

-- Publishing requires an ACTIVE, sharing-enabled connection to that rep, so a
-- revoked rep stops receiving figures.
create policy "Accounting can publish to connected reps"
  on rep_payout_availability for insert with check (
    auth.uid() = accounting_id
    and exists (
      select 1 from accounting_connections ac
      where ac.accounting_id = auth.uid()
        and ac.rep_id = rep_payout_availability.rep_id
        and ac.status = 'active'
        and ac.sharing_enabled = true
    )
  );

create policy "Accounting can update what they published"
  on rep_payout_availability for update using (auth.uid() = accounting_id)
  with check (auth.uid() = accounting_id);

create policy "Accounting can withdraw what they published"
  on rep_payout_availability for delete using (auth.uid() = accounting_id);
