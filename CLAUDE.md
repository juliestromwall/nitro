# Nitro

Sales & commission tracking app with Supabase backend.

## Domain Context

See `docs/PRODUCT.md` for terminology, user roles, and flows.

## Rules

| Rule | Details |
|------|---------|
| Design | ALWAYS read `DESIGN_RULES.md` before UI changes |
| Features | Update `docs/FEATURES.md` after implementing features |
| Product docs | Update `docs/PRODUCT.md` when adding roles, flows, or terminology |
| Database | All columns use snake_case. RLS is enabled on all tables. |

## Tech & Deploy

- **Stack:** Vite + React + Tailwind CSS v4 + shadcn/ui + Supabase
- **Auth:** Supabase Auth (email/password)
- **Database:** Supabase (PostgreSQL + RLS)
- **Storage:** Supabase Storage (logos public, documents private)
- **Hosting:** Hostinger (static build in `public_html/`)
- **Schema:** `scripts/schema.sql`
- **Seed:** `scripts/seed.js`

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/supabase.js` | Supabase client init |
| `src/lib/db.js` | All Supabase query helpers |
| `src/lib/constants.js` | Regions, account types, item lists |
| `src/context/AuthContext.jsx` | Auth state + signIn/signUp/signOut |
| `src/context/ClientContext.jsx` | Client CRUD via Supabase |
| `src/context/CompanyContext.jsx` | Company CRUD via Supabase |
| `src/context/SalesContext.jsx` | Seasons + Orders + Commissions via Supabase |
| `src/context/TodoContext.jsx` | To-do CRUD via Supabase |
