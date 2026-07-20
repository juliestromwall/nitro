# Staging Platform

A fully isolated staging environment so migrations, test invites/connections,
and fake users never touch production (`app.repcommish.com` / the `Repcommish`
Supabase project).

```
  nitro-staging.<subdomain>.workers.dev   (staging Worker, no custom domain)
                    │
                    ▼
      Supabase "repcommish-staging"        (separate project)
        • Auth + all data tables
        • connection edge functions only
        • test users: accounting + Adam
        • NO Stripe / email / Google (added later if needed)
```

**Lean scope:** we stand up only what's needed to exercise the accounting↔rep
link and upcoming features. The connection edge functions rely solely on
Supabase's auto-injected `SUPABASE_SERVICE_ROLE_KEY`, so **no third-party
secrets are required**. Billing is bypassed because seeded users are `plan=free`.

---

## One-time setup

### 1. Create the staging Supabase project
Supabase Dashboard → your org → **New project** → name `repcommish-staging`
(pick a region near prod). Note its **project ref** (`Settings → General`) and
**API keys** (`Settings → API`): the anon key and the service-role key.

> CLI alternative: `npx supabase login` then
> `npx supabase projects create repcommish-staging --org-id mytazsqjtqqlyadytpol`

### 2. Bootstrap the database schema
In the staging project's **SQL Editor**, run these files **in order** (paste
each, run, next). On a fresh DB they apply cleanly:

1. `scripts/schema.sql`
2. `supabase/migrations/20260217182415_add_website_column.sql`
3. `supabase/migrations/20260225000000_brand_uploads_unmatched_status.sql`
4. `supabase/migrations/20260226000000_brand_imports_review.sql`
5. `scripts/accounting-connection-migration.sql`

> Want an *exact* clone of prod instead of the maintained snapshot? Use
> `npx supabase db dump --project-ref mybzeehqbecuzjgmxpvn -f scripts/prod-dump.sql`
> and run that in step 2 instead of files 1–4, then run file 5.

### 3. Create storage buckets (optional, for uploads/avatars)
Dashboard → **Storage** → New bucket: `documents` (private) and `avatars`
(public). Not needed for the link itself; needed if you exercise logo/doc uploads.

### 4. Deploy the connection edge functions to staging
```bash
cd ~/Projects/nitro
npx supabase login            # if not already
STAGING_REF=your-staging-ref  # from step 1
npx supabase functions deploy create-accounting-invite --project-ref $STAGING_REF
npx supabase functions deploy accept-accounting-invite --project-ref $STAGING_REF
npx supabase functions deploy get-connected-users       --project-ref $STAGING_REF
```
(Add more functions later as features need them — commission-summary,
sync-google-sheets, etc. — which *do* require their own secrets.)

### 5. Point the staging frontend at staging Supabase
```bash
cp .env.staging.example .env.staging
# edit .env.staging → VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from step 1
```

### 6. Seed test users
```bash
export SUPABASE_SERVICE_KEY="staging-service-role-key"   # from step 1
node scripts/seed-staging.js
```
Creates `accounting-test@repcommish.com / Accounting123!` (accounting) and
`adam@repcommish.com / RepAdam123!` (pro_rep), email-confirmed, plan=free.

---

## Deploy the staging frontend
```bash
npm run deploy:staging
```
Builds with `.env.staging` and deploys the `nitro-staging` Worker. Wrangler
prints the `https://nitro-staging.<subdomain>.workers.dev` URL.

> First deploy needs `npx wrangler login` if you haven't authed wrangler here.

---

## Verify the link end-to-end
1. Open the staging URL, log in as **accounting-test@repcommish.com**.
2. Go to **Connected Reps** (👥) → *Generate link* → copy it.
3. In a separate browser/incognito, log in as **adam@repcommish.com**, paste the
   invite link → "You're connected to accounting!"
4. Back as accounting, confirm you can read Adam's data (add a company/account
   as Adam first if his space is empty).

---

## Ongoing
- **Redeploy staging frontend:** `npm run deploy:staging`
- **Apply a new migration to staging:** run its SQL in the staging SQL Editor
  (do this *before* prod to catch issues).
- **Reset staging data:** truncate tables in the SQL Editor, or re-run
  `seed-staging.js`.

## Not in staging yet (add when a feature needs it)
Stripe (checkout/portal/webhook), email (contact/rep-report/reset), Google
Sheets sync, and the AI commission summary — each needs its own test secrets.
Deploy those functions + set their secrets on the staging project when you
start testing those flows.
