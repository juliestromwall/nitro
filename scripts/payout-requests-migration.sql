-- Commission Payout Requests (rep → connected accounting)
-- =====================================================================
-- A rep asks their connected accounting user to pay out commission. The rep
-- can only see what THEY think they're owed (order total x brand rate); the
-- accounting side is the authority on what is actually ELIGIBLE, because
-- eligibility depends on what the customer has actually PAID — that lives in
-- accounting's payments/settlement data, which reps cannot see.
--
-- So the request carries the rep's asking figure, and accounting responds with
-- an approved figure (which may be lower) plus a note. Nothing here moves money;
-- it records the conversation and its outcome.
--
-- Requires accounting-connection-migration.sql (accounting_connections).
-- Run once in the Supabase SQL Editor.
-- =====================================================================

create table if not exists payout_requests (
  id bigint generated always as identity primary key,
  rep_id uuid references auth.users(id) not null default auth.uid(),
  accounting_id uuid references auth.users(id) not null,
  connection_id bigint references accounting_connections(id) on delete set null,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'paid', 'cancelled')),

  -- What the rep asked for, and what accounting actually approved. Approved is
  -- null until accounting responds, and may be less than requested when some of
  -- the underlying invoices haven't been paid yet.
  amount_requested numeric(12,2) not null check (amount_requested > 0),
  amount_approved  numeric(12,2) check (amount_approved >= 0),

  season_label text,                 -- e.g. '2026-2027', for context
  note          text,                -- rep's message
  response_note text,                -- accounting's message

  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  paid_at      timestamptz
);

create index if not exists payout_requests_rep_idx on payout_requests (rep_id, requested_at desc);
create index if not exists payout_requests_accounting_idx on payout_requests (accounting_id, status);

-- At most one OPEN request per rep↔accounting pair, so a rep can't spam a queue.
create unique index if not exists payout_requests_one_open
  on payout_requests (rep_id, accounting_id)
  where status = 'pending';

alter table payout_requests enable row level security;

-- ── Rep side ─────────────────────────────────────────────────────────
create policy "Reps can view own payout requests"
  on payout_requests for select using (auth.uid() = rep_id);

-- A rep may only raise a request against an ACTIVE, sharing-enabled connection.
create policy "Reps can create own payout requests"
  on payout_requests for insert with check (
    auth.uid() = rep_id
    and exists (
      select 1 from accounting_connections ac
      where ac.rep_id = auth.uid()
        and ac.accounting_id = payout_requests.accounting_id
        and ac.status = 'active'
        and ac.sharing_enabled = true
    )
  );

-- Reps can withdraw their own request, but only while it is still pending —
-- they must not be able to rewrite an answered one.
create policy "Reps can cancel own pending requests"
  on payout_requests for update using (
    auth.uid() = rep_id and status = 'pending'
  ) with check (
    auth.uid() = rep_id and status in ('pending', 'cancelled')
  );

-- ── Accounting side ──────────────────────────────────────────────────
create policy "Accounting can view requests sent to them"
  on payout_requests for select using (auth.uid() = accounting_id);

-- Accounting responds (approve / reject / mark paid). The connection must still
-- be active, so revoking a rep also stops further action on their requests.
create policy "Accounting can respond to their requests"
  on payout_requests for update using (
    auth.uid() = accounting_id
    and exists (
      select 1 from accounting_connections ac
      where ac.accounting_id = auth.uid()
        and ac.rep_id = payout_requests.rep_id
        and ac.status = 'active'
    )
  ) with check (auth.uid() = accounting_id);
