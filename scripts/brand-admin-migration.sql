-- Brand Admin Migration
-- Run this in Supabase SQL Editor to add brand admin tables + policies

-- ── Brand Admin: Invites ──────────────────────────────────

create table brand_invites (
  id bigint generated always as identity primary key,
  rep_id uuid references auth.users(id) not null,
  company_id bigint references companies(id) not null,
  invite_code text not null unique,
  expires_at timestamptz not null,
  used boolean not null default false,
  used_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table brand_invites enable row level security;

create policy "Reps can view own invites"
  on brand_invites for select using (auth.uid() = rep_id);
create policy "Reps can create invites"
  on brand_invites for insert with check (auth.uid() = rep_id);
create policy "Reps can update own invites"
  on brand_invites for update using (auth.uid() = rep_id);

-- ── Brand Admin: Connections ─────────────────────────────

create table brand_connections (
  id bigint generated always as identity primary key,
  brand_admin_id uuid references auth.users(id) not null,
  rep_id uuid references auth.users(id) not null,
  company_id bigint references companies(id) not null,
  invite_code text,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  sharing_enabled boolean not null default true,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (brand_admin_id, rep_id, company_id)
);

alter table brand_connections enable row level security;

create policy "Brand admins can view own connections"
  on brand_connections for select using (auth.uid() = brand_admin_id);
create policy "Reps can view connections to them"
  on brand_connections for select using (auth.uid() = rep_id);
create policy "Reps can update connections to them"
  on brand_connections for update using (auth.uid() = rep_id);

-- ── Brand Admin: Uploads ─────────────────────────────────

create table brand_uploads (
  id bigint generated always as identity primary key,
  brand_admin_id uuid references auth.users(id) not null,
  rep_id uuid references auth.users(id) not null,
  company_id bigint references companies(id) not null,
  client_id bigint references clients(id),
  file_name text not null,
  file_path text not null,
  file_type text not null default 'invoice' check (file_type in ('invoice', 'order')),
  matched_order_id bigint references orders(id),
  status text not null default 'pending' check (status in ('pending', 'matched', 'created')),
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

alter table brand_uploads enable row level security;

create policy "Brand admins can view own uploads"
  on brand_uploads for select using (auth.uid() = brand_admin_id);
create policy "Brand admins can insert uploads"
  on brand_uploads for insert with check (auth.uid() = brand_admin_id);
create policy "Reps can view uploads to them"
  on brand_uploads for select using (auth.uid() = rep_id);

-- ── Brand Admin: Cross-user SELECT policies ──────────────
-- Allow brand admins to read connected reps' data (read-only)
-- Commissions are intentionally excluded.

create policy "Brand admins can view connected companies"
  on companies for select using (
    exists (
      select 1 from brand_connections bc
      where bc.brand_admin_id = auth.uid()
        and bc.rep_id = companies.user_id
        and bc.company_id = companies.id
        and bc.status = 'active'
        and bc.sharing_enabled = true
    )
  );

create policy "Brand admins can view connected clients"
  on clients for select using (
    exists (
      select 1 from brand_connections bc
      where bc.brand_admin_id = auth.uid()
        and bc.rep_id = clients.user_id
        and bc.status = 'active'
        and bc.sharing_enabled = true
    )
  );

create policy "Brand admins can view connected seasons"
  on seasons for select using (
    exists (
      select 1 from brand_connections bc
      where bc.brand_admin_id = auth.uid()
        and bc.rep_id = seasons.user_id
        and bc.company_id = seasons.company_id
        and bc.status = 'active'
        and bc.sharing_enabled = true
    )
  );

create policy "Brand admins can view connected orders"
  on orders for select using (
    exists (
      select 1 from brand_connections bc
      where bc.brand_admin_id = auth.uid()
        and bc.rep_id = orders.user_id
        and bc.company_id = orders.company_id
        and bc.status = 'active'
        and bc.sharing_enabled = true
    )
  );

-- Brand admins can view documents for connected reps
create policy "Brand admins can view connected documents"
  on storage.objects for select using (
    bucket_id = 'documents'
    and exists (
      select 1 from brand_connections bc
      where bc.brand_admin_id = auth.uid()
        and bc.rep_id::text = (storage.foldername(name))[1]
        and bc.status = 'active'
        and bc.sharing_enabled = true
    )
  );
