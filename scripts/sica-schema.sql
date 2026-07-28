-- SICA (Sports Industry Credit Association) integration schema
-- Incremental migration — safe to run on the live DB (uses IF NOT EXISTS).
-- Populated by the `sync-sica` edge function (service role); read by the
-- Collections page. See docs/sica-integration-spec.md.

-- ── Retailers: identity + the join key back to Foundry accounts ─────────────
create table if not exists sica_retailers (
  retailer_id           bigint primary key,          -- SICA retailerID (stable)
  sica_account_number   text,                         -- SICA's own account number
  member_account_number text,                         -- Foundry's account # for this retailer (JOIN KEY)
  legal_name            text,
  dba                   text,                          -- "doing business as" (dbA1)
  city                  text,
  province_code         text,
  country_id            smallint,                      -- 1 = Canada, 2 = USA
  updated_at            timestamptz not null default now()
);
create index if not exists sica_retailers_member_acct_idx on sica_retailers (member_account_number);
create index if not exists sica_retailers_legal_name_idx  on sica_retailers (lower(legal_name));

-- ── SICAdex scores: one snapshot per retailer per month, so local history
--    accrues beyond what the API's 12-mo fields provide ──────────────────────
create table if not exists sica_scores (
  id                    bigint generated always as identity primary key,
  retailer_id           bigint not null references sica_retailers(retailer_id) on delete cascade,
  period                text not null default 'current',   -- 'current' | '12mth'
  as_of                 date not null,                      -- data month (first of month)
  sicadex_cm            numeric,        -- current-month score, 1 best .. 100 worst
  sicadex_avg_12mth     numeric,
  sicadex_variance_smly numeric,        -- vs same month last year (neg = score rising)
  sicadex_variance_pct  numeric,
  sicadex_comparative   numeric,        -- comparative retailers' current-month score
  synced_at             timestamptz not null default now(),
  unique (retailer_id, period, as_of)
);
create index if not exists sica_scores_retailer_idx on sica_scores (retailer_id);

-- ── Dollars overdue / high credit: powers the At-risk KPI + credit reference ─
create table if not exists sica_overdue (
  id                bigint generated always as identity primary key,
  retailer_id       bigint not null references sica_retailers(retailer_id) on delete cascade,
  as_of             date not null,
  total_os          numeric,       -- total debt owed to all members
  overdue_cm        numeric,       -- dollars overdue, current month
  overdue_smly      numeric,       -- dollars overdue, same month last year
  overdue_var_pct   numeric,       -- overduePercentageVarianceSMLY
  my_co_high_credit numeric,       -- Foundry's high credit for the retailer
  member_count      integer,       -- members the retailer has a balance owing to
  synced_at         timestamptz not null default now(),
  unique (retailer_id, as_of)
);

-- ── Sync log: "last synced" timestamp + error surfacing ─────────────────────
create table if not exists sica_sync_log (
  id               bigint generated always as identity primary key,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  status           text not null default 'running',   -- running | ok | error
  retailers_count  integer,
  scores_count     integer,
  message          text
);

-- ── Convenience view: latest current score + overdue per retailer ───────────
create or replace view sica_latest as
select
  r.retailer_id, r.member_account_number, r.legal_name, r.dba,
  r.city, r.province_code, r.country_id,
  s.sicadex_cm, s.sicadex_avg_12mth, s.sicadex_variance_smly, s.sicadex_variance_pct,
  s.sicadex_comparative, s.as_of as score_as_of,
  o.overdue_cm, o.total_os, o.my_co_high_credit, o.member_count,
  greatest(coalesce(s.synced_at, 'epoch'::timestamptz), coalesce(o.synced_at, 'epoch'::timestamptz)) as synced_at
from sica_retailers r
left join lateral (
  select * from sica_scores sc
  where sc.retailer_id = r.retailer_id and sc.period = 'current'
  order by sc.as_of desc limit 1
) s on true
left join lateral (
  select * from sica_overdue ov
  where ov.retailer_id = r.retailer_id
  order by ov.as_of desc limit 1
) o on true;

alter view sica_latest set (security_invoker = on);

-- ── RLS: shared reference data. Any authenticated user may READ; writes happen
--    only via the service role (the sync-sica edge function), which bypasses RLS.
alter table sica_retailers enable row level security;
alter table sica_scores    enable row level security;
alter table sica_overdue   enable row level security;
alter table sica_sync_log  enable row level security;

create policy "Authenticated can read sica_retailers" on sica_retailers for select using (auth.uid() is not null);
create policy "Authenticated can read sica_scores"    on sica_scores    for select using (auth.uid() is not null);
create policy "Authenticated can read sica_overdue"   on sica_overdue   for select using (auth.uid() is not null);
create policy "Authenticated can read sica_sync_log"  on sica_sync_log  for select using (auth.uid() is not null);

-- ── Account ↔ retailer match overrides ──────────────────────────────────────
-- Human-curated refinements over the fuzzy name match. The resolver checks this
-- table first; a row with null retailer_id means "explicitly no match / ignore".
create table if not exists sica_account_matches (
  id           bigint generated always as identity primary key,
  account_key  text not null,          -- app account identifier (recommend the stable account id)
  retailer_id  bigint references sica_retailers(retailer_id) on delete cascade,   -- null = explicit "no match"
  match_source text not null default 'manual',   -- 'manual' | 'fuzzy' | 'ignored'
  confirmed    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (account_key)
);
create index if not exists sica_account_matches_retailer_idx on sica_account_matches (retailer_id);

-- Human-curated → authenticated users may manage matches from the Collections UI.
alter table sica_account_matches enable row level security;
create policy "Authenticated can read sica_account_matches"   on sica_account_matches for select using (auth.uid() is not null);
create policy "Authenticated can insert sica_account_matches" on sica_account_matches for insert with check (auth.uid() is not null);
create policy "Authenticated can update sica_account_matches" on sica_account_matches for update using (auth.uid() is not null);
create policy "Authenticated can delete sica_account_matches" on sica_account_matches for delete using (auth.uid() is not null);
