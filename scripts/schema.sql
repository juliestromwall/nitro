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
  city text,
  state text,
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
  country text,
  year text,
  start_date date,
  end_date date,
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

-- ── Storage Buckets ────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

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
