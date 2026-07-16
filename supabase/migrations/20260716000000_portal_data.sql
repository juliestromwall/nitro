-- Shared key/value store for the Tony/Accounting commission portal.
-- Mirrors the browser-local stores (IndexedDB rc_tony/kv + rc_tony_* localStorage
-- keys) so the same datasets are visible to every authorized login on any
-- machine instead of being trapped in one browser.
--
-- One row per dataset (key), value is the whole JSON blob for that dataset
-- (invoices, line_items, payments_tx, wsr_remittances, commission_payouts, …).

create table if not exists public.portal_data (
  key         text primary key,
  value       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

alter table public.portal_data enable row level security;

-- Full read + write for portal operator roles (Tony = brand_admin,
-- accounting@foundrydist.com = accounting, plus admins/managers). Everyone
-- else is denied by default (RLS on, no matching policy).
drop policy if exists portal_data_rw on public.portal_data;
create policy portal_data_rw on public.portal_data
  for all
  to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role')
      in ('master_admin', 'admin', 'brand_admin', 'accounting', 'manager')
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role')
      in ('master_admin', 'admin', 'brand_admin', 'accounting', 'manager')
  );

-- Keep updated_at current on every write.
create or replace function public.portal_data_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists portal_data_touch on public.portal_data;
create trigger portal_data_touch
  before insert or update on public.portal_data
  for each row execute function public.portal_data_touch();
