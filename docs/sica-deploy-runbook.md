# SICA — go-live runbook

The Collections page already reads SICA scores and shows a **"Refresh scores"**
button; it just shows "—" until the backend is deployed and synced once. These are
the one-time steps to make it live. Everything here is done by the Supabase project
owner (Julie); no code changes needed.

## 1. Generate the SICA API password
In **SICAWEB → My Sica → My Company Info/Stats → My Information → Edit → "Generate a
new API Password."** Copy it. (Foundry is SICA member **#9200**; the API scopes to
the authenticated member automatically — no member id is passed.)

## 2. Set the Supabase secrets
Supabase → Project → **Edge Functions → Secrets** (or CLI `supabase secrets set`):

```
SICA_USERNAME     = <your SICAWEB username>
SICA_API_PASSWORD = <the password from step 1>
SICA_CRON_SECRET  = <any random string>   # used only by the scheduled monthly run
```

## 3. Create the tables
Run **`scripts/sica-schema.sql`** in the Supabase SQL editor (creates `sica_retailers`,
`sica_scores`, `sica_overdue`, `sica_account_matches`, `sica_sync_log`, and the
`sica_latest` view, all with authenticated-read RLS).

## 4. Deploy + run the function
```
supabase functions deploy sync-sica
```
Then trigger the first sync — either click **"Refresh scores"** on the Collections
page (runs it with your login), or:
```
curl -X POST 'https://<project-ref>.functions.supabase.co/sync-sica' \
  -H "x-sica-cron-secret: <SICA_CRON_SECRET>"
```
US retailers only by default (`countryid=2`). Scores appear on Collections
immediately after a successful run.

## 5. Schedule the monthly refresh (SICAdex is monthly)
In the Supabase SQL editor (needs `pg_cron` + `pg_net`):

```sql
select cron.schedule('sica-monthly', '0 8 2 * *', $$
  select net.http_post(
    url    := 'https://<project-ref>.functions.supabase.co/sync-sica?countryid=2',
    headers:= '{"x-sica-cron-secret":"<SICA_CRON_SECRET>"}'::jsonb
  );
$$);
```

## After go-live — two things to verify
1. **Trend arrow direction.** The app treats a *negative* `sicadexVarianceSMLY` as
   the score *rising* (worse → red ▲). Confirm that against the SICAWEB portal on a
   known account; if it's backwards, flip `SCORE_ROSE_WHEN_VARIANCE_NEGATIVE` in
   `src/lib/sica.js`.
2. **Match accuracy.** Names are matched fuzzily (SICA legal name / DBA vs. account
   name). Spot-check a few; wrong matches are the Stage C.2 work (a confirm/correct
   UI writing `sica_account_matches`). The resolver already respects that table if
   rows exist.
