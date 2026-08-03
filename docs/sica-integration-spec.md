# SICA Integration Spec

Pull retailer credit data (the **SICAdex** score, dollars overdue, high credit) from
the **Sports Industry Credit Association** API into Rep Commish, to power the
Accounts Receivable **Collections** page.

Status: **scaffolded, not yet live.** Blocked on the API password + confirming the
account join key (see [Open questions](#open-questions)).

---

## 1. What SICA gives us

- **Base URL** `https://api.sicaweb.org` · GET · JSON · **HTTP Basic auth**.
- The score is the **SICAdex**: `1` = best, `100` = worst (weighted average of
  members' AR aging on a retailer).
- The API returns **only the retailers Foundry submits AR data for** (the
  file-transfer process). One call returns them all as an array — no per-account
  requests.

### Endpoints (each `{period}` = `current` | `12mth`, `?countryid=1` CA / `2` US)

| Endpoint | Gives | Key fields |
|---|---|---|
| `/retailers/sicadex/{period}` | the score | `sicadexCM`, `sicadexAvg12mth`, `sicadexVarianceSMLY`, `sicadexVariancePercentage`, `sicadexComparativeRetailers` |
| `/retailers/general/{period}` | identity + **join key** | `retailerID`, `accountNumber`, **`memberAccountNumber`** (Foundry's own account # for the retailer), `legalName`, `dbA1`, `city`, `provinceCode` |
| `/retailers/dollars-overdue/{period}` | exposure | `totalOS`, `overdueCM`, `overdueSMLY`, `overduePercentageVarianceSMLY`, `myCoHighCredit`, `memberCount` |
| `/retailers/debt-to-peak/{period}` | deterioration | `debtToPeakCMPercentage`, `debtToPeakVarianceSMLY` |

> **Trend sign:** the spec says a **negative** `sicadexVarianceSMLY` = the score is
> *rising* (worsening). Verify against the SICAWEB portal before trusting the ▲/▼
> arrow direction in the UI.

Authoritative reference: `~/Downloads/sica-api_swagger.yml`.

---

## 2. Authentication & secrets

Basic auth = SICAWEB **username** + a generated **API Password**
(`Authorization: Basic base64(user:pass)`).

Generate the password in SICAWEB → **My Sica → My Company Info/Stats → My
Information → Edit → "Generate a new API Password."**

> Foundry is **SICA member #9200**. The API scopes to the authenticated member
> automatically (username/password) — no member-id parameter is needed on any
> endpoint. 9200 is Foundry's own member number, *not* a retailer's number.

Store as **Supabase secrets** — never in the client bundle (Basic auth must stay
server-side, same as `ANTHROPIC_API_KEY`/`STRIPE_SECRET_KEY`):

```
SICA_USERNAME        = <sicaweb username>
SICA_API_PASSWORD    = <generated API password>
SICA_CRON_SECRET     = <random string>   # optional, authorizes the scheduled sync
```

---

## 3. Data model — `scripts/sica-schema.sql`

Shared **reference** data for Foundry (not per-user): written only by the
`sync-sica` edge function (service role, bypasses RLS), readable by any
authenticated user.

| Table | Purpose | Grain |
|---|---|---|
| `sica_retailers` | identity: `legal_name`/`dba` for name matching (`member_account_number` stored for reference only) | one row per SICA `retailerID` |
| `sica_scores` | SICAdex snapshots | `(retailer_id, period, as_of)` — monthly, so local history accrues |
| `sica_overdue` | dollars overdue / high credit for KPIs | `(retailer_id, as_of)` |
| `sica_account_matches` | human-confirmed / ignored account↔retailer overrides that refine the fuzzy match | one row per app account |
| `sica_sync_log` | powers "last synced" + errors | one row per run |
| `sica_latest` (view) | latest score + overdue per retailer | convenience read for the UI |

---

## 4. Edge function — `supabase/functions/sync-sica`

1. **Authorize**: a scheduled call (matching `x-sica-cron-secret`) **or** a valid
   user JWT (the manual "Refresh scores" button).
2. For each `countryid` (default `2` US; `?countryid=all` for CA+US), fetch
   `general` + `sicadex` + `dollars-overdue` for `current`.
3. Upsert `sica_retailers` (on `retailer_id`), `sica_scores` (on
   `retailer_id,period,as_of`), `sica_overdue` (on `retailer_id,as_of`).
4. Write a `sica_sync_log` row (`ok`/`error`, counts, message).

Deploy: `supabase functions deploy sync-sica`.

---

## 5. Joining SICA → Foundry accounts

**Join on customer name (fuzzy).** SICA account numbers are **not tracked in
QuickBooks or Brightpearl**, so `member_account_number` cannot be the key — it's
stored for reference only. Match SICA `legal_name` / `dba` against the app account
name, reusing the normalization in `PaymentsTracker.jsx` (the same one the
unmatched-invoices banner uses: uppercase, strip "- Contact" suffixes, parens,
punctuation).

Fuzzy matching is imperfect, so it must be **refinable** — resolve in this order:

1. **`sica_account_matches`** override table — a human-confirmed mapping, or an
   explicit "no match" (`retailer_id` null). Wins over fuzzy.
2. **Fuzzy** — normalized `legal_name`/`dba` vs the account name.

The Collections UI lets a user confirm / correct / clear a match, which upserts
`sica_account_matches`, so accuracy improves over time.

> **⚠ To refine (known-imperfect).** Name matching across SICA legal names + QB +
> Brightpearl will miss and collide — chains, DBAs, punctuation, multi-location
> retailers. Planned refinements: a confidence score + review queue, an alias
> table, and revisiting if Brightpearl ever exposes a shared canonical account key.

---

## 6. Sync cadence

SICAdex is **monthly** data (`current` = the current month available). So:

- **Scheduled**: monthly via `pg_cron` + `pg_net`, e.g.
  ```sql
  select cron.schedule('sica-monthly', '0 8 2 * *', $$
    select net.http_post(
      url    := 'https://<project>.functions.supabase.co/sync-sica?countryid=2',
      headers:= '{"x-sica-cron-secret":"<SICA_CRON_SECRET>"}'::jsonb
    );
  $$);
  ```
- **On-demand**: the "Refresh scores" button invokes the function with the user's
  JWT.

The Collections header's "SICA scores synced …" reads the latest `ok`
`sica_sync_log.finished_at`.

---

## 7. UI wiring (next, when the real Collections page is built)

Replace the mockup's hardcoded `sica`/`trend`/`avg` (`ar-collections-mockup.html`)
with values from `sica_latest`, joined to each account:

- score = `sicadex_cm`, 12-mo avg = `sicadex_avg_12mth`, trend = `sicadex_variance_smly`
- At-risk exposure KPI = `overdue_cm` where `sicadex_cm >= threshold`
- High credit (also usable on the credit-reference form) = `my_co_high_credit`
- Accounts with no SICA match render "—", not a fake number.

---

## Open questions

1. **Country**: US-only (`countryid=2`) or any Canadian retailers too?
2. **Sign of `sicadexVarianceSMLY`** for the ▲/▼ arrow — verify vs the portal.
3. SICA **rate limits / quota** (not in the swagger) — confirm with SICA before scheduling.
4. **Match accuracy** (deferred): name matching across SICA / QB / Brightpearl needs a review + override workflow — see §5.
