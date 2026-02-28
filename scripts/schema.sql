-- Nitro Sales Tracker — Supabase Schema
-- Run this in Supabase SQL Editor to set up the database

-- ── Companies ──────────────────────────────────────────────

create table companies (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) not null default auth.uid(),
  name text not null,
  commission_percent numeric(5,2) not null default 0,
  logo_path text,
  archived boolean not null default false,
  sort_order integer not null default 0,
  order_types text[] default '{}',
  items text[] default '{}',
  stages text[] default '{}',
  category_commissions jsonb default '{}',
  created_at timestamptz not null default now()
);

alter table companies enable row level security;

create policy "Users can view own companies"   on companies for select using (auth.uid() = user_id);
create policy "Users can insert own companies" on companies for insert with check (auth.uid() = user_id);
create policy "Users can update own companies" on companies for update using (auth.uid() = user_id);
create policy "Users can delete own companies" on companies for delete using (auth.uid() = user_id);

-- ── Clients ────────────────────────────────────────────────

create table clients (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) not null default auth.uid(),
  name text not null,
  account_number text,
  region text,
  type text,
  address text,
  city text,
  state text,
  zip text,
  created_at timestamptz not null default now()
);

alter table clients enable row level security;

create policy "Users can view own clients"   on clients for select using (auth.uid() = user_id);
create policy "Users can insert own clients" on clients for insert with check (auth.uid() = user_id);
create policy "Users can update own clients" on clients for update using (auth.uid() = user_id);
create policy "Users can delete own clients" on clients for delete using (auth.uid() = user_id);

-- ── Seasons ────────────────────────────────────────────────

create table seasons (
  id text primary key,
  user_id uuid references auth.users(id) not null default auth.uid(),
  label text not null,
  company_id bigint references companies(id),
  country text,
  year text,
  start_date date,
  end_date date,
  sale_cycle text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table seasons enable row level security;

create policy "Users can view own seasons"   on seasons for select using (auth.uid() = user_id);
create policy "Users can insert own seasons" on seasons for insert with check (auth.uid() = user_id);
create policy "Users can update own seasons" on seasons for update using (auth.uid() = user_id);
create policy "Users can delete own seasons" on seasons for delete using (auth.uid() = user_id);

-- ── Orders ─────────────────────────────────────────────────

create table orders (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) not null default auth.uid(),
  client_id bigint references clients(id) not null,
  company_id bigint references companies(id) not null,
  season_id text references seasons(id) not null,
  order_type text not null default 'Rental',
  items text[] default '{}',
  order_number text,
  invoice_number text,
  close_date text,
  stage text not null default 'Prospecting',
  total numeric(12,2) not null default 0,
  commission_override numeric(5,2),
  sale_type text not null default 'Prebook',
  order_document jsonb,
  invoice_document jsonb,
  invoices jsonb default '[]',
  notes text,
  created_at timestamptz not null default now()
);

alter table orders enable row level security;

create policy "Users can view own orders"   on orders for select using (auth.uid() = user_id);
create policy "Users can insert own orders" on orders for insert with check (auth.uid() = user_id);
create policy "Users can update own orders" on orders for update using (auth.uid() = user_id);
create policy "Users can delete own orders" on orders for delete using (auth.uid() = user_id);

-- ── Commissions ────────────────────────────────────────────

create table commissions (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) not null default auth.uid(),
  order_id bigint references orders(id) not null unique,
  commission_due numeric(12,2) not null default 0,
  pay_status text not null default 'pending invoice',
  amount_paid numeric(12,2) not null default 0,
  paid_date text,
  amount_remaining numeric(12,2) not null default 0,
  payments jsonb default '[]',
  created_at timestamptz not null default now()
);

alter table commissions enable row level security;

create policy "Users can view own commissions"   on commissions for select using (auth.uid() = user_id);
create policy "Users can insert own commissions" on commissions for insert with check (auth.uid() = user_id);
create policy "Users can update own commissions" on commissions for update using (auth.uid() = user_id);
create policy "Users can delete own commissions" on commissions for delete using (auth.uid() = user_id);

-- ── Todos ──────────────────────────────────────────────────

create table todos (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) not null default auth.uid(),
  company_id bigint references companies(id) not null,
  client_id bigint references clients(id),
  title text not null,
  note text,
  phone text,
  due_date date,
  completed boolean not null default false,
  completed_at date,
  pinned boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table todos enable row level security;

create policy "Users can view own todos"   on todos for select using (auth.uid() = user_id);
create policy "Users can insert own todos" on todos for insert with check (auth.uid() = user_id);
create policy "Users can update own todos" on todos for update using (auth.uid() = user_id);
create policy "Users can delete own todos" on todos for delete using (auth.uid() = user_id);

-- ── Subscriptions ─────────────────────────────────────────

create table subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) not null unique,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  plan text not null default 'free',
  status text not null default 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table subscriptions enable row level security;

create policy "Users can view own subscription"
  on subscriptions for select using (auth.uid() = user_id);

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
  season_id text references seasons(id),
  status text not null default 'pending' check (status in ('pending', 'matched', 'created', 'unmatched', 'reviewed', 'dismissed')),
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
create policy "Reps can update uploads to them"
  on brand_uploads for update using (auth.uid() = rep_id);

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

-- ── Storage Buckets ────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Storage policies for avatars (public bucket)
create policy "Users can upload avatars"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can update own avatars"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete own avatars"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Anyone can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Storage policies for logos (public bucket)
create policy "Users can upload logos"
  on storage.objects for insert
  with check (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can update own logos"
  on storage.objects for update
  using (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete own logos"
  on storage.objects for delete
  using (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Anyone can view logos"
  on storage.objects for select
  using (bucket_id = 'logos');

-- Storage policies for documents (private bucket)
create policy "Users can upload documents"
  on storage.objects for insert
  with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can view own documents"
  on storage.objects for select
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can update own documents"
  on storage.objects for update
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete own documents"
  on storage.objects for delete
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
