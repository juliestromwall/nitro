-- Accounting ↔ Rep Connection Migration
-- =====================================================================
-- Model A: reps own their data. An accounting user connects to a rep and
-- gets READ access to that rep's companies / clients / seasons / orders /
-- commissions / documents via cross-user RLS (the brand_admin pattern,
-- but rep-wide instead of per-company, and commissions ARE included since
-- accounting releases commission reports).
--
-- Direction: ACCOUNTING invites the REP. Accounting generates an invite
-- link; the rep opens it (logged in) and the connection is created active.
--
-- Write capabilities (drop invoices in, mark AR paid, release reports) are
-- NOT granted here — they arrive with their own feature migrations so this
-- backbone stays read-only and low-risk.
--
-- Run once in the Supabase SQL Editor.
-- =====================================================================

-- ── Invites (accounting → rep) ───────────────────────────────────────

create table accounting_invites (
  id bigint generated always as identity primary key,
  accounting_id uuid references auth.users(id) not null,
  rep_email text,                       -- who it's intended for (display only)
  invite_code text not null unique,
  expires_at timestamptz not null,
  used boolean not null default false,
  used_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table accounting_invites enable row level security;

create policy "Accounting can view own invites"
  on accounting_invites for select using (auth.uid() = accounting_id);
create policy "Accounting can create invites"
  on accounting_invites for insert with check (auth.uid() = accounting_id);
create policy "Accounting can update own invites"
  on accounting_invites for update using (auth.uid() = accounting_id);
-- Validation + marking `used` happens in the accept edge function (service role).

-- ── Connections (accounting ↔ rep) ───────────────────────────────────

create table accounting_connections (
  id bigint generated always as identity primary key,
  accounting_id uuid references auth.users(id) not null,
  rep_id uuid references auth.users(id) not null,
  invite_code text,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  sharing_enabled boolean not null default true,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (accounting_id, rep_id)
);

alter table accounting_connections enable row level security;

create policy "Accounting can view own connections"
  on accounting_connections for select using (auth.uid() = accounting_id);
create policy "Reps can view connections to them"
  on accounting_connections for select using (auth.uid() = rep_id);
-- Accounting can revoke; rep can toggle sharing off. Row created by the
-- accept edge function (service role), so no INSERT policy is needed.
create policy "Accounting can update own connections"
  on accounting_connections for update using (auth.uid() = accounting_id);
create policy "Reps can update connections to them"
  on accounting_connections for update using (auth.uid() = rep_id);

-- ── Cross-user SELECT policies (accounting reads connected rep data) ──
-- Gated on an ACTIVE, sharing-enabled connection where the row's owner
-- (user_id) is the connected rep.

create policy "Accounting can view connected companies"
  on companies for select using (
    exists (
      select 1 from accounting_connections ac
      where ac.accounting_id = auth.uid()
        and ac.rep_id = companies.user_id
        and ac.status = 'active'
        and ac.sharing_enabled = true
    )
  );

create policy "Accounting can view connected clients"
  on clients for select using (
    exists (
      select 1 from accounting_connections ac
      where ac.accounting_id = auth.uid()
        and ac.rep_id = clients.user_id
        and ac.status = 'active'
        and ac.sharing_enabled = true
    )
  );

create policy "Accounting can view connected seasons"
  on seasons for select using (
    exists (
      select 1 from accounting_connections ac
      where ac.accounting_id = auth.uid()
        and ac.rep_id = seasons.user_id
        and ac.status = 'active'
        and ac.sharing_enabled = true
    )
  );

create policy "Accounting can view connected orders"
  on orders for select using (
    exists (
      select 1 from accounting_connections ac
      where ac.accounting_id = auth.uid()
        and ac.rep_id = orders.user_id
        and ac.status = 'active'
        and ac.sharing_enabled = true
    )
  );

-- Difference from brand_admin: accounting DOES see commissions.
create policy "Accounting can view connected commissions"
  on commissions for select using (
    exists (
      select 1 from accounting_connections ac
      where ac.accounting_id = auth.uid()
        and ac.rep_id = commissions.user_id
        and ac.status = 'active'
        and ac.sharing_enabled = true
    )
  );

-- Documents live under a rep_id-prefixed path in the `documents` bucket.
create policy "Accounting can view connected documents"
  on storage.objects for select using (
    bucket_id = 'documents'
    and exists (
      select 1 from accounting_connections ac
      where ac.accounting_id = auth.uid()
        and ac.rep_id::text = (storage.foldername(name))[1]
        and ac.status = 'active'
        and ac.sharing_enabled = true
    )
  );
